/**
 * reconciliar-respostas.mjs (Story 067, 25/09/2026)
 * Deixa deals.response_type, last_inbound_at e last_outbound_at batendo com as mensagens.
 *
 * Por que existe: o gate Finch (respostasParadas) le esses tres campos do deal. Em 24/09
 * ele contou 52 respostas paradas e so 11 precisavam do Erick. O resto vinha de:
 *   1. deal classificado como "humana" antes de a frase do bot entrar na lista (o webhook
 *      so reclassifica quando chega mensagem nova);
 *   2. conversa movida de card-sombra na consolidacao de 31/08 sem atualizar as datas do
 *      deal (Helmo #1068, Salatini #1338: a ultima fala era do Erick e o gate nao via).
 *
 * Regras:
 *   - so mexe em response_type com response_type_source "automatic" (manual e do Erick);
 *   - "humana" vira "bot" so quando TODA mensagem recebida do deal e resposta automatica
 *     (src/lib/autoresponder.mjs); uma frase de gente ja segura como humana;
 *   - datas so andam para frente, nunca voltam, e vem de messages.occurred_at (a hora da
 *     mensagem): created_at e a hora da gravacao, e o historico importado em lote de 30/07
 *     tem created_at igual para conversas inteiras.
 *
 * USO (da raiz do CRM):
 *   node scripts/reconciliar-respostas.mjs         # dry-run
 *   node scripts/reconciliar-respostas.mjs --go    # grava
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ehRespostaAutomatica } from "../src/lib/autoresponder.mjs";
import { carregarEnv, clienteSupabase } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);
const GO = process.argv.includes("--go");
const db = clienteSupabase();

const deals = await db.get(
  "deals?stage=not.in.(lost,won)&select=id,company,name,stage,response_type,response_type_source,last_inbound_at,last_outbound_at",
);
const mensagens = await db.get("messages?deal_id=not.is.null&select=deal_id,direction,occurred_at,created_at,content&order=occurred_at.asc.nullsfirst");

const porDeal = new Map();
for (const m of mensagens) {
  const lista = porDeal.get(m.deal_id) ?? [];
  lista.push(m);
  porDeal.set(m.deal_id, lista);
}

const depois = (a, b) => Boolean(a) && (!b || Date.parse(a) > Date.parse(b));
const plano = [];
for (const d of deals) {
  const lista = porDeal.get(d.id);
  if (!lista?.length) continue;
  const recebidas = lista.filter((m) => m.direction === "received");
  const enviadas = lista.filter((m) => m.direction === "sent");
  const patch = {};
  const hora = (m) => m?.occurred_at ?? null;
  const ultimaRecebida = hora(recebidas.at(-1));
  const ultimaEnviada = hora(enviadas.at(-1));
  if (depois(ultimaRecebida, d.last_inbound_at)) patch.last_inbound_at = ultimaRecebida;
  if (depois(ultimaEnviada, d.last_outbound_at)) patch.last_outbound_at = ultimaEnviada;
  if (
    d.response_type === "humana" &&
    d.response_type_source !== "manual" &&
    recebidas.length > 0 &&
    recebidas.every((m) => ehRespostaAutomatica(m.content))
  ) {
    patch.response_type = "bot";
  }
  // Diferenca de microssegundo (campo gravado truncado) nao e reconciliacao.
  for (const campo of ["last_inbound_at", "last_outbound_at"]) {
    if (patch[campo] && d[campo] && Math.abs(Date.parse(patch[campo]) - Date.parse(d[campo])) < 1000) delete patch[campo];
  }
  if (Object.keys(patch).length) plano.push({ d, patch });
}

const resumo = { response_type: 0, last_inbound_at: 0, last_outbound_at: 0 };
for (const { d, patch } of plano) {
  for (const campo of Object.keys(patch)) resumo[campo] += 1;
  console.log(`#${d.id} ${String(d.company || d.name).slice(0, 45)} [${d.stage}] ${JSON.stringify(patch)}`);
}
console.log(`\n${plano.length} deals | ${JSON.stringify(resumo)} | ${GO ? "GRAVANDO" : "DRY-RUN (--go grava)"}`);
if (!GO) process.exit(0);

let ok = 0;
for (const { d, patch } of plano) {
  try {
    await db.patch(`deals?id=eq.${d.id}`, patch);
    ok += 1;
  } catch (erro) {
    console.error(`#${d.id}: ${erro.message}`);
  }
}
console.log(`OK: ${ok}/${plano.length} deals reconciliados.`);
