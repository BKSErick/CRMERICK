/**
 * checar-mx-fila.mjs
 * Confere se o dominio de cada e-mail de `email_queue.json` tem MX antes do disparo.
 *
 * Por que existe: 08-14/09 fecharam com 8,3% de hard bounce (limite que queima dominio
 * novo e ~2%). E-mail de cadastro da Receita e o pior caso: caixa criada na abertura da
 * empresa e abandonada. Dominio sem MX e bounce garantido, entao sai da fila antes de
 * gastar reputacao. Dominio com MX vivo ainda pode ter caixa morta (Frasil, Movicorp em
 * 11/09), mas isso so o bounce real revela; `brevo-events.mjs --bloquear` cuida depois.
 *
 * Nao mexe na fila: grava `sem_mx` na blocklist, e o proximo build-queue-institucional
 * ja deixa o endereco de fora. Rodar de scripts/email, DEPOIS do build e ANTES do send,
 * e rodar o build de novo em seguida.
 *
 * USO:
 *   node checar-mx-fila.mjs          # dry-run: lista quem cairia
 *   node checar-mx-fila.mjs --go     # grava sem_mx na blocklist
 */

import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { lerBlocklist, salvarBlocklist, bloquear } from "./blocklist.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const GO = process.argv.includes("--go");
const FILA = path.join(AQUI, "email_queue.json");

if (!fs.existsSync(FILA)) {
  console.error("email_queue.json nao existe. Rode build-queue-institucional.mjs antes.");
  process.exit(1);
}
const fila = JSON.parse(fs.readFileSync(FILA, "utf8"));
const dominios = [...new Set(fila.map((x) => String(x.email).split("@")[1]).filter(Boolean))];

async function temMx(dominio) {
  try {
    const mx = await dns.resolveMx(dominio);
    if (mx.length) return true;
  } catch {
    /* sem MX: tenta A, alguns dominios pequenos recebem pelo A */
  }
  try {
    const a = await dns.resolve4(dominio);
    return a.length > 0;
  } catch {
    return false;
  }
}

const mortos = new Set();
for (let i = 0; i < dominios.length; i += 10) {
  await Promise.all(
    dominios.slice(i, i + 10).map(async (d) => {
      if (!(await temMx(d))) mortos.add(d);
    }),
  );
}

const cairiam = fila.filter((x) => mortos.has(String(x.email).split("@")[1]));
console.log(`Fila: ${fila.length} e-mails em ${dominios.length} dominios | sem MX/A: ${mortos.size} dominios, ${cairiam.length} e-mails`);
for (const x of cairiam) console.log(`  #${x.dealId} ${String(x.company).slice(0, 36).padEnd(36)} ${x.email}`);

if (!GO) {
  console.log(cairiam.length ? "\nDry-run: nada bloqueado. Rode com --go para gravar sem_mx na blocklist." : "\nNada a bloquear.");
  process.exit(0);
}
const lista = lerBlocklist();
for (const x of cairiam) bloquear(lista, x.email, "sem_mx", { origem: "checar-mx-fila" });
salvarBlocklist(lista);
console.log(`\nBlocklist: +${cairiam.length} sem_mx. Rode o build-queue-institucional.mjs de novo antes do send.`);
