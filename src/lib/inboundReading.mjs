// Leitura tipada da mensagem de WhatsApp recebida (Story 057).
//
// Antes: o webhook pedia ao modelo "resumo, intencao, objecao e proximo passo" em texto livre,
// e nada no app lia isso. Agora a leitura devolve valores fechados (intencao, objecao) e aponta
// a CARTA do playbook que responde ao lead. O CRM nunca escreve texto pro lead: a carta e o
// texto aprovado em content/sales-playbook.json e o Erick decide se manda.
//
// Regras primeiro (classificador de bot/encaminhamento e sinaisDeSim do playbook); o modelo so
// entra no que sobra, pela decisao tipada (typedDecision.mjs).

import { SALES_PLAYBOOK } from "./salesPlaybook.mjs";
import { decide } from "./typedDecision.mjs";

export const INBOUND_INTENTS = Object.freeze({
  sinal_forte: "reconheceu a friccao ou pediu algo concreto (preco, exemplo, escopo, disse que decide)",
  sinal_fraco: "respondeu por educacao ou so aceitou olhar, sem pedir nada",
  pergunta: "fez uma pergunta sobre o servico, o preco ou como funciona",
  objecao: "levantou um obstaculo sem recusar de vez (preco, ja tem, sem tempo, nao e o decisor)",
  encaminhamento: "passou o contato ou mandou falar com outra pessoa",
  recusa: "disse que nao tem interesse, que nao e o ramo dele ou pediu para parar",
  automatica: "mensagem automatica, bot ou atendente virtual",
  outro: "nada acima se aplica",
});

export const INBOUND_OBJECTIONS = Object.freeze({
  nenhuma: "nao levantou objecao",
  preco: "achou caro ou perguntou se da pra pagar menos",
  ja_tem_fornecedor: "ja tem site, pagina, agencia ou alguem que faz",
  sem_urgencia: "agora nao, mais pra frente, sem tempo",
  decisor_ausente: "nao e quem decide, o dono ou responsavel nao esta",
  sem_interesse: "nao tem interesse",
  fora_icp: "nao e industria, ramo errado ou numero errado",
  outro: "outra objecao",
});

const INTENT_LABELS = {
  sinal_forte: "sinal forte",
  sinal_fraco: "sinal fraco",
  pergunta: "pergunta",
  objecao: "objecao",
  encaminhamento: "encaminhamento",
  recusa: "recusa",
  automatica: "automatica",
  outro: "outro",
};

const CARD_LABELS = {
  msg2: "Msg 2 inteira (sim forte)",
  msg2Ponte: "Msg 2 ponte, sem preco (sim fraco)",
  msg2Preco: "Preco + vaga (sim depois da ponte)",
  naoReconhecimento: "Nao ao reconhecimento",
  naoSemInteresse: "Sem interesse",
  naoJaTem: "Ja tem quem faca",
  naoForaIcp: "Fora do ICP",
  naoEntendi: "Nao entendi",
  retomadaSemPreco: "Retomada com valor",
  retomadaSemPrecoTierA: "Retomada Tier A (proposta, sem preco)",
  pedidoLigacao: "Pediu ligacao",
  tierAOferta: "Tier A: oferta sem preco, proposta para quem decide",
  tierAProposta: "Tier A: proposta a partir da faixa do site",
  nenhuma: "Resposta na mao",
};

// As cartas sao degraus do funil FRIO. Lead ja qualificado, cliente ou negociacao aberta nao
// recebe carta de template: a doutrina manda responder na mao ([FORA DO TEMPLATE]). Medido na
// primeira simulacao (24/09/2026): a Policapsula, cliente com proposta aprovada, pediu "me liga"
// e a leitura sugeriu a msg 2 com preco.
export const COLD_STAGES = Object.freeze(["prospect", "abordado", "followup"]);

function dentroDoFunilFrio(stage) {
  return !stage || COLD_STAGES.includes(String(stage));
}

export function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cartas lidas do playbook, nao do codigo: mudou o playbook, mudou a lista. Chaves com `_`
 * sao notas (ex.: cartas._nota) e ficam de fora.
 */
