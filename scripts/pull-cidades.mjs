/**
 * pull-cidades.mjs
 * Roda o pull-city-serper.mjs para varias cidades em sequencia, com log por cidade, e
 * (opcional) ja colhe e-mail dos leads que entraram (colher-emails.mjs --desde=hoje).
 *
 * Existe porque "quero 1000 e-mails" nao cabe em uma cidade: Sete Lagoas e Monlevade
 * rendem ~150 leads cada e a base ja tinha as duas. A lista padrao sao os polos
 * industriais de MG (RMBH, Vale do Aco, Centro-Oeste, Sul, Triangulo, Zona da Mata),
 * na ordem de proximidade com os cases (Jotta em Monlevade, Metalthec), porque a copy e
 * a doutrina foram construidas em cima de MG e nao houve decisao de sair do estado.
 *
 * USO:
 *   node scripts/pull-cidades.mjs                                  # dry-run das cidades padrao
 *   node scripts/pull-cidades.mjs --go                             # importa
 *   node scripts/pull-cidades.mjs --cidades="Betim,Contagem" --go
 *   node scripts/pull-cidades.mjs --go --colher                    # e colhe e-mail dos novos no fim
 *   node scripts/pull-cidades.mjs --go --colher --max-serper=300   # colheita com descoberta de CNPJ
 *   node scripts/pull-cidades.mjs --paginas=3 --go                 # cidade grande
 *
 * Credito Serper: 12 nichos x N paginas = 12N chamadas por cidade (24 com o padrao).
 * Log: logs/pull-cidades-<data>.log
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d = "") => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const GO = process.argv.includes("--go");
const COLHER = process.argv.includes("--colher");
const UF = arg("uf", "MG");
// Cada chamada ao /maps com num=20 custa 3 creditos (medido 18/09/2026: 26 chamadas = 78).
// 13 nichos x 1 pagina = 39 creditos; x 2 = 78. Cidade grande vale a 2a pagina, as outras
// nao enchem nem a primeira.
const PAGINAS = arg("paginas", "");
const GRANDES = new Set(["belo horizonte", "contagem", "betim", "ipatinga", "juiz de fora", "uberlandia", "divinopolis"]);
const MAX_SERPER = arg("max-serper", "");
// Para de puxar quando o saldo total do Serper cair abaixo disso (fica pra descoberta de CNPJ).
const RESERVA = Number(arg("reserva", "0"));

// Le SO as chaves do Serper do .env.local do Garimpo, em variavel local. NUNCA carregar esse
// arquivo no process.env: ele tambem tem SUPABASE_URL/KEY (do Garimpo), o filho herda o env
// e o pull passa a bater no Supabase errado com "Invalid API key" (aconteceu em 18/09/2026,
// 11 cidades de credito perdidas antes de alguem olhar o log).
function lerVariavel(arquivo, nome) {
  if (!fs.existsSync(arquivo)) return "";
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m && m[1] === nome) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
const CHAVES = lerVariavel("D:/001Gravity/Garimpo SAAS NOVO/.env.local", "SERPER_API_KEYS").split(",").map((s) => s.trim()).filter(Boolean);
async function saldoSerper() {
  let total = 0;
  for (const k of CHAVES) {
    try {
      const r = await fetch("https://google.serper.dev/account", { headers: { "X-API-KEY": k } });
      const j = await r.json();
      if (Number(j.balance) > 0) total += Number(j.balance);
    } catch {
      /* chave fora */
    }
  }
  return total;
}

export const CIDADES_MG = [
  // RMBH e entorno (DDD 31)
  "Betim", "Contagem", "Belo Horizonte", "Santa Luzia", "Vespasiano", "Sabara", "Nova Lima", "Ibirite",
  "Ribeirao das Neves", "Pedro Leopoldo", "Matozinhos", "Lagoa Santa", "Itabirito", "Ouro Preto",
  // Vale do Aco e Leste (DDD 31/33)
  "Ipatinga", "Coronel Fabriciano", "Timoteo", "Itabira", "Governador Valadares", "Caratinga",
  // Alto Paraopeba e Vertentes (DDD 31/32)
  "Conselheiro Lafaiete", "Ouro Branco", "Congonhas", "Barbacena", "Sao Joao del Rei",
  // Centro-Oeste (DDD 37)
  "Divinopolis", "Itauna", "Para de Minas", "Nova Serrana", "Bom Despacho", "Formiga",
  // Sul (DDD 35)
  "Pocos de Caldas", "Pouso Alegre", "Varginha", "Itajuba", "Extrema", "Santa Rita do Sapucai", "Lavras", "Tres Coracoes", "Passos",
  // Triangulo e Alto Paranaiba (DDD 34)
  "Uberlandia", "Uberaba", "Araxa", "Araguari", "Patos de Minas", "Ituiutaba",
  // Zona da Mata (DDD 32)
  "Juiz de Fora", "Uba", "Cataguases",
  // Norte e Central (DDD 38)
  "Montes Claros", "Curvelo",
];

