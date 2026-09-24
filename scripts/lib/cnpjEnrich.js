"use strict";

/**
 * cnpjEnrich.js - Enriquecimento por CNPJ e consulta às APIs públicas da Receita.
 *
 * Funcionalidades:
 * 1. Extrai CNPJ do HTML raspado do site (rodapé/contato) com verificação de dígito verificador.
 * 2. Realiza busca de fallback via Serper Search quando o site não divulga o CNPJ.
 * 3. Consulta a API pública MinhaReceita (minhareceita.org) para obter:
 *    - Capital Social & Porte (MEI, ME, EPP, DEMAIS)
 *    - Situação Cadastral (ATIVA, INAPTA, BAIXADA, SUSPENSA)
 *    - CNAE Principal
 *    - Telefones Oficiais da Receita Federal (para suprir números ausentes do Maps)
 *    - QSA (quadro de sócios) -> nome do DECISOR e sua qualificação
 * 4. Cache em disco em .cache/cnpj-json/ com TTL de 30 dias.
 *
 * CAMADA DE DECISOR (08/09/2026):
 * O QSA já vinha na resposta da MinhaReceita e era descartado. Agora ele é lido e o sócio
 * com poder de decisão é eleito por qualificação (49 Sócio-Administrador na frente de 22 Sócio).
 * É o que permite falar com o dono em vez de com a recepção.
 *
 * E-MAIL: a MinhaReceita devolve `email` VAZIO (medido em 6/6 CNPJs da base em 08/09/2026).
 * Quem devolve o e-mail cadastrado na Receita é a ReceitaWS, que por isso virou o fallback
 * e a fonte de e-mail. O fallback anterior (BrasilAPI) responde HTTP 403 e estava morto:
 * quando a MinhaReceita oscilava, o enriquecimento devolvia null em silêncio.
 * ReceitaWS gratuita permite 3 consultas/minuto, então toda chamada passa por uma fila
 * com intervalo mínimo. Por isso o e-mail é OPT-IN (`comEmail`), e não parte do caminho padrão.
 *
 * OPENCNPJ (18/09/2026): api.opencnpj.org devolve o MESMO e-mail da Receita que a ReceitaWS
 * (batido em 3/3 CNPJs da base), mais QSA, telefones, CNAE e porte, em ~500ms e sem limite
 * de 3/min. Virou a fonte de e-mail padrão quando `comEmail` está ligado; a ReceitaWS só
 * entra se a OpenCNPJ falhar E o chamador pedir (`receitaWs: true`). Sem isso, 1000 CNPJs
 * levavam ~6h; agora levam ~10min.
 */

const fs = require("node:fs");
const path = require("node:path");

const CACHE_DIR = path.join(process.cwd(), ".cache", "cnpj-json");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// Sobe quando o FORMATO do objeto cacheado muda. Cache da versao antiga e ignorado e
// refeito, senao os 924 CNPJs ja cacheados nunca ganhariam socios/decisor.
const CACHE_VERSION = 2;

// ReceitaWS gratuita: 3 consultas por minuto. 21s de folga para nao tomar 429.
const RECEITAWS_INTERVALO_MS = Number(process.env.RECEITAWS_INTERVALO_MS || 21000);

function digitos(v) {
  return String(v || "").replace(/\D/g, "");
}

// Algoritmo oficial de validação de dígito verificador do CNPJ
function validarCnpj(valor) {
  const cnpj = digitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  const digitosCnpj = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== Number(digitosCnpj.charAt(0))) return false;

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === Number(digitosCnpj.charAt(1));
}

function formatarCnpj(cnpj) {
  const c = digitos(cnpj);
  if (c.length !== 14) return cnpj;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

function extractCnpjsFromText(text) {
  if (!text) return [];
  const regex = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
  const matches = text.match(regex) || [];
  const validos = new Set();
  for (const m of matches) {
    const limpo = digitos(m);
    if (validarCnpj(limpo)) validos.add(limpo);
  }
  return Array.from(validos);
}

function readCache(cnpj) {
  try {
    const file = path.join(CACHE_DIR, `${digitos(cnpj)}.json`);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return undefined;
    const dados = JSON.parse(fs.readFileSync(file, "utf8"));
    // null cacheado (consulta que falhou) continua valido em qualquer versao.
    if (dados === null) return null;
    if (!dados || dados.cache_version !== CACHE_VERSION) return undefined;
    return dados;
  } catch {
    return undefined;
  }
}

function writeCache(cnpj, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const payload = data === null ? null : { ...data, cache_version: CACHE_VERSION };
    fs.writeFileSync(path.join(CACHE_DIR, `${digitos(cnpj)}.json`), JSON.stringify(payload), "utf8");
  } catch {
    /* cache opcional */
  }
}

