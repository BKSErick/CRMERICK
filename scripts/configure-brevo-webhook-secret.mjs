import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const envPath = path.resolve(".env");

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, "")]),
  );
}

function replaceEnvValue(source, key, value) {
  const nextLine = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(source)) return source.replace(pattern, nextLine);
  return `${source.replace(/\s*$/, "")}\n${nextLine}\n`;
}

if (!fs.existsSync(envPath)) throw new Error("Arquivo .env nao encontrado.");
const source = fs.readFileSync(envPath, "utf8");
const env = { ...parseEnv(source), ...process.env };

if (!env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID) {
  throw new Error("VERCEL_TOKEN e VERCEL_PROJECT_ID sao obrigatorias.");
}
if (!APPLY) {
  console.log("Dry-run: geraria um segredo aleatorio, salvaria no .env local e faria upsert na Vercel production.");
  console.log("Use --apply para executar.");
  process.exit(0);
}

const secret = crypto.randomBytes(48).toString("base64url");
fs.writeFileSync(envPath, replaceEnvValue(source, "BREVO_CONVERSATIONS_WEBHOOK_SECRET", secret), "utf8");

const response = await fetch(
  `https://api.vercel.com/v10/projects/${env.VERCEL_PROJECT_ID}/env?upsert=true`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key: "BREVO_CONVERSATIONS_WEBHOOK_SECRET",
      value: secret,
      type: "sensitive",
      target: ["production"],
    }),
  },
);

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Falha ao configurar a Vercel (HTTP ${response.status}): ${body.slice(0, 300)}`);
}

console.log("BREVO_CONVERSATIONS_WEBHOOK_SECRET configurado no .env local e na Vercel production.");
console.log("O valor nao foi exibido.");
