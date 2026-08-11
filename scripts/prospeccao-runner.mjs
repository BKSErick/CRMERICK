import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, "logs");
const LOCK_FILE = path.join(LOG_DIR, "prospeccao-runner.lock");
const HEARTBEAT_FILE = path.join(LOG_DIR, "prospeccao-runner-heartbeat.json");
const AUDIT_FILE = path.join(LOG_DIR, "prospeccao-runner.jsonl");

function flagValue(argv, name, fallback = "") {
  const value = argv.find((item) => item.startsWith(`--${name}=`));
  return value ? value.split("=").slice(1).join("=") : fallback;
}

export function parseRunnerArgs(argv = process.argv.slice(2)) {
  return {
    go: argv.includes("--go"),
    city: flagValue(argv, "cidade"),
    uf: flagValue(argv, "uf", "MG"),
    limit: Number(flagValue(argv, "limit", "10")),
  };
}

export function buildRunPlan(input) {
  const go = input.go ? ["--go"] : [];
  const limit = `--limit=${Number.isFinite(input.limit) ? input.limit : 10}`;
  const plan = [];
  if (input.city) {
    plan.push({
      name: "pull",
      script: "scripts/pull-city-serper.mjs",
      args: [`--cidade=${input.city}`, `--uf=${input.uf || "MG"}`, limit, ...go],
    });
  }
  plan.push({
    name: "copies",
    script: "scripts/generate-copies-db.mjs",
    args: [...(input.city ? [`--cidade=${input.city}`] : []), ...go],
  });
  plan.push({ name: "first-contact", script: "scripts/uazapi-send-batch.mjs", args: [limit, ...go] });
  plan.push({ name: "followup", script: "scripts/uazapi-followup-batch.mjs", args: [limit, ...go] });
  return plan;
}

function writeAudit(record) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(record)}\n`, "utf8");
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(record, null, 2), "utf8");
}

function acquireLock() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  try {
    const handle = fs.openSync(LOCK_FILE, "wx");
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    fs.closeSync(handle);
  } catch (error) {
    if (error && error.code === "EEXIST") {
      throw new Error(`Runner ja esta em execucao. Lock: ${LOCK_FILE}`);
    }
    throw error;
  }
}

function runStep(step) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--env-file-if-exists=.env", step.script, ...step.args], {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const options = parseRunnerArgs();
  const runId = `prospect-${Date.now()}`;
  acquireLock();
  const summary = { runId, mode: options.go ? "live" : "dry-run", startedAt: new Date().toISOString(), steps: [] };
  try {
    writeAudit({ ...summary, status: "started" });
    for (const step of buildRunPlan(options)) {
      const startedAt = new Date().toISOString();
      writeAudit({ ...summary, status: "running", currentStep: step.name, heartbeatAt: startedAt });
      const exitCode = await runStep(step);
      summary.steps.push({ name: step.name, startedAt, finishedAt: new Date().toISOString(), exitCode });
      if (exitCode !== 0) throw new Error(`Etapa ${step.name} terminou com codigo ${exitCode}.`);
    }
    writeAudit({ ...summary, status: "completed", finishedAt: new Date().toISOString() });
  } catch (error) {
    writeAudit({ ...summary, status: "failed", error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() });
    process.exitCode = 1;
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