// Normaliza o texto de porte da Receita Federal.
// O fallback por capital social so vale quando a Receita NAO disse o porte (vem "00" ou vazio).
// Antes ele rodava sempre que a string nao casava, e "DEMAIS" (porte MAIOR que EPP) era
// rebaixado para "EPP" por capital entre 360k e 4,8M - erro justo nas empresas maiores,
// que sao o alvo do ICP institucional. Caso real: FORMPARTS, capital 1M, porte DEMAIS -> EPP.
function normalizarPorte(porteRaw, capitalSocial) {
  const p = String(porteRaw || "").toUpperCase().trim();
  if (p.includes("MEI") || p === "01") return "MEI";
  if (p.includes("MICRO") || p === "03") return "ME";
  if (p.includes("PEQUENO") || p.includes("EPP") || p === "05") return "EPP";
  if (p.includes("DEMAIS") || p.includes("GRANDE") || p.includes("MEDIO") || p.includes("MÉDIO")) return "DEMAIS";

  // Sem porte declarado: deduz pelo Capital Social.
  const cap = Number(capitalSocial || 0);
  if (cap > 0 && cap <= 81000) return "MEI";
  if (cap > 81000 && cap <= 360000) return "ME";
  if (cap > 360000 && cap <= 4800000) return "EPP";
  if (cap > 4800000) return "DEMAIS";

  return "DEMAIS";
}

// ---------------------------------------------------------------------------
// QSA / decisor
// ---------------------------------------------------------------------------

// Codigos oficiais de qualificacao de socio da Receita. Quanto menor o peso, mais decisor.
// 22 (Socio) entra por ultimo porque socio sem "Administrador" pode ser so cotista.
const PESO_QUALIFICACAO = {
  49: 1, // Sócio-Administrador
  65: 1, // Titular Pessoa Física (empresário individual)
  50: 2, // Empresário
  5: 2, // Administrador
  16: 3, // Presidente
  10: 4, // Diretor
  8: 5, // Conselheiro de Administração
  54: 6, // Fundador
  22: 7, // Sócio
};
const PESO_PADRAO = 9;

// Aceita os dois formatos: MinhaReceita ({nome_socio, codigo_qualificacao_socio}) e
// ReceitaWS ({nome, qual: "49-Sócio-Administrador"}).
function normalizarSocios(qsaBruto) {
  if (!Array.isArray(qsaBruto)) return [];
  const socios = [];
  for (const s of qsaBruto) {
    if (!s) continue;
    const nome = String(s.nome_socio || s.nome || "").trim();
    if (!nome) continue;

    let codigo = s.codigo_qualificacao_socio;
    let texto = s.qualificacao_socio || s.qual || "";
    if (codigo === undefined || codigo === null) {
      const m = String(texto).match(/^(\d+)/);
      codigo = m ? Number(m[1]) : null;
    }
    texto = String(texto).replace(/^\d+\s*-\s*/, "").trim();

    // identificador_de_socio: 1 = pessoa juridica, 2 = pessoa fisica.
    // Holding nao atende telefone; para decisor queremos pessoa fisica.
    const identificador = s.identificador_de_socio ?? s.identificador_socio ?? null;
    const pessoaJuridica = identificador === 1 || /\bLTDA\b|\bS\/?A\b|\bEIRELI\b|\bME\b$/i.test(nome);

    socios.push({
      nome,
      qualificacao_codigo: codigo === null || Number.isNaN(codigo) ? null : Number(codigo),
      qualificacao: texto || null,
      data_entrada: s.data_entrada_sociedade || s.data_entrada || null,
      pessoa_juridica: Boolean(pessoaJuridica),
    });
  }
  return socios;
}

// Elege UM decisor: pessoa fisica, menor peso de qualificacao e, em empate, o mais antigo
// na sociedade (quem esta la ha mais tempo e quem manda).
function escolherDecisor(socios) {
  const candidatos = socios.filter((s) => !s.pessoa_juridica);
  const lista = candidatos.length > 0 ? candidatos : socios;
  if (lista.length === 0) return null;

  const ordenados = [...lista].sort((a, b) => {
    const pa = PESO_QUALIFICACAO[a.qualificacao_codigo] ?? PESO_PADRAO;
    const pb = PESO_QUALIFICACAO[b.qualificacao_codigo] ?? PESO_PADRAO;
    if (pa !== pb) return pa - pb;
    return String(a.data_entrada || "9999").localeCompare(String(b.data_entrada || "9999"));
  });
  return ordenados[0];
}

