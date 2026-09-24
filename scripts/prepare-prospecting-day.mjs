/**
 * Congela os candidatos de um dia em dois manifestos. Nunca envia mensagens.
 * Instagram nao participa deste fluxo: a primeira abordagem no Instagram continua manual.
 *
 * O dia cheio (10 follow-ups + 30 primeiras por turno, alvo 20/40) e o DEFAULT, nao a
 * unica forma. Depois da restricao de 24h de 18/08/2026 passou a existir dia de volume
 * baixo, e cada numero abaixo aceita "manha,tarde":
 *
 *   node scripts/prepare-prospecting-day.mjs --date=2026-08-24 \
 *     --followups=3,7 --first=0 --alvo=3,10 \
 *     --min=900,1320 --max=1200,1680 --bloco=99 --teto-numero=30
 *
 * E o dia pode ser de um degrau so de follow-up, com --tier=M1|M2|M3|bot:
 *
 *   node scripts/prepare-prospecting-day.mjs --date=2026-09-22 \
 *     --tier=M2 --followups=12,13 --first=0 --alvo=12,25
 *
 * Le-se: 3 follow-ups de manha e 7 a tarde, nenhuma primeira mensagem, teto acumulado
 * de 3 ate o fim da manha e 10 no dia, mensagem a cada 15-20 min de manha e 22-28 min
 * a tarde, sem pausa de bloco, e o lote para se o NUMERO passar de 30 saidas no dia.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { avaliarGateFinchLote } from "../src/lib/finchGate.mjs";
import { carregarEnv, clienteSupabase } from "./lib/analise-comum.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIR = path.join(ROOT, "logs", "prospecting-batches");
const arg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

function localDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const date = arg("date", localDate(1));
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Use --date=AAAA-MM-DD.");

// Degrau do follow-up (M1/M2/M3/bot), repassado ao uazapi-followup-batch. Vazio = a
// fila inteira, como sempre. Existe porque as vezes o dia e de UM degrau so: em
// 22/09/2026 a fila tinha 49 M2 parados e o dia foi fechado so com eles.
const tierFollowup = arg("tier", "");
if (tierFollowup && !["M1", "M2", "M3", "bot"].includes(tierFollowup)) {
  throw new Error(`--tier aceita M1, M2, M3 ou bot; recebi "${tierFollowup}".`);
}
const tierArgs = tierFollowup ? [`--tier=${tierFollowup}`] : [];

// "3,7" = manha,tarde. Um numero so vale para os dois turnos.
function porSlot(nome, padraoManha, padraoTarde = padraoManha) {
  const bruto = arg(nome, "");
  if (!bruto) return { morning: padraoManha, afternoon: padraoTarde };
  const partes = bruto.split(",").map((parte) => Number(parte.trim()));
  if (partes.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`--${nome} aceita numero ou "manha,tarde"; recebi "${bruto}".`);
  }
  return { morning: partes[0], afternoon: partes.length > 1 ? partes[1] : partes[0] };
}

const followupsPorSlot = porSlot("followups", 10);
const firstPorSlot = porSlot("first", 30);
const alvoPorSlot = porSlot("alvo", 20, 40);
const minPorSlot = porSlot("min", 0);
const maxPorSlot = porSlot("max", 0);
const pausaPorSlot = porSlot("pausa", 0);
const blocoPorSlot = porSlot("bloco", 0);
const tetoNumeroPorSlot = porSlot("teto-numero", 0);

// Zero = nao escrever a chave e deixar o script de envio usar o default dele.
function pacingDoSlot(slot) {
  const pacing = {};
  if (minPorSlot[slot]) pacing.min = minPorSlot[slot];
  if (maxPorSlot[slot]) pacing.max = maxPorSlot[slot];
  if (pausaPorSlot[slot]) pacing.pausa = pausaPorSlot[slot];
  if (blocoPorSlot[slot]) pacing.bloco = blocoPorSlot[slot];
  if (tetoNumeroPorSlot[slot]) pacing.tetoNumero = tetoNumeroPorSlot[slot];
  return Object.keys(pacing).length ? pacing : undefined;
}
fs.mkdirSync(RUNTIME_DIR, { recursive: true });

function manifestPath(slot) {
  return path.join(RUNTIME_DIR, `${date}-${slot}.manifest.json`);
}
function approvalPath(slot) {
  return path.join(RUNTIME_DIR, `${date}-${slot}.approval.json`);
}

for (const slot of ["morning", "afternoon"]) {
  if (fs.existsSync(approvalPath(slot))) {
    throw new Error(`Ja existe aprovacao para ${date}/${slot}. Remova-a conscientemente antes de regenerar o lote.`);
  }
}

// P7 (Story 064, gate Thiago Finch): nao entra volume NOVO enquanto houver resposta
// qualificada esperando o Erick. Follow-up de cadencia segue; primeira mensagem para.
// Sem flag de escape de proposito: o destrave e responder quem esta esperando.
carregarEnv(ROOT);
const dealsAbertos = await clienteSupabase().get(
  "deals?stage=not.in.(lost,won)&select=id,company,name,stage,response_type,last_inbound_at,last_outbound_at,is_icp,segment,segment_norm,cnae_descricao",
);
const loteFinch = avaliarGateFinchLote({ deals: dealsAbertos });
const paradas = loteFinch.criterios.find((item) => item.id === "respostasParadas");
if (paradas && !paradas.ok && (firstPorSlot.morning || firstPorSlot.afternoon)) {
  console.log(`Gate Finch: ${paradas.motivo}.`);
  console.log("Nenhuma primeira mensagem nova neste manifesto ate essas respostas serem atendidas.");
  firstPorSlot.morning = 0;
  firstPorSlot.afternoon = 0;
}

function collect(script, kind, slot, limit, excluded = [], extraArgs = []) {
  if (!limit) return [];
  const relativeOutput = path.join("logs", "prospecting-batches", `${date}-${slot}.${kind}.candidates.json`);
  const args = [
    path.join(ROOT, "scripts", script),
    `--limit=${limit}`,
    `--json-out=${relativeOutput}`,
  ];
  if (excluded.length) args.push(`--exclude-ids=${excluded.join(",")}`);
  args.push(...extraArgs);
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Falha ao preparar ${kind}/${slot} (exit ${result.status}).`);
  const absoluteOutput = path.join(ROOT, relativeOutput);
  const payload = JSON.parse(fs.readFileSync(absoluteOutput, "utf8"));
  fs.unlinkSync(absoluteOutput);
  return Array.isArray(payload.ids) ? payload.ids.map(Number).filter(Number.isInteger) : [];
}

const morningFollowups = collect("uazapi-followup-batch.mjs", "followup", "morning", followupsPorSlot.morning, [], tierArgs);
const morningFirst = collect("uazapi-send-batch.mjs", "first", "morning", firstPorSlot.morning);
const afternoonFollowups = collect("uazapi-followup-batch.mjs", "followup", "afternoon", followupsPorSlot.afternoon, morningFollowups, tierArgs);
const afternoonFirst = collect("uazapi-send-batch.mjs", "first", "afternoon", firstPorSlot.afternoon, morningFirst);
const createdAt = new Date().toISOString();

const manifests = [
  {
    version: 1,
    date,
    slot: "morning",
    cumulativeTarget: alvoPorSlot.morning,
    firstContactIds: morningFirst,
    followupIds: morningFollowups,
    createdAt,
    pacing: pacingDoSlot("morning"),
  },
  {
    version: 1,
    date,
    slot: "afternoon",
    cumulativeTarget: alvoPorSlot.afternoon,
    firstContactIds: afternoonFirst,
    followupIds: afternoonFollowups,
    createdAt,
    pacing: pacingDoSlot("afternoon"),
  },
];

// O guard e contra base vazia ou fila starvada, nao contra dia pequeno: exige que a
// base tenha entregado o que foi PEDIDO. Antes era fixo em 40 e recusava qualquer dia
// de volume baixo.
const pedidos =
  followupsPorSlot.morning + followupsPorSlot.afternoon + firstPorSlot.morning + firstPorSlot.afternoon;
const uniqueCandidates = new Set(manifests.flatMap((manifest) => [...manifest.firstContactIds, ...manifest.followupIds]));
if (uniqueCandidates.size < pedidos) {
  throw new Error(`So ha ${uniqueCandidates.size} candidatos seguros para ${date}; foram pedidos ${pedidos}.`);
}

for (const manifest of manifests) {
  fs.writeFileSync(manifestPath(manifest.slot), JSON.stringify(manifest, null, 2) + "\n");
  const ritmo = manifest.pacing ? ` ritmo ${JSON.stringify(manifest.pacing)}.` : "";
  console.log(`${manifest.slot}: ${manifest.followupIds.length} follow-ups + ${manifest.firstContactIds.length} primeiras mensagens; alvo acumulado ${manifest.cumulativeTarget}.${ritmo}`);
}
console.log(`Manifestos preparados para ${date}. Nenhuma mensagem foi enviada.`);
