/**
 * analise-conversas.mjs
 * Relatorio de prospeccao POR TIPO DE EMPRESA.
 *
 * Responde, para cada segmento (usinagem, caldeiraria, manutencao, automacao,
 * climatizacao):
 *   1. nivel de consciencia (Schwartz)
 *   2. nivel de sofisticacao de mercado (Schwartz)
 *   3. a oferta esta clara pra ele
 *   4. o follow-up esta funcionando, e quando nao, por que
 *   5. nivel de conversa alcancado
 *   6. amostra de clientes reais daquele grupo
 *   7. demanda de oferta detectada
 *
 * HONESTIDADE ESTATISTICA: toda taxa aparece com o n ao lado. Celula abaixo de
 * AMOSTRA_MINIMA sai marcada com "~" e a taxa e suavizada contra a media geral.
 * Com 62 respostas divididas em 5 segmentos, taxa crua por celula MENTE — e o
 * relatorio existe pra decidir onde investir a proxima leva, nao pra confortar.
 *
 * USO:
 *   node scripts/analise-conversas.mjs                  # terminal
 *   node scripts/analise-conversas.mjs --md             # grava data/analise-conversas.md
 *   node scripts/analise-conversas.mjs --segmento=usinagem
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  carregarEnv, clienteSupabase, taxaSuavizada, AMOSTRA_MINIMA, barra, pct,
  ehProspect, ehOrfao,
} from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : d;
};
const MD = process.argv.includes("--md");
const FILTRO = arg("segmento", null);
const db = clienteSupabase();

const AUTORESPONDER =
  /agradece|obrigado (por|pelo)|seja bem-vind|responderemos|assistente virtual|em breve|hor[aá]rio de atendimento/i;

const NOME_CONSCIENCIA = {
  1: "inconsciente", 2: "consciente do problema", 3: "consciente da solucao",
  4: "consciente do produto", 5: "totalmente consciente",
};
const NOME_SOFISTICACAO = {
  1: "virgem", 2: "promessa ampliada", 3: "exige mecanismo",
  4: "ceticismo alto", 5: "saturado",
};
const NOME_BLOCKER = {
  sem_resposta: "nunca respondeu", gatekeeper_bot: "bot/secretaria barrou",
  preco: "travou no preco", sem_urgencia: "sem urgencia", ja_tem_fornecedor: "ja tem fornecedor",
  decisor_ausente: "decisor ausente", canal_errado: "canal errado",
  audio_nao_transcrito: "respondeu so por audio", nao_travou: "nao travou", outro: "outro",
};

const linhas = [];
const out = (s = "") => { linhas.push(s); console.log(s); };

function moda(lista) {
  const c = {};
  for (const x of lista) if (x != null && x !== "") c[x] = (c[x] || 0) + 1;
  const ord = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return ord.length ? { valor: ord[0][0], n: ord[0][1], todos: ord } : null;
}
const media = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

(async () => {
  const [deals, msgs, acts] = await Promise.all([
    db.get("deals?select=id,company,name,segment,segment_norm,stage,awareness_level,sophistication_level,offer_clarity,offer_demanded,conversation_depth,blocker,classification_evidence,classified_at,classified_by"),
    db.get("messages?deal_id=not.is.null&select=deal_id,direction,content,message_type,occurred_at,created_at&order=occurred_at.asc"),
    // Fonte SEPARADA de "foi abordado": os disparos manuais por wa.me nunca
    // criaram linha em `messages`, so activity. Usar so messages contava 59
    // abordados onde existem 129 — e toda taxa de resposta sairia inflada ao
    // dobro, porque o denominador perderia os leads que nunca responderam.
    db.get("activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&select=deal_id,type"),
  ]);

  const disparosPorDeal = new Map();
  for (const a of acts) {
    disparosPorDeal.set(a.deal_id, (disparosPorDeal.get(a.deal_id) || 0) + 1);
  }

  // --- thread por deal: quantos envios, se respondeu, e depois de qual envio ---
  const thread = new Map();
  for (const m of msgs) {
    if (!thread.has(m.deal_id)) thread.set(m.deal_id, []);
    thread.get(m.deal_id).push(m);
  }

  const info = new Map();
  for (const [id, lista] of thread) {
    const ordenada = [...lista].sort(
      (a, b) => new Date(a.occurred_at || a.created_at) - new Date(b.occurred_at || b.created_at),
    );
    const envios = ordenada.filter((m) => m.direction === "sent");
    const respostas = ordenada.filter(
      (m) => m.direction === "received" && m.content && !AUTORESPONDER.test(m.content),
    );
    // Follow-up = 2o envio em diante. "Respondeu ao follow-up" so conta se a
    // resposta veio DEPOIS do 2o envio; senao o follow-up leva credito por uma
    // resposta que ja tinha acontecido.
    const t2 = envios[1] ? new Date(envios[1].occurred_at || envios[1].created_at) : null;
    info.set(id, {
      envios: Math.max(envios.length, disparosPorDeal.get(id) || 0),
      respondeu: respostas.length > 0,
      temFollowup: Math.max(envios.length, disparosPorDeal.get(id) || 0) >= 2,
      respondeuAoFollowup:
        !!t2 && respostas.some((r) => new Date(r.occurred_at || r.created_at) > t2),
      respondeuAntesDoFollowup:
        !!t2 && respostas.some((r) => new Date(r.occurred_at || r.created_at) <= t2),
    });
  }

  // Lead abordado por wa.me manual nao tem NENHUMA linha em `messages`, entao
  // nao apareceu no laco acima. Sem isto ele sumiria do denominador e a taxa de
  // resposta do segmento subiria sozinha.
  for (const [id, n] of disparosPorDeal) {
    if (!info.has(id)) {
      info.set(id, { envios: n, respondeu: false, temFollowup: n >= 2, respondeuAoFollowup: false });
    }
  }

  // --- agrupa por segmento, fora quem nao e prospeccao fria ---
  const grupos = new Map();
  const excluidos = [];
  const orfaos = [];
  for (const d of deals) {
    if (ehOrfao(d.company, d.name)) {
      // Thread que o webhook nao conseguiu ligar ao deal de origem. Nao e empresa:
      // conta como divida de dados, nao como lead que nao respondeu.
      if ((info.get(d.id)?.envios || 0) > 0 || thread.has(d.id)) orfaos.push(d);
      continue;
    }
    if (!ehProspect(d.company, d.name)) {
      excluidos.push(d);
      continue;
    }
    const k = d.segment_norm || "(sem classificacao)";
    if (FILTRO && k !== FILTRO) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ ...d, ...(info.get(d.id) || { envios: 0, respondeu: false, temFollowup: false }) });
  }

  // médias gerais, usadas como prior da suavizacao
  const todos = [...grupos.values()].flat();
  const abordados = todos.filter((d) => d.envios > 0);
  const mediaResposta = abordados.length
    ? abordados.filter((d) => d.respondeu).length / abordados.length : 0;
  const comFu = todos.filter((d) => d.temFollowup);
  const mediaFu = comFu.length ? comFu.filter((d) => d.respondeuAoFollowup).length / comFu.length : 0;

  out("");
  out("=".repeat(78));
  out("  ANALISE DE CONVERSAS POR TIPO DE EMPRESA");
  out(`  ${new Date().toLocaleString("pt-BR")}`);
  out("=".repeat(78));
  out("");
  out(`Base: ${todos.length} leads | ${abordados.length} abordados | ${comFu.length} com follow-up`);
  out(`Taxa geral de resposta: ${pct(mediaResposta)}  |  resposta apos follow-up: ${pct(mediaFu)}`);
  out(`Celulas com n < ${AMOSTRA_MINIMA} saem marcadas com ~ (taxa suavizada, indicativa).`);
  if (excluidos.length) {
    out(`Fora da conta: ${excluidos.length} linhas que nao sao prospeccao fria ` +
        `(${excluidos.slice(0, 4).map((d) => d.company || d.name).join(", ")}${excluidos.length > 4 ? "..." : ""}).`);
  }
  if (orfaos.length) {
    out(`ATENCAO: ${orfaos.length} threads orfas ("WhatsApp NNNN") com mensagem e sem empresa.`);
    out(`  Sao respostas que nao acharam o deal de origem. Religar antes da proxima leva,`);
    out(`  senao viram resposta perdida e o segmento correspondente aparece pior do que e.`);
  }

  const ordenados = [...grupos.entries()].sort((a, b) => {
    const ab = b[1].filter((d) => d.envios > 0).length - a[1].filter((d) => d.envios > 0).length;
    return ab;
  });

  for (const [segmento, lista] of ordenados) {
    const abordadosSeg = lista.filter((d) => d.envios > 0);
    const responderam = abordadosSeg.filter((d) => d.respondeu);
    const classificados = lista.filter((d) => d.classified_at);

    out("");
    out("-".repeat(78));
    out(`  ${segmento.toUpperCase()}   ${lista.length} leads | ${abordadosSeg.length} abordados | ${responderam.length} responderam`);
    out("-".repeat(78));

    if (!abordadosSeg.length) {
      out("  Nunca abordado. Nada a concluir.");
      continue;
    }

    const marca = abordadosSeg.length < AMOSTRA_MINIMA ? "~" : " ";
    const tx = taxaSuavizada(responderam.length, abordadosSeg.length, mediaResposta);
    out(`  RESPOSTA        ${marca}${pct(tx)} ${barra(tx)}  (cru ${responderam.length}/${abordadosSeg.length})`);

    // 4. follow-up
    const fu = lista.filter((d) => d.temFollowup);
    if (fu.length) {
      const fuOk = fu.filter((d) => d.respondeuAoFollowup);
      const m2 = fu.length < AMOSTRA_MINIMA ? "~" : " ";
      const txFu = taxaSuavizada(fuOk.length, fu.length, mediaFu);
      out(`  FOLLOW-UP       ${m2}${pct(txFu)} ${barra(txFu)}  (cru ${fuOk.length}/${fu.length})`);
      const soFu = fu.filter((d) => d.respondeuAoFollowup && !d.respondeuAntesDoFollowup).length;
      out(`                   ${soFu} responderam SO depois do follow-up (o que ele de fato resgatou)`);
    } else {
      out("  FOLLOW-UP        nenhum enviado neste segmento");
    }

    if (!classificados.length) {
      out("");
      out("  Sem conversa classificada. Rode classify-conversations.mjs --go.");
      continue;
    }

    // 1, 2, 5. consciencia / sofisticacao / profundidade
    const cons = media(classificados.map((d) => d.awareness_level).filter(Boolean));
    const sof = media(classificados.map((d) => d.sophistication_level).filter(Boolean));
    const prof = media(classificados.map((d) => d.conversation_depth).filter((x) => x != null));
    const mCons = moda(classificados.map((d) => d.awareness_level));
    const mSof = moda(classificados.map((d) => d.sophistication_level));

    out("");
    out(`  CONSCIENCIA      ${cons?.toFixed(1)}/5  predominante: ${NOME_CONSCIENCIA[mCons?.valor] || "-"} (${mCons?.n}/${classificados.length})`);
    out(`  SOFISTICACAO     ${sof?.toFixed(1)}/5  predominante: ${NOME_SOFISTICACAO[mSof?.valor] || "-"} (${mSof?.n}/${classificados.length})`);
    out(`  PROFUNDIDADE     ${prof?.toFixed(1)}/5  (0=silencio, 3=engajou, 5=falou de preco/reuniao)`);

    // 3. clareza da oferta
    const clareza = moda(classificados.map((d) => d.offer_clarity));
    if (clareza) {
      const detalhe = clareza.todos.map(([k, v]) => `${k} ${v}`).join(" | ");
      out(`  OFERTA CLARA?    ${clareza.valor}   (${detalhe})`);
    }

    // 7. demanda de oferta
    const demanda = moda(classificados.map((d) => d.offer_demanded).filter((x) => x && x !== "nenhuma"));
    out(`  DEMANDA          ${demanda ? demanda.todos.map(([k, v]) => `${k} (${v})`).join(", ") : "nenhuma declarada"}`);

    // 4b. por que o follow-up nao funciona
    const travas = moda(classificados.map((d) => d.blocker).filter((x) => x && x !== "nao_travou"));
    if (travas) {
      out(`  TRAVAS           ${travas.todos.map(([k, v]) => `${NOME_BLOCKER[k] || k} (${v})`).join(", ")}`);
    }

    // 6. amostra de clientes
    out("");
    out("  AMOSTRA");
    const amostra = [...classificados].sort(
      (a, b) => (b.conversation_depth || 0) - (a.conversation_depth || 0),
    ).slice(0, 5);
    for (const d of amostra) {
      out(`    ${String(d.company || d.name).slice(0, 30).padEnd(30)} c${d.awareness_level} s${d.sophistication_level} p${d.conversation_depth}  ${d.stage}`);
      if (d.classification_evidence) out(`      "${d.classification_evidence.slice(0, 88)}"`);
    }
  }

  out("");
  out("=".repeat(78));
  // Separar os dois casos: quem respondeu e nao foi classificado e trabalho
  // pendente de verdade; quem nunca respondeu nao tem o que classificar e some
  // no mesmo balde se o texto nao distinguir.
  const pendentes = todos.filter((d) => d.envios > 0 && d.respondeu && !d.classified_at);
  const mudos = todos.filter((d) => d.envios > 0 && !d.respondeu).length;
  if (pendentes.length) {
    out(`${pendentes.length} leads RESPONDERAM e ainda nao foram classificados ` +
        `(${pendentes.slice(0, 3).map((d) => d.company || d.name).join(", ")}...).`);
    out("  Rode classify-conversations.mjs --go, ou classifique na mao se a IA reprovou.");
  }
  if (mudos) out(`${mudos} leads abordados nunca responderam — nada a classificar neles.`);
  const semSeg = (grupos.get("(sem classificacao)") || []).length;
  if (semSeg) out(`${semSeg} leads sem segmento — rode normalize-segments.mjs --amostra.`);
  out("");

  if (MD) {
    const destino = path.join(RAIZ, "data", "analise-conversas.md");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, "```\n" + linhas.join("\n") + "\n```\n", "utf8");
    console.log(`Gravado em ${destino}`);
  }
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});