// Empresário individual costuma vir com QSA vazio: o dono é a própria razão social,
// que na Receita é o nome da pessoa física. Sem isso, MEI/EI ficariam sem decisor.
function decisorDeEmpresarioIndividual(payload) {
  const natureza = String(payload.codigo_natureza_juridica || payload.natureza_juridica || "");
  const ehEI = /^2135/.test(natureza) || /empres[áa]rio\s*\(?\s*individual/i.test(natureza);
  if (!ehEI) return null;
  // Razão social de EI vem com o CPF colado na frente ("32.962.717 VRADIMIR ALEXANDRE").
  // Sem tirar, o "nome do decisor" chega na mensagem com número junto.
  const nome = String(payload.razao_social || "")
    .replace(/^[\d.\-/\s]+/, "")
    .trim();
  if (!nome) return null;
  return { nome, qualificacao_codigo: 65, qualificacao: "Titular Pessoa Física", data_entrada: null, pessoa_juridica: false };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

function coletarTelefones(payload) {
  const phones = [];
  const pushPhone = (ddd, num) => {
    const d = digitos(`${ddd || ""}${num || ""}`);
    if (d.length >= 10 && d.length <= 11 && !phones.includes(`55${d}`)) {
      phones.push(`55${d}`);
    }
  };
  if (payload.ddd_telefone_1) pushPhone(payload.ddd_1, payload.ddd_telefone_1);
  if (payload.ddd_telefone_2) pushPhone(payload.ddd_2, payload.ddd_telefone_2);
  if (payload.ddd_fax) pushPhone(payload.ddd_fax_1, payload.ddd_fax);
  if (payload.telefone_1) pushPhone("", payload.telefone_1);
  // ReceitaWS entrega "(31) 9988-4574" ou "(31) 9988-4574 / (31) 3821-0000" em telefone.
  if (payload.telefone) {
    for (const parte of String(payload.telefone).split("/")) pushPhone("", parte);
  }
  return phones;
}

function montarDados(cnpj, payload, origem) {
  let socios = normalizarSocios(payload.qsa);
  if (socios.length === 0) {
    const ei = decisorDeEmpresarioIndividual(payload);
    if (ei) socios = [ei];
  }
  const decisor = escolherDecisor(socios);
  const email = payload.email ? String(payload.email).toLowerCase().trim() : null;

  return {
    cnpj: formatarCnpj(cnpj),
    cnpj_limpo: cnpj,
    razao_social: payload.razao_social || payload.nome || payload.social_reason || null,
    nome_fantasia: payload.nome_fantasia || payload.fantasia || payload.commercial_name || null,
    situacao_cadastral: String(
      payload.descricao_situacao_cadastral || payload.situacao_cadastral || payload.situacao || "ATIVA",
    ).toUpperCase(),
    capital_social: Number(payload.capital_social || 0),
    porte: normalizarPorte(payload.porte || payload.descricao_porte, payload.capital_social),
    cnae_principal: payload.cnae_fiscal
      ? String(payload.cnae_fiscal)
      : payload.cnae_principal_codigo
        ? String(payload.cnae_principal_codigo)
        : payload.atividade_principal?.[0]?.code
          ? digitos(payload.atividade_principal[0].code)
          : null,
    cnae_descricao:
      payload.cnae_fiscal_descricao ||
      payload.cnae_principal_descricao ||
      payload.atividade_principal?.[0]?.text ||
      null,
    data_inicio_atividade: payload.data_inicio_atividade || payload.abertura || null,
    municipio: payload.municipio || null,
    uf: payload.uf || null,
    receita_phones: coletarTelefones(payload),
    email_receita: email && email.includes("@") ? email : null,
    socios,
    decisor_nome: decisor?.nome || null,
    decisor_qualificacao: decisor?.qualificacao || null,
    fonte_cnpj: origem,
  };
}

let ultimaChamadaReceitaWs = 0;
async function aguardarVezReceitaWs() {
  const espera = ultimaChamadaReceitaWs + RECEITAWS_INTERVALO_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaChamadaReceitaWs = Date.now();
}

async function fetchReceitaWs(cnpj, timeoutMs) {
  await aguardarVezReceitaWs();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return null;
    const payload = await res.json().catch(() => null);
    if (!payload || String(payload.status).toUpperCase() === "ERROR") return null;
    return payload;
  } catch {
    return null;
  }
}

// OpenCNPJ escreve a qualificacao do socio por extenso, sem o codigo. Mapeia para o codigo
// oficial, senao todo socio cai em PESO_PADRAO e o decisor vira sorteio.
const QUALIFICACAO_TEXTO_PARA_CODIGO = [
  [/s[oó]cio[\s-]*administrador/i, 49],
  [/titular pessoa f[ií]sica/i, 65],
  [/^empres[aá]rio/i, 50],
  [/^administrador/i, 5],
  [/^presidente/i, 16],
  [/^diretor/i, 10],
  [/conselheiro de administra/i, 8],
  [/^fundador/i, 54],
  [/^s[oó]cio$/i, 22],
];

function codigoDeQualificacaoTexto(texto) {
  const t = String(texto || "").trim();
  for (const [re, codigo] of QUALIFICACAO_TEXTO_PARA_CODIGO) if (re.test(t)) return codigo;
  return null;
}

// Traduz o payload da OpenCNPJ para o formato que montarDados() ja entende (o da
// MinhaReceita/ReceitaWS). Capital vem "100000,00" (string com virgula) e os telefones vem
// em lista {ddd, numero}; sem esta traducao o porte cairia em NaN e o telefone se perderia.
function adaptarOpenCnpj(p) {
  if (!p || !p.cnpj) return null;
  const capital = Number(String(p.capital_social || "0").replace(/\./g, "").replace(",", "."));
  const principal = (p.cnaes || []).find((c) => c && c.is_principal) || null;
  const telefone = (p.telefones || [])
    .filter((t) => t && !t.is_fax && t.numero)
    .map((t) => `(${t.ddd || ""}) ${t.numero}`)
    .join(" / ");
  return {
    razao_social: p.razao_social || null,
    nome_fantasia: p.nome_fantasia || null,
    situacao_cadastral: p.situacao_cadastral || "ATIVA",
    capital_social: Number.isFinite(capital) ? capital : 0,
    porte: p.porte_empresa || null,
    cnae_fiscal: p.cnae_principal || null,
    cnae_fiscal_descricao: principal ? principal.descricao : null,
    natureza_juridica: p.natureza_juridica || null,
    data_inicio_atividade: p.data_inicio_atividade || null,
    municipio: p.municipio || null,
    uf: p.uf || null,
    email: p.email || null,
    telefone: telefone || null,
    qsa: (p.QSA || p.qsa || []).map((s) => ({
      nome_socio: s.nome_socio,
      codigo_qualificacao_socio: codigoDeQualificacaoTexto(s.qualificacao_socio),
      qualificacao_socio: s.qualificacao_socio,
      data_entrada_sociedade: s.data_entrada_sociedade,
      identificador_de_socio: /jur[ií]dica/i.test(String(s.identificador_socio || "")) ? 1 : 2,
    })),
  };
}

// api.opencnpj.org: base publica da Receita, com e-mail. Sem fila: em 18/09/2026 respondeu
// 6/6 em ~500ms sem 429 (a cnpj.ws, testada junto, bloqueou na 4a chamada).
async function fetchOpenCnpj(cnpj, timeoutMs = 8000) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`https://api.opencnpj.org/${cnpj}`, {
        signal: controller.signal,
        headers: { "User-Agent": "CRM-Erick-LeadBot/1.0" },
      }).catch(() => null);
      clearTimeout(timer);
      if (!res) return null;
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
        continue;
      }
      if (!res.ok) return null;
      const payload = await res.json().catch(() => null);
      return adaptarOpenCnpj(payload);
    } catch {
      return null;
    }
  }
  return null;
}

