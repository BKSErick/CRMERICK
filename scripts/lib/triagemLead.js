/**
 * Triagem de porte e tipo, aplicada ANTES do lead virar elegivel para disparo.
 *
 * Por que existe: a puxada por cidade classifica pelo texto do Maps, entao comercio
 * cai dentro de segmento industrial. Em 06/08/2026 quatro chegaram na fila de disparo
 * de uma cidade so — Pontofrio (loja da rede, segmento "climatizacao" por causa de
 * refrigeracao), Lojas Singer, Office BR Informatica e a ArcelorMittal — e o Singer
 * chegou a receber mensagem. Nenhum e lead de pagina de vendas industrial.
 *
 * A triagem RETEM, nao apaga. Industria grande de verdade (Esmetal, Metaltech) tambem
 * cai aqui, e essa continua sendo lead — so nao entra em disparo automatico com a copy
 * e o preco de operacao pequena. Para liberar um retido, ponha o id em
 * data/triagem-aprovados.json.
 */
const fs = require("fs");
const path = require("path");

// Corte de porte medido na base, nao arbitrado: nos 387 leads de segmento industrial,
// a mediana de avaliacoes e 0, o percentil 99 e 82 e o MAXIMO e 192 (Mac Freios).
// Nenhum lead industrial real chega a 200. Do outro lado da linha: Pontofrio 549,
// Office BR 427, ArcelorMittal 366, clinicas 200 a 2030. O corte separa os dois
// mundos sem tirar da fila nenhum lead bom conhecido.
const AVALIACOES_DE_OUTRO_PORTE = 200;

// Comercio e servico ao consumidor final. O Singer tinha UMA avaliacao, entao porte
// nao pegaria: so o nome denuncia. Lista curta de proposito — termo generico demais
// ("comercial", "industria e comercio") derruba lead bom.
const NOME_DE_COMERCIO =
  /^lojas?\b|magazine|magalu|americanas|havan|casas bahia|ponto ?frio|supermercado|mercadinho|atacad|farmácia|farmacia|drogaria|padaria|panificadora|restaurante|pizzaria|lanchonete|churrascaria|hamburgueria|sorveteria|barbearia|sal[ãa]o de beleza|pet ?shop|papelaria|joalheria|[óo]tica\b|livraria|floricultura|academia\b|escola\b|colégio|colegio|igreja|hotel\b|pousada|imobiliária|imobiliaria/i;

// Rede, franquia e agregador: o site nao e da empresa, e do grupo.
const SITE_DE_REDE = /rede[a-z]*\.com|franquia|associad|\/unidades?\//i;

function carregarAprovados(raiz) {
  try {
    const p = path.join(raiz, "data/triagem-aprovados.json");
    return new Set(JSON.parse(fs.readFileSync(p, "utf8")).map(Number));
  } catch {
    return new Set();
  }
}

/**
 * @returns {{ ok: boolean, motivo: string|null }}
 */
function avaliarLead({ id, company, reviews, siteUrl }, aprovados) {
  if (aprovados && aprovados.has(Number(id))) return { ok: true, motivo: null };
  const nome = String(company || "");
  const n = Number(reviews || 0);
  if (NOME_DE_COMERCIO.test(nome)) return { ok: false, motivo: "comercio/consumo pelo nome" };
  if (SITE_DE_REDE.test(String(siteUrl || ""))) return { ok: false, motivo: "site de rede/franquia" };
  if (n >= AVALIACOES_DE_OUTRO_PORTE) return { ok: false, motivo: `${n} avaliacoes: outro porte` };
  return { ok: true, motivo: null };
}

module.exports = { avaliarLead, carregarAprovados, AVALIACOES_DE_OUTRO_PORTE };
