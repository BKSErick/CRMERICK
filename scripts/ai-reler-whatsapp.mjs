/**
 * ai-reler-whatsapp.mjs (Story 057)
 * Rele as mensagens de WhatsApp recebidas que ainda nao tem leitura tipada (view
 * messages_ai_pendentes) com a MESMA leitura do webhook: regra primeiro, decisao tipada no resto.
 *
 * Nao cria atividade no deal (seriam centenas de linhas velhas na timeline) e nao apaga o
 * ai_insight antigo em texto livre: so preenche ai_intent/ai_objection/ai_card/ai_evidence e,
 * se o insight estiver vazio, a linha em portugues.
 *
 * USO:
 *   npm run ai:reler-whatsapp                      # simula 20, nao grava
 *   npm run ai:reler-whatsapp -- --limite=50       # simula 50
 *   npm run ai:reler-whatsapp -- --go --limite=100 # grava
 *   npm run ai:reler-whatsapp -- --deal=123        # so um deal
 *   npm run ai:reler-whatsapp -- --deal=123 --refazer --go  # rele um deal que ja tinha leitura
 *   --pausa=2500   espera entre chamadas ao modelo (ms), para nao estourar o plano gratuito
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarEnv, clienteSupabase } from "./lib/analise-comum.mjs";
import { classifyInboundResponse, extrairContatoIndicado } from "../src/lib/followup.ts";
import { readInboundMessage, renderReadingLine } from "../src/lib/inboundReading.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const arg = (nome, padrao) => {
  const achado = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return achado ? achado.split("=")[1] : padrao;
};
const GO = process.argv.includes("--go");
const LIMITE = Math.max(1, Number(arg("limite", 20)) || 20);
const PAUSA = Math.max(0, Number(arg("pausa", 2500)) || 0);
const DEAL = Number(arg("deal", 0)) || null;
const REFAZER = process.argv.includes("--refazer");
if (REFAZER && !DEAL) throw new Error("--refazer exige --deal=ID (nao rele a base inteira por engano).");
const MAX_TENTATIVAS = 3;

const db = clienteSupabase();
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// A cascata loga cada tentativa em detalhe; aqui o placar por mensagem ja diz o que importa.
if (!process.argv.includes("--verbose")) console.warn = () => {};

async function main() {
  const filtroDeal = DEAL ? `&deal_id=eq.${DEAL}` : "";
  // --refazer (so com --deal): rele tambem o que ja tem leitura, depois de ajustar regra.
  const origem = REFAZER
    ? `messages?direction=eq.received&provider=eq.uazapi&select=id,deal_id,occurred_at,ai_attempts,content${filtroDeal}&order=occurred_at.desc`
    : `messages_ai_pendentes?select=id,deal_id,occurred_at,ai_attempts${filtroDeal}&order=occurred_at.desc`;
  const pendentes = (await db.get(origem))
    .filter((item) => !REFAZER || !String(item.content ?? "").startsWith("["))
    .filter((item) => Number(item.ai_attempts ?? 0) < MAX_TENTATIVAS)
    .slice(0, LIMITE);
  if (pendentes.length === 0) {
    console.log("Nada pendente de leitura.");
    return;
  }

  const dealIds = [...new Set(pendentes.map((item) => item.deal_id))];
  const deals = new Map((await db.get(`deals?id=in.(${dealIds.join(",")})&select=id,company,name,stage`)).map((deal) => [deal.id, deal]));

  const placar = { regra: 0, llm: 0, falha: 0, porIntencao: {}, porCarta: {} };
  console.log(`${GO ? "GRAVANDO" : "SIMULACAO (use --go para gravar)"}: ${pendentes.length} mensagem(ns)\n`);

  for (const pendente of pendentes) {
    const deal = deals.get(pendente.deal_id) ?? {};
    const historico = (await db.get(
      `messages?deal_id=eq.${pendente.deal_id}&provider=eq.uazapi&occurred_at=lte.${encodeURIComponent(pendente.occurred_at)}&select=id,direction,content,occurred_at,ai_insight&order=occurred_at.desc`,
    )).slice(0, 10).reverse();
    const alvo = historico.find((item) => item.id === pendente.id);
    const texto = String(alvo?.content ?? "");
    const responseType = extrairContatoIndicado(texto, deal.company) ? "encaminhamento" : classifyInboundResponse(texto);

    const leitura = await readInboundMessage({ company: deal.company || deal.name, stage: deal.stage, history: historico, responseType, timeoutMs: 25000 });
    const empresa = `${String(deal.company || deal.name || pendente.deal_id).slice(0, 22)} [${String(deal.stage ?? "?").slice(0, 5)}]`.padEnd(30);
    const trecho = texto.replace(/\s+/g, " ").slice(0, 60);

    if (!leitura.ok) {
      placar.falha += 1;
      console.log(`x ${String(pendente.id).padStart(6)} ${empresa} "${trecho}" -> FALHA ${leitura.detail.slice(0, 120)}`);
      if (GO) {
        await db.patch(`messages?id=eq.${pendente.id}`, {
          ai_error: leitura.detail.slice(0, 500),
          ai_attempts: Number(pendente.ai_attempts ?? 0) + 1,
          ai_last_attempt_at: new Date().toISOString(),
        });
      }
    } else {
      placar[leitura.decidedBy] += 1;
      placar.porIntencao[leitura.intent] = (placar.porIntencao[leitura.intent] ?? 0) + 1;
      placar.porCarta[leitura.card] = (placar.porCarta[leitura.card] ?? 0) + 1;
      console.log(`${leitura.decidedBy === "regra" ? "r" : "m"} ${String(pendente.id).padStart(6)} ${empresa} "${trecho}" -> ${leitura.intent} / ${leitura.card}${leitura.objection !== "nenhuma" ? ` / ${leitura.objection}` : ""}`);
      if (GO) {
        await db.patch(`messages?id=eq.${pendente.id}`, {
          ai_intent: leitura.intent,
          ai_objection: leitura.objection,
          ai_card: leitura.card,
          ai_evidence: leitura.evidence || null,
          ai_decided_by: leitura.decidedBy,
          ...(alvo?.ai_insight ? {} : { ai_insight: renderReadingLine(leitura), ai_provider: leitura.provider ?? null, ai_model: leitura.model ?? null }),
          ai_processed_at: new Date().toISOString(),
          ai_error: null,
        });
      }
    }
    if (leitura.ok && leitura.decidedBy === "llm" && PAUSA > 0) await esperar(PAUSA);
    if (!leitura.ok && PAUSA > 0) await esperar(PAUSA);
  }

  console.log(`\nregra ${placar.regra} | modelo ${placar.llm} | falha ${placar.falha}`);
  console.log("por intencao:", JSON.stringify(placar.porIntencao));
  console.log("por carta:", JSON.stringify(placar.porCarta));
  if (!GO) console.log("\nNada foi gravado. Confira e rode com --go.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
