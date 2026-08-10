/**
 * Consome uma aprovacao uma unica vez e delega aos scripts existentes.
 * Nao implementa envio direto: as regras antibloqueio continuam centralizadas neles.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateProspectingApproval } from "../src/lib/prospectingApproval.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "logs", "prospecting-batches");
const arg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};
const date = arg("date");
const slot = arg("slot");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Informe --date=AAAA-MM-DD.");
if (!["morning", "afternoon"].includes(slot)) throw new Error("Informe --slot=morning ou --slot=afternoon.");

function localDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const manifestFile = path.join(DIR, `${date}-${slot}.manifest.json`);
const approvalFile = path.join(DIR, `${date}-${slot}.approval.json`);
if (!fs.existsSync(manifestFile)) throw new Error(`Manifesto ausente: ${manifestFile}`);
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const approval = fs.existsSync(approvalFile) ? JSON.parse(fs.readFileSync(approvalFile, "utf8")) : null;
const validation = validateProspectingApproval(manifest, approval, localDate());
if (!validation.ok) {
  console.log(`Sem disparo para ${date}/${slot}: ${validation.reason}.`);
  process.exit(0);
}

// Consome antes da primeira chamada. Assim crash, duplo clique ou duas tarefas
// concorrentes nunca reutilizam o mesmo OK. Os scripts ainda deduplicam pelo banco.
const consumed = { ...approval, consumedAt: new Date().toISOString() };
const temporary = `${approvalFile}.${process.pid}.tmp`;
fs.writeFileSync(temporary, JSON.stringify(consumed, null, 2) + "\n");
fs.renameSync(temporary, approvalFile);

function run(script, ids, extra = []) {
  if (!ids.length) return;
  const result = spawnSync(process.execPath, [
    path.join(ROOT, "scripts", script),
    "--go",
    `--ids=${ids.join(",")}`,
    `--limit=${ids.length}`,
    `--teto-dia=${manifest.cumulativeTarget}`,
    ...extra,
  ], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${script} interrompeu com exit ${result.status}; o proximo grupo nao sera executado.`);
  }
}

run("uazapi-followup-batch.mjs", manifest.followupIds);
run("uazapi-send-batch.mjs", manifest.firstContactIds, ["--strict-ids"]);
console.log(`Aprovacao ${date}/${slot} consumida. O teto acumulado permaneceu em ${manifest.cumulativeTarget}.`);
