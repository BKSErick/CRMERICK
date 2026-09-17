/**
 * canalWhatsapp.mjs
 * Confere, ANTES de disparar, se o numero gravado no cadastro e mesmo da empresa.
 *
 * Incidente de 14/09/2026: o cadastro da Steel Usinagem (#795) tinha whatsapp_site
 * 551135060774, que o scraper pegou do primeiro wa.me/ do site antigo dela -- sobra de
 * template de agencia apontando pro WhatsApp da G6 Embalagens. A copy inteira da Steel
 * ("Passei pelo site da Steel Usinagem...") chegou na G6. O /chat/check da Uazapi so
 * dizia "existe", e existia mesmo: era o numero certo da empresa errada.
 *
 * O que teria pego: o /chat/details devolve o nome do perfil do WhatsApp (wa_name), e
 * o /chat/check devolve verifiedName pra conta business verificada. "G6 Embalagens"
 * nao tem nenhuma palavra em comum com "Steel Usinagem". Em 25 leads de 14/09, 18
 * tinham nome no perfil, 16 batiam com a empresa e os 2 que nao batiam eram os dois
 * casos errados. Sem nome no perfil (7 de 25) nao da pra afirmar nada, entao segue.
 *
 * Regra: nome do WhatsApp vazio = nao sabe, passa. Nome preenchido sem NENHUM token
 * (>= 3 letras, sem sufixo societario nem preposicao) em comum com deals.company E com
 * cara de empresa (tem palavra de ramo/atividade: embalagens, engenharia, vendas...) =
 * retido pra revisao manual. Nome de PESSOA sem nada em comum passa: e o celular do
 * dono ("Ney" na VS Manutencoes, "Diego Cruz" na MA Manutencao) -- na auditoria de
 * 14/09 eram 31 dos 38 divergentes, e reter esses mataria a fila. Tambem retem numero
 * que o /chat/check diz nao existir: disparar pra numero inexistente e sinal de spam
 * pra plataforma e gastava vaga do teto (Eteman #248 tinha 551234567890, placeholder
 * de template).
 */

const STOPWORDS = new Set([
  "ltda", "me", "mei", "eireli", "epp", "sa", "s/a", "cia", "com", "ind", "e", "de", "da", "do", "das", "dos",
  "em", "para", "por", "o", "a", "os", "as", "um", "uma", "the", "and", "of",
  "industria", "comercio", "servicos", "servico", "empresa", "grupo", "ltda.", "atendimento", "comercial",
  "vendas", "televendas", "escritorio", "oficial", "contato",
]);

// Palavra de ramo/atividade/forma societaria: se o perfil tem uma dessas, e nome de
// empresa, nao de pessoa. Lista fechada por token exato de proposito: prefixo curto
// ("aco", "casa") pegaria sobrenome (Acosta, Casagrande).
const PALAVRAS_DE_EMPRESA = new Set([
  "embalagens", "embalagem", "engenharia", "industrial", "industria", "industrias", "metalurgica", "metalurgicas",
  "metais", "metal", "usinagem", "usinagens", "manutencao", "manutencoes", "instalacao", "instalacoes",
  "refrigeracao", "climatizacao", "automacao", "vendas", "venda", "compras", "comercial", "comercio", "servicos",
  "servico", "solucoes", "acabamentos", "tech", "tecnologia", "house", "ltda", "eireli", "epp", "mei", "mecanica",
  "eletrica", "eletricas", "serralheria", "caldeiraria", "projetos", "distribuidora", "transportes", "logistica",
  "construcoes", "construtora", "ferramentaria", "estamparia", "fundicao", "montagem", "montagens", "equipamentos",
  "maquinas", "pecas", "materiais", "suprimentos", "grupo", "sistemas", "consultoria", "assessoria", "contabilidade",
  "clinica", "farmacia", "loja", "lojas", "store", "shop", "center", "centro", "oficina", "moveis", "inox", "solda",
  "soldas", "pinturas", "grafica", "digital", "marketing", "agencia", "studio", "estudio", "design", "imoveis",
  "seguros", "alimentos", "restaurante", "hotel", "escola", "cursos", "academia", "condicionado", "telecom",
  "seguranca", "eletronica", "elevadores", "hidraulica", "pneumatica", "plasticos", "borrachas", "tintas", "acos",
  "ferro", "madeiras", "vidros", "textil", "uniformes", "brindes", "fabrica", "fabricacao", "producao",
  "representacoes", "atacado", "varejo", "importadora", "exportadora", "atendimento", "televendas", "salao",
]);

