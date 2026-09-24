/**
 * classify-icp.mjs
 * Marca cada deal como dentro ou fora do ICP, numa dimensao SEPARADA do segmento.
 *
 * POR QUE EXISTE: segmento diz o que a empresa FAZ; ICP diz se ela TEM o problema.
 * Tratar os dois como a mesma coisa distorceu decisao de alocacao real. Em 14/08 o
 * relatorio mostrava caldeiraria com 14 abordados e 0 respostas, e a leitura obvia
 * era "congelar o segmento". Mas o balde tem serralheria, calhas e moveis
 * industriais dentro — empresas sem orcamento tecnico variavel, que nunca iam
 * responder — e tem a Esmetal, referencia regional desde 1963, tratada com a mesma
 * abordagem que a RV Calhas. O segmento nao falhou: o balde estava contaminado.
 *
 * A regra vive em scripts/lib/analise-comum.mjs (classificaIcp), junto com
 * segmentoCanonico e ehProspect, pelo mesmo motivo que elas: se duas telas
 * discordarem sobre quem e ICP, nenhum relatorio vale.
 *
 * STORY 058 (24/09/2026):
 *   - A regra usa o segmento canonico derivado de `segment` quando `segment_norm` esta
 *     vazio (8.210 deals). So isso tira ~5.400 deals do "indefinido".
 *   - Dono da decisao: a regra so grava onde icp_source e nulo, 'regra' ou 'ia'. Manual e
 *     importacao (ex.: icp_jotta_monlevade) nao sao sobrescritos. Antes o --go regravava
 *     tudo como 'regra'.
 *   - Casa de evento e vertente separada: o ICP industrial nao julga (fica nulo).
 *   - --ia: o que a regra deixa indefinido vai para a decisao tipada com o ICP do
 *     content/brandbook.json, lido a cada execucao. Marca icp_source='ia' mesmo quando a
 *     resposta e "incerto", para nao pagar a mesma pergunta de novo.
 *   - O ICP entra na nota: +15 dentro, -25 fora (leadScoring.applyIcpPoints), com a parcela
 *     em deals.icp_points. Idempotente.
 *
 * USO:
 *   node scripts/classify-icp.mjs                     # dry-run: distribuicao e mudancas
 *   node scripts/classify-icp.mjs --amostra           # exemplos + motivo de cada decisao
 *   node scripts/classify-icp.mjs --fora              # so os que sairiam da fila
 *   node scripts/classify-icp.mjs --go                # grava regra + nota
 *   node scripts/classify-icp.mjs --ia --limite=50    # simula a IA nos indefinidos
 *   node scripts/classify-icp.mjs --ia --limite=50 --go
 *   node scripts/classify-icp.mjs --relatorio         # taxa de resposta por ICP e por nota
 *
 * --go exige as migrations 20260814_deal_icp.sql e 20260924_deal_icp_points.sql.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  CANONICOS,
  carregarEnv,
  clienteSupabase,
  classificaIcp,
  motivoIcp,
  ehProspect,
  segmentoCanonico,
} from "./lib/analise-comum.mjs";
import { decide } from "../src/lib/typedDecision.mjs";

const require = createRequire(import.meta.url);
const { applyIcpPoints } = require("../src/lib/leadScoring.js");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const arg = (nome, padrao) => {
  const achado = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return achado ? achado.split("=")[1] : padrao;
};
const GO = process.argv.includes("--go");
const AMOSTRA = process.argv.includes("--amostra");
const SO_FORA = process.argv.includes("--fora");
const IA = process.argv.includes("--ia");
const RELATORIO = process.argv.includes("--relatorio");
const LIMITE = Math.max(1, Number(arg("limite", 50)) || 50);
const PAUSA = Math.max(0, Number(arg("pausa", 2000)) || 0);
const db = clienteSupabase();
// A cascata loga cada tentativa em detalhe; aqui o placar por deal ja diz o que importa.
if (IA && !process.argv.includes("--verbose")) console.warn = () => {};

/**
 * Estagios em que o lead JA PROVOU que tem o problema, respondendo e avancando.
 * A regra nao rebaixa ninguem daqui: evidencia de conversa vale mais que regex de
 * nome, sempre.
 *
 * Isso nao e teoria. Na primeira gravacao (14/08) a regra marcou "fora do ICP" a
 * JOHN REFRIGERACAO, que estava em `proposal` com consciencia 5 e profundidade 4,
 * mais duas em `qualified`. O padrao `refrigera` estava certo em 95% da base e
 * errado justamente onde havia negocio vivo.
 */
