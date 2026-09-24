/**
 * Gate de texto da prospeccao (Story 063: P5 bloqueios automaticos + P6 gate Willian Celso).
 *
 * Nenhum texto de WhatsApp era conferido antes de sair: o `proibido` do playbook so ia para
 * prompt de IA, e o M2 carregava "Se quiser ver como ficou" e dois cases na mesma mensagem.
 * Este modulo e puro (sem rede, sem banco) e roda igual no app, nos scripts e nos testes.
 *
 * Cada mensagem recebe os oito criterios do Willian Celso como `ok`, `falha` ou `manual`:
 *   - `falha` reprova a mensagem (qualquer "nao" do gate reprova);
 *   - `manual` e criterio que regex nao decide com seguranca; so passa com confirmacao
 *     humana registrada na auditoria do piloto (P8), nunca por padrao.
 *
 * Palavras a evitar vem do brandbook a cada import (doutrina viva), nao de lista no codigo.
 */

import BRANDBOOK from "../../content/brandbook.json" with { type: "json" };

export function dobrar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Degraus em que o Mago demonstra: preco ali quebra a regra do palco. */
export const DEGRAUS_MAGO = new Set([
  "msg1",
  "M1",
  "M2",
  "M3",
  "bot",
  "msg2Ponte",
  "naoReconhecimento",
  "naoSemInteresse",
  "naoJaTem",
  "naoEntendi",
  "naoForaIcp",
  "pedidoLigacao",
  "referredDecisionMaker",
  "humanGatekeeper",
  "forwardable",
  "centralOpening",
  "botName",
  "botClose",
  "tierAOferta",
]);

/** P5: bloqueios literais. Pedido de licenca ou desculpa tira o Governante da mesa. */
const PEDE_LICENCA = [
  [/faz sentido/, "\"faz sentido?\" pede permissao"],
  [/quer ver\b/, "\"quer ver?\" pede permissao"],
  [/posso te (mostrar|mandar|enviar)/, "\"posso te mostrar?\" pede permissao"],
  [/\bse quiser\b/, "\"se quiser\" devolve a decisao pro lead"],
  [/quer (dar uma olhada|que eu (te )?mand)/, "oferta condicionada ao lead querer"],
  [/pode ser\s*\?/, "\"pode ser?\" pede aprovacao"],
  [/\btopa\s*\?/, "\"topa?\" derruba a autoridade"],
  [/\bfoi mal\b|\bdesculp/, "pedido de desculpa: Governante corrige o estado, nao pede absolvicao"],
  [/nao quero (te )?(incomodar|atrapalhar)|sem compromisso/, "linguagem de quem pede licenca"],
];

const ELOGIO_GENERICO = [
  /operacao de verdade/,
  /trabalho (incrivel|excelente|sensacional|impecavel)/,
  /(otimo|belo|lindo) trabalho/,
  /empresa (incrivel|sensacional|excelente|de respeito)/,
  /parabens (pelo|pela|por)/,
  /referencia no mercado/,
];

const TERMOS_MORTOS = [
  [/ficha de escopo/, "\"Ficha de Escopo\" e termo morto (o mecanismo e Pedido Pronto)"],
  [/\breuni[aã]o\b|\bcall\b|\bagendar\b|\bagendamento\b|\bhorario\b/, "reuniao, call, agendamento ou horario como CTA de lead frio"],
  [/\bmanutencao\b[^.?!]{0,40}(mensal|por mes|\/mes)|(mensal|por mes|\/mes)[^.?!]{0,40}\bmanutencao\b/, "\"manutencao\" pro mensal"],
  [/landing page|pagina de vendas/, "mercadoria de infoproduto (landing page / pagina de vendas)"],
  [/te mostro em \d+ ?min/, "\"te mostro em 15 min\" e termo morto"],
];

/** Mecanismo ou consequencia que justificam "presenca digital" na mesma mensagem. */
const MECANISMO_OU_CONSEQUENCIA = /pedido pronto|pedido|orcamento|cotacao|indicacao|triagem|quem (chama|chega|pesquisa)|cliente (informa|chega|procura)|nao chega|ida e volta/;

/** Operacao do lead nomeada na lingua dele: prova que entendemos o que ele faz. */
const OPERACAO = /servico|equipamento|medida|prazo|urgencia|orcamento|peca|material|usinag|caldeirar|manutencao industrial|metalurg|fabrica|producao|maquina|indicacao|pedido/;

const PRECO = /r\$\s*\d|\{\{setupprice\}\}|\{\{monthlyprice\}\}|\d[\d.]*\s*(reais|\/\s*mes)|\ba partir de \d/;

const EMOJI = /\p{Extended_Pictographic}/u;
const SHOW = /\bshow\b/;
const TRAVESSAO = /—/;

/** Cases que a Mydrion cita. Mais de um na mesma mensagem tira o foco (um arquetipo, uma prova). */
const CASES = [
  ["metalthec", /metalthec/],
  ["jotta", /\bjotta\b/],
  ["gt house", /gt ?house/],
];

function palavrasDoBrandbook() {
  const secoes = Array.isArray(BRANDBOOK?.sections) ? BRANDBOOK.sections : [];
  const itens = [];
  for (const secao of secoes) {
    for (const coluna of secao?.columns ?? []) {
      if (!/palavras a evitar/i.test(String(coluna?.title ?? ""))) continue;
      for (const item of coluna.items ?? []) {
        // "Sob medida usado sozinho, sem dizer para que problema" e regra de contexto, nao palavra.
        if (/usado sozinho/i.test(item)) continue;
        const termo = dobrar(String(item).split("(")[0]).trim();
        if (termo) itens.push(termo);
      }
    }
  }
  return itens;
}

