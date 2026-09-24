/**
 * Consome uma aprovacao e delega aos scripts existentes.
 * Nao implementa envio direto: as regras antibloqueio continuam centralizadas neles.
 *
 * O lote leva mais de uma hora para sair e a tarefa agendada chama este script de 5 em
 * 5 minutos dentro da janela. Quem esta com o lote na mao segura um LEASE; os ticks
 * seguintes veem o lease vivo e saem calados. Se o runner morrer no meio (11/08/2026:
 * a tarde inteira foi perdida depois de UMA mensagem, porque a aprovacao ja tinha sido
 * marcada como consumida e ninguem podia retomar), o proximo tick encontra o lease
 * orfao e termina o que faltou. Reenviar a mesma lista e seguro: os dois scripts
 * deduplicam pelo banco (`jaDisparado` no disparo frio, janela D+N no follow-up).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MAX_ATTEMPTS, validateProspectingApproval } from "../src/lib/prospectingApproval.ts";

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
const dispatchLog = path.join(DIR, `${date}-${slot}.dispatch.log`);
// Set-Content -Encoding UTF8 do PowerShell 5.1 escreve BOM, e JSON.parse morre nele.
// A aprovacao de 11/08 veio assim; ler tolerando o BOM evita que o runner caia na
// primeira linha por causa de quem escreveu o arquivo.
const lerJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

if (!fs.existsSync(manifestFile)) throw new Error(`Manifesto ausente: ${manifestFile}`);
const manifest = lerJson(manifestFile);

// Ritmo vem do manifesto (24/08/2026), nao do default do script: dia de volume baixo
// depois da restricao de 18/08 precisa das mensagens espalhadas em horas, e o default
// de 90-240s esvaziaria o lote inteiro em menos de uma hora. Manifesto sem `pacing`
// continua rodando exatamente como antes.
const pacing = manifest.pacing ?? {};
const pacingArgs = [
  ["min", pacing.min],
  ["max", pacing.max],
  ["pausa", pacing.pausa],
  ["bloco", pacing.bloco],
  ["teto-numero", pacing.tetoNumero],
]
  .filter(([, valor]) => Number.isFinite(valor) && valor > 0)
  .map(([nome, valor]) => `--${nome}=${valor}`);

const carimbo = () => new Date().toISOString().slice(11, 19);
const registrar = (linha) => {
  console.log(linha);
  fs.appendFileSync(dispatchLog, `[${carimbo()}] ${linha}\n`);
};

function lerAprovacao() {
  return fs.existsSync(approvalFile) ? lerJson(approvalFile) : null;
}

function gravarAprovacao(proxima) {
  const temporary = `${approvalFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(proxima, null, 2) + "\n");
  fs.renameSync(temporary, approvalFile);
}

// process.kill(pid, 0) nao mata nada: so pergunta se o processo ainda existe.
function runnerVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

const approval = lerAprovacao();
const validation = validateProspectingApproval(manifest, approval, localDate(), { isRunnerAlive: runnerVivo });
if (!validation.ok) {
  // "em_andamento" e o caso normal a cada 5 minutos: nao suja o log de tick nenhum.
  if (validation.reason !== "em_andamento") {
    registrar(`Sem disparo para ${date}/${slot}: ${validation.reason}.`);
  }
  process.exit(0);
}

// Instancia caida NAO e tentativa. Em 16/09/2026 o servidor da Uazapi caiu e 4 ticks
// seguidos de "Instancia nao esta conectada" consumiram a tarde inteira como se fosse
// bloqueio. Com o servidor free (cai a cada poucas horas e o Erick reconecta pelo QR)
// isso mataria todo dia: aqui o tick espera calado e so pega o lease com ela conectada.
// Os scripts de envio leem o .env sozinhos; este runner tambem, so para esta checagem.
for (const linha of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const statusInstancia = await fetch(`${process.env.UAZAPI_BASE_URL}/instance/status`, {
  headers: { token: process.env.UAZAPI_INSTANCE_TOKEN },
})
  .then((r) => r.json())
  .then((j) => j?.instance?.status ?? "desconhecida")
  .catch(() => "desconhecida");
if (statusInstancia !== "connected") {
  // Uma linha por mudanca de estado, nao por tick: 12 ticks por hora sujariam o log.
  if (approval.waitingInstance?.status !== statusInstancia) {
    gravarAprovacao({ ...approval, waitingInstance: { status: statusInstancia, since: new Date().toISOString() } });
    registrar(`Instancia ${statusInstancia}; ${date}/${slot} aguarda reconexao sem gastar tentativa.`);
  }
  process.exit(0);
}
if (approval.waitingInstance) {
  registrar(`Instancia voltou (estava ${approval.waitingInstance.status} desde ${approval.waitingInstance.since.slice(11, 19)}Z).`);
}

const tentativa = (approval.attempts ?? 0) + 1;
gravarAprovacao({
  ...approval,
  attempts: tentativa,
  lease: { pid: process.pid, startedAt: new Date().toISOString(), attempt: tentativa },
  lastError: undefined,
  waitingInstance: undefined,
});

// Dois ticks podem ter passado pela validacao no mesmo segundo. Quem reler e nao se
// achar dono desiste, entao no maximo um runner segue para o envio.
const confirmacao = lerAprovacao();
if (confirmacao?.lease?.pid !== process.pid) {
  console.log(`Outro runner assumiu ${date}/${slot}; nada a fazer.`);
  process.exit(0);
}

registrar(
  validation.resuming
    ? `RETOMANDO ${date}/${slot} (tentativa ${tentativa}/${MAX_ATTEMPTS}); o que ja saiu hoje e ignorado pelos scripts.`
    : `Iniciando ${date}/${slot} (tentativa ${tentativa}/${MAX_ATTEMPTS})${pacingArgs.length ? ` com ritmo ${pacingArgs.join(" ")}` : ""}.`,
);

// Saida dos filhos vai direto para arquivo, por descritor. O transcript do PowerShell
// perde tudo que estava em buffer quando o processo morre, e foi por isso que o
// diagnostico de 11/08 nao tinha uma linha sequer do que o node fez.
const fd = fs.openSync(dispatchLog, "a");

function run(script, ids, extra = []) {
  if (!ids.length) return;
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts", script),
      "--go",
      `--ids=${ids.join(",")}`,
      `--limit=${ids.length}`,
      `--teto-dia=${manifest.cumulativeTarget}`,
      ...pacingArgs,
      ...extra,
    ],
    { cwd: ROOT, stdio: ["ignore", fd, fd] },
  );
  if (result.status !== 0) {
    const erro = new Error(`${script} interrompeu com exit ${result.status}; o proximo grupo nao sera executado.`);
    // Exit 2 e parada deliberada dos scripts (duas falhas seguidas = primeiro sinal de
    // bloqueio, ou envio que o CRM nao registrou). Insistir de 5 em 5 minutos nesse
    // caso e justamente o que derruba o numero. So retomamos morte inesperada.
    erro.deliberada = result.status === 2;
    // Exit 3 = a instancia caiu no meio do lote. Nao e bloqueio nem morte inesperada:
    // a tentativa e devolvida e o proximo tick retoma assim que ela reconectar.
    erro.instanciaCaida = result.status === 3;
    throw erro;
  }
}

try {
  run("uazapi-followup-batch.mjs", manifest.followupIds);
  // Manifesto v2 (piloto): o envio confere que a copy do deal ainda e a aprovada no hash.
  const conferenciaCopy = manifest.version === 2 ? [`--manifest=${path.relative(ROOT, manifestFile)}`] : [];
  run("uazapi-send-batch.mjs", manifest.firstContactIds, ["--strict-ids", ...conferenciaCopy]);
  const agora = new Date().toISOString();
  gravarAprovacao({ ...lerAprovacao(), lease: null, completedAt: agora, consumedAt: agora });
  registrar(`Aprovacao ${date}/${slot} concluida. O teto acumulado permaneceu em ${manifest.cumulativeTarget}.`);
} catch (error) {
  const agora = new Date().toISOString();
  if (error.instanciaCaida) {
    gravarAprovacao({
      ...lerAprovacao(),
      lease: null,
      attempts: tentativa - 1,
      lastError: `${agora} ${error.message}`,
    });
    registrar(`PAUSOU ${date}/${slot}: instancia caiu no meio do lote. Tentativa devolvida (${tentativa - 1}/${MAX_ATTEMPTS}); retoma quando reconectar.`);
    process.exitCode = 3;
  } else {
    const encerra = error.deliberada || tentativa >= MAX_ATTEMPTS;
    gravarAprovacao({
      ...lerAprovacao(),
      lease: null,
      lastError: `${agora} ${error.message}`,
      ...(encerra ? { abortedAt: agora, consumedAt: agora } : {}),
    });
    registrar(
      encerra
        ? `FALHOU ${date}/${slot} na tentativa ${tentativa}/${MAX_ATTEMPTS}: ${error.message} Nao havera nova tentativa hoje.`
        : `FALHOU ${date}/${slot} na tentativa ${tentativa}/${MAX_ATTEMPTS}: ${error.message} O proximo tick retoma.`,
    );
    process.exitCode = 1;
  }
} finally {
  fs.closeSync(fd);
}