// MinhaReceita e mais completa; das outras fontes aproveitamos so o que faltou.
function mesclarComplemento(dados, extra) {
  if (!extra) return dados;
  if (!dados) return extra;
  dados.email_receita = dados.email_receita || extra.email_receita;
  if (dados.socios.length === 0 && extra.socios.length > 0) {
    dados.socios = extra.socios;
    dados.decisor_nome = extra.decisor_nome;
    dados.decisor_qualificacao = extra.decisor_qualificacao;
  }
  for (const p of extra.receita_phones) {
    if (!dados.receita_phones.includes(p)) dados.receita_phones.push(p);
  }
  dados.municipio = dados.municipio || extra.municipio;
  dados.uf = dados.uf || extra.uf;
  return dados;
}

/**
 * Consulta o CNPJ. Mantém o nome antigo por compatibilidade com os chamadores.
 *
 * @param {string} cnpjLimpo
 * @param {number|object} opcoes  número = timeoutMs (assinatura antiga) ou { timeoutMs, comEmail, receitaWs }
 *   comEmail: true busca o e-mail cadastrado na Receita quando a MinhaReceita não trouxe:
 *     primeiro na OpenCNPJ (rápida), depois na ReceitaWS SE `receitaWs: true`.
 *   receitaWs: liga o fallback lento (~21s por CNPJ, 3/min). Default true para não mudar o
 *     comportamento do enrich-decisores; o colhedor de e-mails passa false e roda em minutos.
 */
