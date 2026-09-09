/**
 * qualificar-destinatario.mjs
 * Decide se um e-mail vindo da Receita Federal é REALMENTE do decisor/da empresa,
 * ou se é de um terceiro que fez o cadastro (contador, advogado, assessoria).
 *
 * Por que existe: medido em 08/09/2026 nos 13 leads de saúde do CRM, 6 dos 12 e-mails
 * devolvidos pela ReceitaWS eram de escritório contábil ou advogado, não da clínica
 * (`processos@racontabil.com.br`, `conquista.contabil@terra.com.br`, `nssolucoescont@gmail.com`,
 * `escritab_bh@hotmail.com`, `adv.jeovanirocha@gmail.com`, `gerencia@jbw.com.br`).
 * O contador é quem abre o CNPJ, então o e-mail cadastrado costuma ser dele.
 * Em indústria o viés é o oposto: veio `arnoldo.oliveira@formparts.com.br`, o próprio sócio.
 *
 * Mandar a copy personalizada ("Olá, Ernani") para o contador é pior que não mandar:
 * chega na pessoa errada e o vocativo denuncia que o disparo é automático.
 */

const TERCEIRO = [
  /contab/i, /contabil/i, /\bcont\b/i, /escritcont/i, /escritab/i, /\bescrit/i,
  /\badv\b/i, /advocacia/i, /advogad/i, /juridic/i,
  /assessoria/i, /consultori/i, /\bcrc\b/i, /fiscal/i, /tribut/i,
];

const GENERICO_EMPRESA = /^(contato|comercial|atendimento|financeiro|adm|administracao|faleconosco|sac|vendas|recepcao|clinica|secretaria)$/i;

const PARADAS = new Set([
  "clinica", "clinicas", "consultorio", "odontologico", "odontologica", "odonto", "grupo",
  "instituto", "centro", "ltda", "epp", "eireli", "the", "com", "servicos", "servico",
  "industria", "industrial", "comercio", "e", "de", "da", "do", "dos", "das", "em",
  "especializado", "especializada", "dra", "dr", "sa",
]);

function semAcento(v) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokens(texto) {
  return semAcento(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !PARADAS.has(t));
}

function dominioDe(url) {
  const m = String(url || "").match(/^(?:https?:\/\/)?(?:www\.)?([^/:?#]+)/i);
  return m ? m[1].toLowerCase() : "";
}

/**
 * @returns {{classe:'decisor'|'empresa'|'terceiro'|'incerto', motivo:string, enviar:boolean}}
 */
export function qualificar({ email, decisorNome, empresa, siteUrl }) {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return { classe: "incerto", motivo: "sem e-mail", enviar: false };

  const [local, dominio] = e.split("@");
  const localLimpo = semAcento(local);

  // 1. Terceiro tem prioridade: se cheira a contador ou advogado, nao vai, ponto.
  for (const re of TERCEIRO) {
    if (re.test(localLimpo) || re.test(dominio)) {
      return { classe: "terceiro", motivo: `padrao de terceiro em "${re.test(dominio) ? dominio : local}"`, enviar: false };
    }
  }

  const nomesDecisor = tokens(decisorNome).filter((t) => !["filho", "junior", "neto", "sobrinho"].includes(t));
  const nomesEmpresa = tokens(empresa);
  const dominioSite = dominioDe(siteUrl);

  // 2. Dominio proprio da empresa e o sinal mais forte que existe.
  const dominioProprio = dominioSite && (dominio === dominioSite || dominioSite.endsWith(`.${dominio}`) || dominio.endsWith(`.${dominioSite}`));
  if (dominioProprio) {
    const bateNome = nomesDecisor.some((t) => localLimpo.includes(t));
    return bateNome
      ? { classe: "decisor", motivo: `dominio da empresa + nome do decisor`, enviar: true }
      : { classe: "empresa", motivo: `dominio da empresa`, enviar: true };
  }

  // 3. Nome do decisor no endereco.
  if (nomesDecisor.some((t) => localLimpo.includes(t))) {
    return { classe: "decisor", motivo: `nome do decisor no endereco`, enviar: true };
  }

  // 4. Nome da empresa no endereco ou no dominio.
  if (nomesEmpresa.some((t) => localLimpo.includes(t) || dominio.includes(t))) {
    return { classe: "empresa", motivo: `nome da empresa no endereco`, enviar: true };
  }

  // 5. Caixa generica de empresa em dominio proprio (nao freemail) ainda serve.
  const FREEMAIL = /^(gmail|hotmail|outlook|yahoo|live|bol|uol|terra|ig|globo|icloud|msn)\./;
  if (GENERICO_EMPRESA.test(local) && !FREEMAIL.test(dominio)) {
    return { classe: "empresa", motivo: `caixa institucional em dominio proprio`, enviar: true };
  }

  return { classe: "incerto", motivo: `nao bate com decisor nem com a empresa`, enviar: false };
}