export function cardCriteria(playbook = SALES_PLAYBOOK) {
  const post = playbook?.postResponse ?? {};
  const cards = {};
  if (post.msg2) cards.msg2 = "sinal FORTE: msg 2 inteira, com preco e vaga de producao";
  if (post.msg2Ponte) cards.msg2Ponte = "sinal FRACO: ponte com o case, ainda sem preco";
  if (post.msg2Preco) cards.msg2Preco = "sim que veio DEPOIS da ponte: agora entra o preco e a vaga";
  // P3 (24/09/2026): lead Tier A (governante) nao recebe a msg 2 de R$1.000.
  if (post.tierA?.oferta) cards.tierAOferta = "sinal FORTE de empresa Tier A (governante): case + proposta escrita para quem decide, sem preco";
  if (post.tierA?.proposta) cards.tierAProposta = "sim de empresa Tier A depois da oferta: proposta a partir da faixa do site e vaga";
  for (const [key, carta] of Object.entries(post.cartas ?? {})) {
    if (key.startsWith("_") || !carta || typeof carta !== "object") continue;
    cards[key] = String(carta.quando ?? key).replace(/\s+/g, " ").slice(0, 240);
  }
  cards.nenhuma = "nenhuma carta do playbook serve; o Erick responde na mao";
  return cards;
}

export function cardLabel(card) {
  return CARD_LABELS[card] ?? String(card ?? "");
}

export function intentLabel(intent) {
  return INTENT_LABELS[intent] ?? String(intent ?? "");
}

function sinais(playbook) {
  const sim = playbook?.postResponse?.sinaisDeSim ?? {};
  return {
    forte: (Array.isArray(sim.forte) ? sim.forte : []).map(foldText).filter(Boolean),
    fraco: (Array.isArray(sim.fraco) ? sim.fraco : []).map(foldText).filter(Boolean),
  };
}

/**
 * Leitura por regra. Devolve null quando a regra nao decide e o modelo precisa entrar.
 * `responseType` vem do classificador do webhook (followup.ts): bot | encaminhamento | humana.
 */
export function readInboundByRules({ text, responseType, stage, playbook = SALES_PLAYBOOK }) {
  const cards = cardCriteria(playbook);
  const pick = (card) => (cards[card] && dentroDoFunilFrio(stage) ? card : "nenhuma");
  if (responseType === "bot") {
    return { intent: "automatica", objection: "nenhuma", card: "nenhuma", evidence: "", decidedBy: "regra" };
  }
  if (responseType === "encaminhamento") {
    return { intent: "encaminhamento", objection: "nenhuma", card: "nenhuma", evidence: "", decidedBy: "regra" };
  }
  // Link sozinho (pasta do Drive, musica, localizacao) nao diz nada sobre interesse. Na primeira
  // simulacao o modelo leu um link do Drive como "sinal forte" e sugeriu a msg 2 com preco.
  if (/^\s*(?:https?:\/\/\S+\s*)+$/i.test(String(text ?? ""))) {
    return { intent: "outro", objection: "nenhuma", card: "nenhuma", evidence: "", decidedBy: "regra" };
  }
  // Desvio da recepcao: "para apresentacoes, setor de compras: Marcio, fulano@empresa". O
  // classificador do webhook nao pega (so conhece frases fixas) e o modelo oscilou entre
  // automatica e sinal fraco na mesma mensagem (Steel Usinagem, 24/09/2026).
  const bruto = String(text ?? "");
  const temContato = /[\w.+-]+@[\w-]+\.[\w.]+/.test(bruto) || /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(bruto);
  if (temContato && /\b(compras|comercial|responsavel|setor|departamento|falar com|contato)\b/.test(foldText(bruto))) {
    return { intent: "encaminhamento", objection: "nenhuma", card: "nenhuma", evidence: "", decidedBy: "regra" };
  }
  const folded = foldText(text);
  if (!folded) return null;
  const { forte, fraco } = sinais(playbook);
  const forteHit = forte.find((frase) => folded.includes(frase));
  if (forteHit) {
    return { intent: "sinal_forte", objection: "nenhuma", card: pick("msg2"), evidence: forteHit, decidedBy: "regra" };
  }
  // Sim fraco so vale para resposta CURTA: "sim" dentro de uma frase longa nao e sinal nenhum.
  if (folded.length <= 30) {
    const fracoHit = fraco.find((frase) => folded === frase || folded.startsWith(`${frase} `));
    if (fracoHit) {
      return { intent: "sinal_fraco", objection: "nenhuma", card: pick("msg2Ponte"), evidence: fracoHit, decidedBy: "regra" };
    }
  }
  return null;
}