const ESTAGIOS_PROTEGIDOS = new Set([
  "qualified",
  "agendamento",
  "reuniao",
  "proposal",
  "negotiation",
  "won",
]);

const paraBool = (veredito) => (veredito === "sim" ? true : veredito === "nao" ? false : null);
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function emLotes(itens, tamanho, fn) {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map(fn));
    if (i > 0 && i % 500 === 0) console.log(`  ...${i}/${itens.length}`);
  }
}

/** ICP do brandbook, lido agora (doutrina viva): mudou o brandbook, mudou o criterio. */
function criteriosIcp() {
  const brandbook = JSON.parse(fs.readFileSync(path.join(RAIZ, "content", "brandbook.json"), "utf8"));
  const secao = (brandbook.sections ?? []).find((item) => item.id === "icp");
  const ideal = secao?.columns?.find((coluna) => /ideal/i.test(coluna.title))?.items ?? [];
  const anti = secao?.columns?.find((coluna) => /anti|nao e/i.test(coluna.title))?.items ?? [];
  if (!ideal.length || !anti.length) throw new Error("content/brandbook.json sem a secao icp (ICP Ideal / Anti-ICP).");
  return {
    sim: `Dentro do ICP da Mydrion. ${ideal.join("; ")}`,
    nao: `Fora do ICP. ${anti.join("; ")}`,
    incerto: "O nome, o segmento e o CNAE nao bastam para afirmar nenhum dos dois.",
  };
}

/** Plano da regra para um deal: o is_icp/icp_source que ele deve ter depois do --go. */
function planoDaRegra(d) {
  const canonico = d.segment_norm || segmentoCanonico(d.segment, d.company);
  let veredito = d.segment === "eventos" ? null : classificaIcp(d.company, d.name, canonico);
  let protegido = false;
  if (veredito === "nao" && ESTAGIOS_PROTEGIDOS.has(d.stage)) {
    veredito = null; // a conversa refuta a regra; ninguem sai da fila por regex
    protegido = true;
  }
  const fonte = d.icp_source ?? null;
  // A regra manda onde ninguem decidiu, onde ela mesma decidiu, e sobre a IA quando ela sabe
  // responder (regra e escrita pelo Erick; IA so preenche o que a regra nao sabe).
  const regraManda = fonte === null || fonte === "regra" || (fonte === "ia" && veredito !== null);
  const alvo = regraManda
    ? { is_icp: paraBool(veredito), icp_source: veredito === null ? null : "regra" }
    : { is_icp: d.is_icp ?? null, icp_source: fonte };
  return { veredito, canonico, protegido, alvo };
}

async function relatorio(deals) {
  const contatado = (d) => ["abordado", "followup", "qualified", "proposal", "negotiation", "won"].includes(d.stage)
    || (d.stage === "lost" && d.last_outbound_at);
  const respondeu = (d) => ["humana", "encaminhamento", "objecao"].includes(d.response_type);
  // Responder NAO e o mesmo que servir. Medido em 24/09/2026: fora do ICP respondia 31% (quase
  // tudo refrigeracao) mas so 2,2% avancava; dentro do ICP respondia 17% e avancava 4,5%.
  const avancou = (d) => ["qualified", "agendamento", "reuniao", "proposal", "negotiation", "won"].includes(d.stage);
  const base = deals.filter((d) => ehProspect(d.company, d.name) && contatado(d));
  const pct = (a, b) => `${((a / Math.max(b, 1)) * 100).toFixed(1)}%`.padStart(6);
  const tabela = (titulo, chave) => {
    const grupos = new Map();
    for (const d of base) {
      const k = chave(d);
      const g = grupos.get(k) ?? { n: 0, r: 0, a: 0, w: 0 };
      g.n += 1;
      if (respondeu(d)) g.r += 1;
      if (avancou(d)) g.a += 1;
      if (d.stage === "won") g.w += 1;
      grupos.set(k, g);
    }
    console.log(`\n${titulo}`);
    for (const [k, g] of [...grupos.entries()].sort()) {
      console.log(`  ${String(k).padEnd(10)} contatados ${String(g.n).padStart(5)}  responderam ${pct(g.r, g.n)}  avancaram ${pct(g.a, g.n)} (${g.a})  ganhos ${g.w}`);
    }
  };
  console.log(`\nCALIBRACAO (proxy: so ${deals.filter((d) => d.stage === "won").length} vitorias na base)`);
  console.log(`Contatados: ${base.length}. Respondeu = humana, encaminhamento ou objecao. Avancou = qualified ou alem.`);
  console.log("Indefinido mistura cliente vindo por indicacao (sem ICP preenchido): nao compare direto.");
  tabela("Por ICP", (d) => (d.is_icp === true ? "sim" : d.is_icp === false ? "nao" : "indefinido"));
  tabela("Por faixa de nota", (d) => {
    const p = Number(d.points || 0);
    return p >= 80 ? "d) 80+" : p >= 60 ? "c) 60-79" : p >= 40 ? "b) 40-59" : "a) <40";
  });
}