const PALAVRAS_EVITADAS = palavrasDoBrandbook();

export function casesCitados(texto) {
  const t = dobrar(texto);
  return CASES.filter(([, padrao]) => padrao.test(t)).map(([nome]) => nome);
}

function criterio(id, titulo, status, motivo) {
  return { id, titulo, status, motivo };
}

/**
 * @param {string} texto mensagem ja renderizada (ou template com placeholders)
 * @param {{ tier?: string|null, degrau?: string|null }} contexto
 */
export function auditarCopy(texto, contexto = {}) {
  const bruto = String(texto ?? "");
  const t = dobrar(bruto);
  const tierA = contexto.tier === "governante";
  const degrauMago = DEGRAUS_MAGO.has(String(contexto.degrau ?? ""));
  const violacoes = [];

  const licenca = PEDE_LICENCA.filter(([padrao]) => padrao.test(t)).map(([, motivo]) => motivo);
  const elogio = ELOGIO_GENERICO.some((padrao) => padrao.test(t));
  const mortos = TERMOS_MORTOS.filter(([padrao]) => padrao.test(t)).map(([, motivo]) => motivo);
  const evitadas = PALAVRAS_EVITADAS.filter((termo) => t.includes(termo));
  const cases = casesCitados(bruto);
  const temPreco = PRECO.test(t);
  const presencaSolta = /presenca digital/.test(t) && !MECANISMO_OU_CONSEQUENCIA.test(t);
  const emojiOuShow = EMOJI.test(bruto) || SHOW.test(t);
  const travessao = TRAVESSAO.test(bruto);

  const c1 = MECANISMO_OU_CONSEQUENCIA.test(t)
    ? criterio("cercadinho", "O cercadinho esta visivel?", "ok", "nomeia o problema que a Mydrion resolve")
    : criterio("cercadinho", "O cercadinho esta visivel?", "manual", "nao nomeia pedido, orcamento ou triagem: conferir se o limite do servico aparece");

  const c2 = OPERACAO.test(t)
    ? criterio("operacao", "A mensagem prova que entendemos a operacao?", "ok", "cita a operacao na lingua do lead")
    : criterio("operacao", "A mensagem prova que entendemos a operacao?", "manual", "nenhum termo da operacao do lead: conferir na auditoria");

  const c3 = elogio
    ? criterio("observacao", "Existe observacao especifica ou apenas elogio?", "falha", "elogio generico no lugar de observacao")
    : criterio("observacao", "Existe observacao especifica ou apenas elogio?", "ok", "sem elogio generico");

  const simbolo = [
    ...evitadas.map((termo) => `palavra a evitar do brandbook: "${termo}"`),
    ...(tierA && emojiOuShow ? ["emoji ou \"show\" com empresa Tier A"] : []),
  ];
  const c4 = simbolo.length
    ? criterio("simbolo", "O simbolo e de ordem, capacidade e controle?", "falha", simbolo.join("; "))
    : criterio("simbolo", "O simbolo e de ordem, capacidade e controle?", "ok", "sem simbolo de agencia, hype ou informalidade");

  const c5 = cases.length >= 2
    ? criterio("palco", "Ha somente um arquetipo no palco?", "falha", `${cases.length} cases na mesma mensagem (${cases.join(", ")})`)
    : criterio("palco", "Ha somente um arquetipo no palco?", "ok", cases.length ? `um case (${cases[0]})` : "sem case");

  const c6 = degrauMago && temPreco
    ? criterio("mago", "O Mago demonstra sem falar de preco?", "falha", `preco no degrau de demonstracao (${contexto.degrau})`)
    : criterio("mago", "O Mago demonstra sem falar de preco?", "ok", degrauMago ? "degrau de demonstracao sem preco" : "degrau de condicao (Governante)");

  const c7 = licenca.length
    ? criterio("governante", "O Governante apresenta condicao sem pedir licenca?", "falha", licenca.join("; "))
    : criterio("governante", "O Governante apresenta condicao sem pedir licenca?", "ok", "sem pedido de permissao ou desculpa");

  const dono = [
    ...mortos,
    ...(travessao ? ["travessao em copy"] : []),
    ...(presencaSolta ? ["\"presenca digital\" sem mecanismo ou consequencia"] : []),
  ];
  const c8 = dono.length
    ? criterio("dono", "A mensagem parece dono falando com dono?", "falha", dono.join("; "))
    : criterio("dono", "A mensagem parece dono falando com dono?", "ok", "linguagem de dono");

  const criterios = [c1, c2, c3, c4, c5, c6, c7, c8];
  for (const item of criterios) if (item.status === "falha") violacoes.push(`${item.id}: ${item.motivo}`);

  return {
    aprovado: violacoes.length === 0,
    pendenteManual: criterios.filter((item) => item.status === "manual").map((item) => item.id),
    criterios,
    violacoes,
    cases,
  };
}

/** Texto curto para log de CLI: "OK", "MANUAL(cercadinho)" ou "REPROVADO: ...". */
export function resumoGate(resultado) {
  if (!resultado.aprovado) return `REPROVADO: ${resultado.violacoes.join(" | ")}`;
  if (resultado.pendenteManual.length) return `MANUAL(${resultado.pendenteManual.join(",")})`;
  return "OK";
}

const copyGate = { auditarCopy, casesCitados, dobrar, resumoGate, DEGRAUS_MAGO };
export default copyGate;
