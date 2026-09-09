import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const sourceArgument = process.argv.find((value) => value.startsWith("--source="));
const sourceRoot = sourceArgument ? path.resolve(sourceArgument.slice("--source=".length)) : "";
const envPath = path.resolve(".env");
const ignoredDirectories = new Set([".git", ".next", ".vercel", "node_modules"]);

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, "")]),
  );
}

function collectFiles(root, relative = "") {
  const directory = path.join(root, relative);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) return collectFiles(root, nextRelative);
    if (!entry.isFile()) return [];
    if (/^\.env(?:\.|$)/i.test(entry.name) && entry.name !== ".env.example") return [];

    const absolute = path.join(root, nextRelative);
    const content = fs.readFileSync(absolute);
    return [{
      absolute,
      file: nextRelative.replaceAll(path.sep, "/"),
      sha: crypto.createHash("sha1").update(content).digest("hex"),
      size: content.byteLength,
    }];
  });
}

async function uploadFile(file, token, teamId) {
  const content = fs.readFileSync(file.absolute);
  const response = await fetch(`https://api.vercel.com/v2/files?teamId=${encodeURIComponent(teamId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.size),
      "x-vercel-digest": file.sha,
    },
    body: content,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upload falhou para ${file.file} (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
}

async function uploadAll(files, token, teamId, concurrency = 8) {
  let cursor = 0;
  let uploaded = 0;
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      await uploadFile(files[index], token, teamId);
      uploaded += 1;
      if (uploaded % 50 === 0 || uploaded === files.length) {
        console.log(`Arquivos preparados: ${uploaded}/${files.length}`);
      }
    }
  });
  await Promise.all(workers);
}

if (!sourceRoot || !fs.statSync(sourceRoot, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error("Passe --source=<diretorio> apontando para um staging existente.");
}
if (!fs.existsSync(path.join(sourceRoot, "package.json"))) {
  throw new Error("O staging nao contem package.json.");
}

const env = { ...readEnv(envPath), ...process.env };
if (!env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID) {
  throw new Error("VERCEL_TOKEN e VERCEL_PROJECT_ID sao obrigatorias.");
}

const files = collectFiles(sourceRoot).sort((left, right) => left.file.localeCompare(right.file));
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
console.log(JSON.stringify({ sourceRoot, files: files.length, totalBytes, target: "production", apply: APPLY }, null, 2));
if (!APPLY) {
  console.log("Dry-run concluido. Use --apply para publicar este staging.");
  process.exit(0);
}

const headers = { Authorization: `Bearer ${env.VERCEL_TOKEN}` };
const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${env.VERCEL_PROJECT_ID}`, { headers });
const project = await projectResponse.json();
if (!projectResponse.ok) throw new Error(project?.error?.message ?? `Projeto Vercel indisponivel (HTTP ${projectResponse.status}).`);

await uploadAll(files, env.VERCEL_TOKEN, project.accountId);

const deploymentResponse = await fetch(
  `https://api.vercel.com/v13/deployments?forceNew=1&teamId=${encodeURIComponent(project.accountId)}`,
  {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: project.name,
      project: project.id,
      target: "production",
      files: files.map(({ file, sha, size }) => ({ file, sha, size })),
      meta: { deploymentSource: "codex-isolated-staging" },
    }),
  },
);
const deployment = await deploymentResponse.json();
if (!deploymentResponse.ok) {
  throw new Error(deployment?.error?.message ?? `Falha ao criar deployment (HTTP ${deploymentResponse.status}).`);
}

console.log(`Deployment criado: ${deployment.id}`);
console.log(`URL inicial: https://${deployment.url}`);

const deadline = Date.now() + 10 * 60 * 1000;
let current = deployment;
while (Date.now() < deadline && !["READY", "ERROR", "CANCELED"].includes(current.readyState)) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const statusResponse = await fetch(
    `https://api.vercel.com/v13/deployments/${deployment.id}?teamId=${encodeURIComponent(project.accountId)}`,
    { headers },
  );
  current = await statusResponse.json();
  if (!statusResponse.ok) throw new Error(current?.error?.message ?? `Falha ao consultar deployment (HTTP ${statusResponse.status}).`);
  console.log(`Estado: ${current.readyState}`);
}

console.log(JSON.stringify({
  id: current.id,
  url: current.url ? `https://${current.url}` : null,
  readyState: current.readyState,
  aliases: current.alias ?? [],
  errorCode: current.errorCode ?? null,
  errorMessage: current.errorMessage ?? null,
}, null, 2));

if (current.readyState !== "READY") process.exitCode = 1;