async function passeIa(candidatos) {
  const criterios = criteriosIcp();
  const segmentos = Object.fromEntries([...CANONICOS.map((c) => [c, c]), ["outro", "nenhum dos anteriores"]]);
  const fila = candidatos.sort((a, b) => Number(b.points || 0) - Number(a.points || 0)).slice(0, LIMITE);
  console.log(`\nIA: ${fila.length} de ${candidatos.length} indefinidos (maior nota primeiro). ${GO ? "GRAVANDO" : "simulacao"}\n`);
  const placar = { sim: 0, nao: 0, incerto: 0, falha: 0 };
  for (const d of fila) {
    const r = await decide({
      state: {
        empresa: d.company || d.name,
        segmento_informado: d.segment || "(vazio)",
        cnae: d.cnae_descricao || "(sem)",
        porte: d.porte || "(sem)",
      },
      questions: {
        icp: { type: "choice", instructions: "Esta empresa esta dentro do ICP da Mydrion? Julgue pelo que ela faz.", criteria: criterios },
        segmento: { type: "choice", instructions: "Qual o segmento industrial da empresa?", criteria: segmentos },
      },
      timeoutMs: 20000,
      perProviderTimeoutMs: 10000,
      perModelTimeoutMs: 8000,
      providerPolicy: "free-then-groq",
    });
    const nome = String(d.company || d.name).slice(0, 40).padEnd(40);
    if (!r.ok || r.answers.icp?.type !== "choice") {
      placar.falha += 1;
      console.log(`  x ${nome} [${String(d.segment || "").slice(0, 12)}] ${r.ok ? "resposta fora da lista" : r.detail.slice(0, 90)}`);
    } else {
      const escolha = r.answers.icp.choice;
      placar[escolha] += 1;
      let isIcp = escolha === "sim" ? true : escolha === "nao" ? false : null;
      if (isIcp === false && ESTAGIOS_PROTEGIDOS.has(d.stage)) isIcp = null;
      const segmento = r.answers.segmento?.type === "choice" ? r.answers.segmento.choice : "outro";
      const nota = applyIcpPoints(d.points, d.icp_points, isIcp);
      console.log(`  ${escolha.padEnd(7)} ${nome} [${String(d.segment || "").slice(0, 12)}] seg=${segmento} nota ${d.points}->${nota.points}`);
      if (GO) {
        await db.patch(`deals?id=eq.${d.id}`, {
          is_icp: isIcp,
          icp_source: "ia",
          ...(d.segment_norm || segmento === "outro" ? {} : { segment_norm: segmento }),
          points: nota.points,
          icp_points: nota.icp_points,
        });
      }
    }
    if (PAUSA > 0) await esperar(PAUSA);
  }
  console.log(`\nIA: sim ${placar.sim} | nao ${placar.nao} | incerto ${placar.incerto} | falha ${placar.falha}`);
  if (!GO) console.log("Simulacao. Nada gravado. Rode com --go para aplicar.");
}