const cidades = (arg("cidades") ? arg("cidades").split(",") : CIDADES_MG).map((c) => c.trim()).filter(Boolean);
const hoje = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.join(RAIZ, "logs"), { recursive: true });
const logPath = path.join(RAIZ, "logs", `pull-cidades-${hoje}.log`);
const log = fs.createWriteStream(logPath, { flags: "a" });
const escrever = (s) => {
  process.stdout.write(s);
  log.write(s);
};

function rodar(args) {
  return new Promise((resolve) => {
    const saida = [];
    const p = spawn(process.execPath, args, { cwd: RAIZ, env: process.env, windowsHide: true });
    const cata = (buf) => {
      const s = buf.toString();
      saida.push(s);
      log.write(s);
    };
    p.stdout.on("data", cata);
    p.stderr.on("data", cata);
    p.on("close", (code) => resolve({ code, saida: saida.join("") }));
  });
}

const saldoInicial = await saldoSerper();
escrever(`\n===== pull-cidades ${new Date().toISOString()} | ${cidades.length} cidades | UF ${UF} | paginas ${PAGINAS || "1 (2 nas grandes)"} | ${GO ? "GRAVA" : "dry-run"} | Serper ${saldoInicial} creditos${RESERVA ? `, reserva ${RESERVA}` : ""} =====\n`);
const resumo = [];
let falhasSeguidas = 0;
for (const [i, cidade] of cidades.entries()) {
  const t0 = Date.now();
  const paginas = PAGINAS || (GRANDES.has(cidade.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()) ? "2" : "1");
  if (RESERVA) {
    const saldo = await saldoSerper();
    if (saldo - 39 * Number(paginas) < RESERVA) {
      escrever(`\nSaldo Serper ${saldo} bateria na reserva ${RESERVA}. Parando antes de ${cidade}.\n`);
      break;
    }
  }
  escrever(`\n--- [${i + 1}/${cidades.length}] ${cidade} (${paginas} pag) ---\n`);
  const args = [path.join(RAIZ, "scripts/pull-city-serper.mjs"), `--cidade=${cidade}`, `--uf=${UF}`, `--paginas=${paginas}`];
  if (GO) args.push("--go");
  const { code, saida } = await rodar(args);
  const novos = saida.match(/Novos:\s*(\d+)/)?.[1] ?? "?";
  const importados = saida.match(/Importados:\s*(\d+)\/(\d+)/)?.[1] ?? (GO ? "0" : "-");
  const candidatos = saida.match(/Lugares unicos em [^:]+:\s*(\d+)/i)?.[1] ?? "?";
  const linha = { cidade, candidatos, novos, importados, code, seg: Math.round((Date.now() - t0) / 1000) };
  resumo.push(linha);
  escrever(`>>> ${cidade}: candidatos ${candidatos} | novos ${novos} | importados ${importados} | ${linha.seg}s | exit ${code}\n`);
  if (/Todas as chaves do Serper falharam/.test(saida)) {
    escrever(`\nSerper sem credito. Parando.\n`);
    break;
  }
  // Exit != 0 depois de gastar credito no Maps e infra (Supabase, rede), nao e a cidade.
  // Duas seguidas = parar antes de queimar a lista inteira.
  falhasSeguidas = code === 0 ? 0 : falhasSeguidas + 1;
  if (falhasSeguidas >= 2) {
    const erro = saida.match(/^Error: .*$/m)?.[0] || "(sem linha de erro)";
    escrever(`\nDuas cidades seguidas com erro. Parando. Ultimo erro: ${erro}\n`);
    break;
  }
}

escrever(`\n===== Resumo =====\n`);
for (const r of resumo) escrever(`  ${r.cidade.padEnd(24)} candidatos ${String(r.candidatos).padStart(4)} | novos ${String(r.novos).padStart(4)} | importados ${String(r.importados).padStart(4)} | ${r.seg}s\n`);
const totalImportados = resumo.reduce((s, r) => s + (Number(r.importados) || 0), 0);
escrever(`Total importados: ${totalImportados} | Serper: ${saldoInicial} -> ${await saldoSerper()} creditos\nLog: ${logPath}\n`);

if (COLHER && GO) {
  escrever(`\n===== colher-emails --desde=${hoje} --go =====\n`);
  const args = [path.join(RAIZ, "scripts/email/colher-emails.mjs"), `--desde=${hoje}`, "--go"];
  if (MAX_SERPER) args.push("--descobrir-cnpj", `--max-serper=${MAX_SERPER}`);
  const { saida } = await rodar(args);
  process.stdout.write(saida.split("\n").filter((l) => !/^\s+\d+\/\d+ \|/.test(l)).join("\n"));
}
log.end();
