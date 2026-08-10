/**
 * Congela os candidatos de um dia em dois manifestos. Nunca envia mensagens.
 * Instagram nao participa deste fluxo: a primeira abordagem no Instagram continua manual.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

function collect(script, kind, slot, limit, excluded = []) {
  const relativeOutput = path.join("logs", "prospecting-batches", `${date}-${slot}.${kind}.candidates.json`);
  const args = [
    path.join(ROOT, "scripts", script),
    `--limit=${limit}`,
    `--json-out=${relativeOutput}`,
  ];
  if (excluded.length) args.push(`--exclude-ids=${excluded.join(",")}`);
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Falha ao preparar ${kind}/${slot} (exit ${result.status}).`);
  const absoluteOutput = path.join(ROOT, relativeOutput);
  const payload = JSON.parse(fs.readFileSync(absoluteOutput, "utf8"));
  fs.unlinkSync(absoluteOutput);
  return Array.isArray(payload.ids) ? payload.ids.map(Number).filter(Number.isInteger) : [];
}

const morningFollowups = collect("uazapi-followup-batch.mjs", "followup", "morning", 10);
const morningFirst = collect("uazapi-send-batch.mjs", "first", "morning", 30);
const afternoonFollowups = collect("uazapi-followup-batch.mjs", "followup", "afternoon", 10, morningFollowups);
const afternoonFirst = collect("uazapi-send-batch.mjs", "first", "afternoon", 30, morningFirst);
const createdAt = new Date().toISOString();

const manifests = [
  {
    version: 1,
    date,
    slot: "morning",
    cumulativeTarget: 20,
    firstContactIds: morningFirst,
    followupIds: morningFollowups,
    createdAt,
  },
  {
    version: 1,
    date,
    slot: "afternoon",
    cumulativeTarget: 40,
    firstContactIds: afternoonFirst,
    followupIds: afternoonFollowups,
    createdAt,
  },
];

const uniqueCandidates = new Set(manifests.flatMap((manifest) => [...manifest.firstContactIds, ...manifest.followupIds]));
if (uniqueCandidates.size < 40) {
  throw new Error(`So ha ${uniqueCandidates.size} candidatos seguros para ${date}; sao necessarios pelo menos 40.`);
}

for (const manifest of manifests) {
  fs.writeFileSync(manifestPath(manifest.slot), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${manifest.slot}: ${manifest.followupIds.length} follow-ups + ${manifest.firstContactIds.length} primeiras mensagens; alvo acumulado ${manifest.cumulativeTarget}.`);
}
console.log(`Manifestos preparados para ${date}. Nenhuma mensagem foi enviada.`);