(async () => {
  const deals = await db.get(
    "deals?select=id,company,name,segment,segment_norm,stage,is_icp,icp_source,points,icp_points,cnae_descricao,porte,response_type,last_outbound_at",
  );

  if (RELATORIO) {
    await relatorio(deals);
    return;
  }

  const contagem = { sim: 0, nao: 0, indefinido: 0, "nao-prospect": 0, eventos: 0 };
  const exemplos = { sim: [], nao: [], indefinido: [] };
  const protegidos = [];
  const mudancas = [];
  const transicoes = {};
  const indefinidosParaIa = [];
  let subiram = 0;
  let desceram = 0;

  for (const d of deals) {
    if (!ehProspect(d.company, d.name)) {
      contagem["nao-prospect"]++;
      continue;
    }
    if (d.segment === "eventos") contagem.eventos++;
    const { veredito, canonico, protegido, alvo } = planoDaRegra(d);
    if (protegido) protegidos.push({ empresa: d.company || d.name, stage: d.stage });
    const chave = veredito ?? "indefinido";
    contagem[chave]++;
    exemplos[chave].push({
      empresa: d.company || d.name,
      segmento: canonico || "(sem)",
      stage: d.stage,
      motivo: d.segment === "eventos" ? "casa de evento: vertente separada" : motivoIcp(d.company, d.name, canonico),
    });

    const nota = applyIcpPoints(d.points, d.icp_points, alvo.is_icp);
    const mudouIcp = alvo.is_icp !== (d.is_icp ?? null) || alvo.icp_source !== (d.icp_source ?? null);
    const mudouNota = nota.points !== Number(d.points || 0) || nota.icp_points !== Number(d.icp_points || 0);
    if (mudouIcp) {
      const t = `${String(d.is_icp ?? null)} -> ${String(alvo.is_icp)}`;
      transicoes[t] = (transicoes[t] ?? 0) + 1;
    }
    if (nota.points > Number(d.points || 0)) subiram++;
    if (nota.points < Number(d.points || 0)) desceram++;
    if (mudouIcp || mudouNota) mudancas.push({ id: d.id, ...alvo, ...nota });
    // Lead perdido nao volta pra fila: nao vale gastar cota gratuita julgando ICP dele.
    if (alvo.is_icp === null && alvo.icp_source === null && d.segment !== "eventos" && d.stage !== "lost") {
      indefinidosParaIa.push({ ...d, icp_points: nota.icp_points, points: nota.points });
    }
  }

  const total = contagem.sim + contagem.nao + contagem.indefinido;
  console.log(`\nDEALS: ${deals.length}   |   prospects avaliados: ${total}`);
  console.log(`(${contagem["nao-prospect"]} fora da conta: cliente, contato pessoal ou thread orfa)`);
  console.log(`(${contagem.eventos} casas de evento ficam fora do ICP industrial)\n`);
  console.log("DISTRIBUICAO DA REGRA");
  for (const k of ["sim", "nao", "indefinido"]) {
    const v = contagem[k];
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  ${((v / total) * 100).toFixed(1)}%`);
  }
  console.log(`\nMUDANCAS: ${mudancas.length} deals (is_icp e/ou nota)`);
  for (const [t, n] of Object.entries(transicoes).sort((a, b) => b[1] - a[1])) console.log(`  is_icp ${t.padEnd(16)} ${n}`);
  console.log(`  nota sobe: ${subiram} (+15 ICP)   nota desce: ${desceram} (-25 fora do ICP)`);
  console.log(`  indefinidos para a IA (sem evento): ${indefinidosParaIa.length}`);

  if (protegidos.length) {
    console.log(
      `\n${protegidos.length} a regra queria excluir, mas o funil refuta (estagio avancado).` +
        `\nFicam como indefinido. A conversa vale mais que o nome:`,
    );
    for (const p of protegidos.slice(0, 30)) console.log(`  ${p.stage.padEnd(13)} ${p.empresa}`);
  }

  if (SO_FORA) {
    console.log(`\n--- FORA DO ICP (${exemplos.nao.length}) ---`);
    for (const e of exemplos.nao.slice(0, 60)) {
      console.log(`  ${String(e.empresa).slice(0, 42).padEnd(42)} [${e.segmento.padEnd(12)}] ${e.motivo}`);
    }
  }

  if (AMOSTRA) {
    for (const k of ["sim", "nao", "indefinido"]) {
      console.log(`\n--- ${k} (${exemplos[k].length}) ---`);
      for (const e of exemplos[k].slice(0, 15)) {
        console.log(`  ${String(e.empresa).slice(0, 42).padEnd(42)} [${e.segmento.padEnd(12)}] ${e.motivo}`);
      }
    }
  }

  if (GO && !IA) {
    // Falha cedo e com instrucao, em vez de gravar milhares de PATCHes contra coluna ausente.
    try {
      await db.get("deals?select=is_icp,icp_points&limit=1");
    } catch {
      console.error("\nColunas deals.is_icp / icp_points nao existem. Aplique 20260814_deal_icp.sql e 20260924_deal_icp_points.sql.\n");
      process.exit(1);
    }
    await emLotes(mudancas, 10, (m) => db.patch(`deals?id=eq.${m.id}`, {
      is_icp: m.is_icp,
      icp_source: m.icp_source,
      points: m.points,
      icp_points: m.icp_points,
    }));
    console.log(`\nOK: ${mudancas.length} deals atualizados.\n`);
  }

  if (IA) {
    if (GO && mudancas.length) {
      console.log(`\nAviso: a regra ainda tem ${mudancas.length} mudancas pendentes. Rode --go sem --ia antes, para a IA nao julgar o que a regra ja decide.`);
      return;
    }
    await passeIa(indefinidosParaIa);
    return;
  }

  if (!GO) console.log("\nDRY-RUN. Nada gravado. Rode com --go para aplicar.\n");
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
