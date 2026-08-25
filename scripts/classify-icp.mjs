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
 * USO:
 *   node scripts/classify-icp.mjs            # dry-run: distribuicao
 *   node scripts/classify-icp.mjs --amostra  # exemplos + motivo de cada decisao
 *   node scripts/classify-icp.mjs --fora     # so os que sairiam da fila
 *   node scripts/classify-icp.mjs --go       # grava deals.is_icp / icp_source
 *
 * --go exige a migration scripts/migrations/20260814_deal_icp.sql aplicada.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  carregarEnv,
  clienteSupabase,
  classificaIcp,
  motivoIcp,
  ehProspect,
} from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const GO = process.argv.includes("--go");
const AMOSTRA = process.argv.includes("--amostra");
const SO_FORA = process.argv.includes("--fora");
const db = clienteSupabase();

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

(async () => {
  const deals = await db.get(
    "deals?select=id,company,name,segment,segment_norm,is_prospect,stage",
  );

  const contagem = { sim: 0, nao: 0, indefinido: 0, "nao-prospect": 0 };
  const exemplos = { sim: [], nao: [], indefinido: [] };
  const protegidos = [];
  const planos = [];

  for (const d of deals) {
    if (!ehProspect(d.company, d.name)) {
      contagem["nao-prospect"]++;
      continue;
    }
    let veredito = classificaIcp(d.company, d.name, d.segment_norm);
    if (veredito === "nao" && ESTAGIOS_PROTEGIDOS.has(d.stage)) {
      protegidos.push({ empresa: d.company || d.name, stage: d.stage });
      veredito = null; // a conversa refuta a regra; ninguem sai da fila por regex
    }
    const chave = veredito ?? "indefinido";
    contagem[chave]++;
    exemplos[chave].push({
      empresa: d.company || d.name,
      segmento: d.segment_norm || "(sem)",
      stage: d.stage,
      motivo: motivoIcp(d.company, d.name, d.segment_norm),
    });
    planos.push({ id: d.id, is_icp: veredito === "sim" ? true : veredito === "nao" ? false : null });
  }

  const total = contagem.sim + contagem.nao + contagem.indefinido;
  console.log(`\nDEALS: ${deals.length}   |   prospects avaliados: ${total}`);
  console.log(`(${contagem["nao-prospect"]} fora da conta: cliente, contato pessoal ou thread orfa)\n`);
  console.log("DISTRIBUICAO DE ICP");
  for (const k of ["sim", "nao", "indefinido"]) {
    const v = contagem[k];
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}  ${((v / total) * 100).toFixed(1)}%`);
  }

  // O numero que importa: quanto da base que voce ia abordar nao deveria ser abordada.
  console.log(
    `\n${contagem.nao} leads sairiam da fila de prospeccao. Eles nao tem orcamento` +
      `\ntecnico variavel, entao nunca responderiam, e hoje puxam pra baixo a taxa` +
      `\ndo segmento em que estao.`,
  );
  if (contagem.indefinido) {
    console.log(
      `\n${contagem.indefinido} ficaram indefinidos. Isso e proposital: marcar "nao"` +
        `\npara de abordar o lead, e errar isso custa cliente. Revise na mao com --amostra.`,
    );
  }

  if (protegidos.length) {
    console.log(
      `\n${protegidos.length} a regra queria excluir, mas o funil refuta (estagio avancado).` +
        `\nFicam como indefinido. A conversa vale mais que o nome:`,
    );
    for (const p of protegidos) console.log(`  ${p.stage.padEnd(13)} ${p.empresa}`);
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

  if (!GO) {
    console.log("\nDRY-RUN. Nada gravado. Rode com --go para aplicar.\n");
    return;
  }

  // Falha cedo e com instrucao, em vez de gravar 1300 PATCHes contra coluna ausente.
  try {
    await db.get("deals?select=is_icp&limit=1");
  } catch {
    console.error(
      "\nColuna deals.is_icp nao existe. Aplique primeiro:" +
        "\n  scripts/migrations/20260814_deal_icp.sql\n",
    );
    process.exit(1);
  }

  let feitos = 0;
  for (const p of planos) {
    await db.patch(`deals?id=eq.${p.id}`, { is_icp: p.is_icp, icp_source: "regra" });
    if (++feitos % 100 === 0) console.log(`  ...${feitos}/${planos.length}`);
  }
  console.log(`\nOK: ${feitos} deals classificados.\n`);
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