async function fetchCnpjMinhaReceita(cnpjLimpo, opcoes = {}) {
  const cfg = typeof opcoes === "number" ? { timeoutMs: opcoes } : opcoes || {};
  const timeoutMs = cfg.timeoutMs || 5000;
  const comEmail = Boolean(cfg.comEmail);
  const usarReceitaWs = cfg.receitaWs !== false;

  const cnpj = digitos(cnpjLimpo);
  if (!validarCnpj(cnpj)) return null;

  // Cache sem e-mail so e reaproveitado quando (a) ninguem pediu e-mail ou (b) as fontes
  // de e-mail que este chamador aceita ja foram tentadas (`email_esgotado` guarda a mais
  // funda que rodou: "opencnpj" ou "receitaws"); senao refaz a consulta.
  const cached = readCache(cnpj);
  if (cached !== undefined) {
    const faltaEmail = comEmail && cached && !cached.email_receita;
    const esgotado = cached && (cached.email_esgotado === "receitaws" || (cached.email_esgotado === "opencnpj" && !usarReceitaWs));
    if (!faltaEmail || esgotado) return cached;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`https://minhareceita.org/${cnpj}`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timer);

    let dados = null;
    if (res && res.ok) {
      const payload = await res.json().catch(() => null);
      if (payload && !payload.message) dados = montarDados(cnpj, payload, "minhareceita");
    }

    // Fonte de e-mail (e fallback geral): OpenCNPJ.
    let tentouOpen = false;
    if (!dados || (comEmail && !dados.email_receita)) {
      tentouOpen = true;
      const payloadOpen = await fetchOpenCnpj(cnpj, Math.max(timeoutMs, 8000));
      if (payloadOpen) dados = mesclarComplemento(dados, montarDados(cnpj, payloadOpen, "opencnpj"));
    }

    // Ultimo recurso: ReceitaWS (lenta). A BrasilAPI, que ocupava este lugar,
    // responde 403 e nunca funcionou como fallback de verdade.
    let tentouWs = false;
    if (usarReceitaWs && (!dados || (comEmail && !dados.email_receita))) {
      tentouWs = true;
      const payloadWs = await fetchReceitaWs(cnpj, Math.max(timeoutMs, 10000));
      if (payloadWs) dados = mesclarComplemento(dados, montarDados(cnpj, payloadWs, "receitaws"));
    }

    if (dados && comEmail && !dados.email_receita && tentouOpen) {
      dados.email_esgotado = tentouWs ? "receitaws" : "opencnpj";
    }

    writeCache(cnpj, dados);
    return dados;
  } catch {
    writeCache(cnpj, null);
    return null;
  }
}

// Fallback via Serper Search: busca o CNPJ da empresa no Google se o site não tiver
async function searchCnpjViaSerper(companyName, city, uf, serperClient) {
  if (!serperClient || !companyName) return null;
  try {
    const q = `"${companyName}" "${city || ""}" CNPJ`;
    const res = await serperClient.search({ q, num: 3 });
    const organic = res.organic || [];
    for (const item of organic) {
      const text = `${item.title || ""} ${item.snippet || ""}`;
      const cnpjs = extractCnpjsFromText(text);
      if (cnpjs.length > 0) {
        const dados = await fetchCnpjMinhaReceita(cnpjs[0]);
        if (dados) return dados;
      }
    }
  } catch {
    /* fallback sem erro */
  }
  return null;
}

module.exports = {
  validarCnpj,
  formatarCnpj,
  extractCnpjsFromText,
  fetchCnpjMinhaReceita,
  fetchOpenCnpj,
  searchCnpjViaSerper,
  normalizarPorte,
  normalizarSocios,
  escolherDecisor,
  CACHE_VERSION,
};