/**
 * Leitura completa: regra primeiro, decisao tipada depois.
 * `history` em ordem cronologica: [{ direction: "sent" | "received", content }].
 *
 * @returns {Promise<
 *   | { ok: true, intent, objection, card, evidence, decidedBy: "regra" | "llm", provider?: string, model?: string }
 *   | { ok: false, detail: string }
 * >}
 */
export async function readInboundMessage({ company, stage, history, responseType, playbook = SALES_PLAYBOOK, decideFn = decide, timeoutMs = 20000, signal }) {
  const linhas = (history ?? []).filter((item) => String(item?.content ?? "").trim());
  const doLead = linhas.filter((item) => item.direction !== "sent").map((item) => String(item.content));
  const ultima = doLead.at(-1) ?? "";
  if (!ultima) return { ok: false, detail: "Sem mensagem do lead para ler." };

  const porRegra = readInboundByRules({ text: ultima, responseType, stage, playbook });
  if (porRegra) return { ok: true, ...porRegra };

  const cards = cardCriteria(playbook);
  const { forte, fraco } = sinais(playbook);
  const intents = {
    ...INBOUND_INTENTS,
    sinal_forte: `${INBOUND_INTENTS.sinal_forte}. Exemplos do playbook: ${forte.slice(0, 8).join("; ")}`,
    sinal_fraco: `${INBOUND_INTENTS.sinal_fraco}. Exemplos do playbook: ${fraco.join("; ")}`,
  };
  const result = await decideFn({
    state: {
      empresa: String(company ?? "").slice(0, 120),
      etapa_do_deal: stage ? String(stage) : "desconhecida",
      conversa: linhas.slice(-10).map((item) => `${item.direction === "sent" ? "Erick" : "Lead"}: ${String(item.content).slice(0, 600)}`).join("\n"),
      ultima_mensagem_do_lead: ultima.slice(0, 800),
    },
    questions: {
      intent: { type: "choice", instructions: "O que a ULTIMA mensagem do lead indica?", criteria: intents },
      objection: { type: "choice", instructions: "Qual objecao o lead levantou na conversa?", criteria: INBOUND_OBJECTIONS },
      card: { type: "choice", instructions: "Qual carta do playbook responde a ultima mensagem do lead?", criteria: cards },
    },
    evidence: { from: doLead, instructions: "UMA frase curta copiada literalmente de uma mensagem do LEAD (nunca do Erick) que sustenta a leitura. Se nao houver, string vazia." },
    timeoutMs,
    // Metade do prazo pro OpenRouter gratuito: a primeira simulacao gastou os 25 s inteiros em
    // modelos travados ou com 429 e o Groq de reserva nunca foi tentado.
    perProviderTimeoutMs: Math.round(timeoutMs * 0.5),
    perModelTimeoutMs: Math.min(Math.round(timeoutMs * 0.4), 10000),
    providerPolicy: "free-then-groq",
    signal,
  });
  if (!result.ok) return { ok: false, detail: `${result.reason}: ${result.detail}`.slice(0, 500) };

  const intent = result.answers.intent?.type === "choice" ? result.answers.intent.choice : null;
  if (!intent) return { ok: false, detail: `resposta fora da lista: ${result.invalid.join(", ")}` };
  const objection = result.answers.objection?.type === "choice" ? result.answers.objection.choice : "nenhuma";
  let card = result.answers.card?.type === "choice" ? result.answers.card.choice : "nenhuma";
  // Bot e encaminhamento nunca recebem carta de venda; fora do funil frio, resposta e na mao.
  if (intent === "automatica" || intent === "encaminhamento" || !dentroDoFunilFrio(stage)) card = "nenhuma";
  return { ok: true, intent, objection, card, evidence: result.evidencia, decidedBy: "llm", provider: result.provider, model: result.model };
}

/** Linha em portugues para messages.ai_insight e para a atividade do deal. */
export function renderReadingLine(reading) {
  const partes = [`Leitura: ${intentLabel(reading.intent)}`];
  if (reading.objection && reading.objection !== "nenhuma") partes.push(`objecao: ${reading.objection.replaceAll("_", " ")}`);
  partes.push(`carta: ${cardLabel(reading.card)}`);
  const linha = partes.join(" · ");
  return reading.evidence ? `${linha}\nTrecho do lead: "${String(reading.evidence).slice(0, 200)}"` : linha;
}