export function pareceEmpresa(nomeWpp) {
  return normalizarNome(nomeWpp)
    .split(" ")
    .some((t) => PALAVRAS_DE_EMPRESA.has(t));
}

export function normalizarNome(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s) {
  return normalizarNome(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * true  = algum token da empresa aparece no nome do WhatsApp (ou vice-versa)
 * false = nome preenchido e sem nada em comum
 * null  = nome do WhatsApp vazio, nao da pra dizer
 *
 * Compara tambem sem espaco, porque perfil business costuma vir colado
 * ("deltausinagemindustrial" pra "Delta Usinagem e Manutencao Ltda").
 */
export function nomeBateComEmpresa(nomeWpp, company) {
  const nome = normalizarNome(nomeWpp);
  if (!nome) return null;
  const nomeColado = nome.replace(/\s+/g, "");
  const empresaColada = normalizarNome(company).replace(/\s+/g, "");
  if (!empresaColada) return null;
  for (const t of tokens(company)) if (nomeColado.includes(t)) return true;
  // Sentido inverso so com token maior: "Omega Tech" nao pode passar por causa do
  // "tech" dentro de "Consertech".
  for (const t of tokens(nomeWpp)) if (t.length >= 5 && empresaColada.includes(t)) return true;
  return false;
}

/**
 * Consulta a Uazapi e devolve { existe, nome, verificado, erro }.
 * Qualquer falha de rede/API vira erro=true com existe=null: quem chama decide, mas a
 * regra e NAO bloquear por falha de consulta (rede caindo nao e prova de nada).
 *
 * @param {string} fone
 * @param {{ base: string, token: string, fetchImpl?: typeof fetch }} opts
 */
export async function consultarPerfil(fone, { base, token, fetchImpl = fetch }) {
  const headers = { token, "Content-Type": "application/json" };
  const out = { existe: null, nome: "", verificado: "", erro: false };
  try {
    const chk = await fetchImpl(`${base}/chat/check`, { method: "POST", headers, body: JSON.stringify({ numbers: [fone] }) });
    const lista = await chk.json().catch(() => null);
    const item = Array.isArray(lista) ? lista[0] : lista?.data?.[0] ?? lista?.[0];
    if (!chk.ok || !item) {
      out.erro = true;
    } else {
      out.existe = Boolean(item.isInWhatsapp ?? item.exists ?? item.isWhatsapp ?? item.valid);
      out.verificado = String(item.verifiedName || "").trim();
    }
    if (out.existe !== false) {
      const det = await fetchImpl(`${base}/chat/details`, { method: "POST", headers, body: JSON.stringify({ number: fone, preview: false }) });
      const j = await det.json().catch(() => null);
      if (det.ok && j) out.nome = String(j.wa_name || j.name || j.wa_contactName || "").trim();
      else out.erro = out.erro || !det.ok;
    }
  } catch {
    out.erro = true;
  }
  return out;
}

/**
 * Decide se o lead pode receber mensagem nesse numero.
 * { ok: true }                                  -> segue
 * { ok: false, motivo: "nao_existe" }           -> numero nao esta no WhatsApp
 * { ok: false, motivo: "nome_divergente", nome } -> perfil e de OUTRA EMPRESA
 * { ok: true,  motivo: "perfil_pessoal", nome }  -> nome de pessoa, provavelmente o dono
 */
export function avaliarCanal(perfil, company) {
  if (perfil.existe === false) return { ok: false, motivo: "nao_existe" };
  const nome = perfil.verificado || perfil.nome;
  const bate = nomeBateComEmpresa(nome, company);
  if (bate === false) {
    if (pareceEmpresa(nome)) return { ok: false, motivo: "nome_divergente", nome };
    return { ok: true, motivo: "perfil_pessoal", nome };
  }
  if (bate === true) return { ok: true, motivo: "nome_confere", nome };
  return { ok: true, motivo: perfil.erro ? "consulta_falhou" : "sem_nome", nome };
}

/**
 * @param {string} fone
 * @param {string} company
 * @param {{ base: string, token: string, fetchImpl?: typeof fetch }} opts
 */
export async function conferirCanal(fone, company, opts) {
  const perfil = await consultarPerfil(fone, opts);
  return { ...avaliarCanal(perfil, company), perfil };
}
