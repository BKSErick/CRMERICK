/**
 * generate-copies-db.mjs
 * Gera a copy de abordagem direto do banco, para lead que NAO tem pagina de auditoria.
 *
 * O regenerate-copies.js le as paginas HTML em huberick-temp e grava arquivos _copy.txt.
 * Isso funciona para os leads antigos, que passaram pelo gerador de auditoria. Os leads
 * que entram pela puxada por cidade (pull-city-serper.mjs) nao tem pagina nenhuma, e sem
 * copy_text eles ficam parados: a fila de disparo exige copy.
 *
 * A copy sai do MESMO gerador (regenerate-copies.js), entao existe uma unica doutrina de
 * texto. Aqui so mudam as fontes: nota e avaliacoes vem de contacts, nao do HTML.
 *
 * USO:
 *   node scripts/generate-copies-db.mjs                          # dry-run, mostra 10
 *   node scripts/generate-copies-db.mjs --cidade="Joao Monlevade"
 *   node scripts/generate-copies-db.mjs --cidade="Joao Monlevade" --go
 *   node scripts/generate-copies-db.mjs --go --force             # reescreve quem ja tem
 *
 * NAO sobrescreve copy existente sem --force: varias copies foram aprovadas na mao.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { gerarCopy, ehSiteProprio, MINIMO_AVALIACOES } = require(path.join(RAIZ, "scripts/regenerate-copies.js"));
const { normalize } = require(path.join(RAIZ, "src/lib/leadScoring.js"));
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));

for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const GO = process.argv.includes("--go");
const FORCE = process.argv.includes("--force");
const CIDADE = arg("cidade", "");
const LIMITE = Number(arg("limit", 500));

const crm = ingest.crmClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mesma frase que a pagina de auditoria produzia, para a copy sair identica nas duas
// origens. Singular quando for uma avaliacao so: "1 avaliações" denuncia texto automatico.
function mapsInfoDe(rating, reviews) {
  const n = Number(reviews || 0);
  if (!rating && !n) return null;
  // Amostra minima: com 1 ou 2 avaliacoes a frase "operacao de verdade, com cliente
  // que volta" prova o contrario do que promete. Sem prova, vai a versao sem numero.
  if (n < MINIMO_AVALIACOES) return null;
  const partes = [];
  if (rating) partes.push(`${String(rating).replace(".", ",")} estrelas`);
  if (n) partes.push(`${n} ${n === 1 ? "avaliação" : "avaliações"}`);
  return partes.join(" com ");
}

(async () => {
  const [deals, contatos] = await Promise.all([
    // is_prospect=false NAO entra: sao clientes atuais (Jotta, Metalthec), contatos
    // pessoais e os deals orfaos "WhatsApp NNNN" que o webhook cria quando a resposta
    // nao acha o deal de origem. Sem esse filtro o gerador produzia copy do tipo
    // "Vi a WhatsApp 6346 no Google, e da pra ver que e operacao de verdade" — que,
    // disparada, queima o numero e o lead.
    ingest.buscarTudo(
      crm,
      "deals?stage=eq.prospect&is_prospect=not.is.false&select=id,company,segment,copy_text,site_url,analysis_url",
    ),
    ingest.buscarTudo(crm, "contacts?select=id,city,uf,rating,reviews_count,site_url"),
  ]);
  const C = Object.fromEntries(contatos.map((c) => [c.id, c]));

  const alvo = normalize(CIDADE);
  const fila = deals
    .map((d) => ({ ...d, contato: C[d.id] || {} }))
    .filter((d) => (FORCE ? true : !d.copy_text))
    .filter((d) => !alvo || normalize(d.contato.city).includes(alvo))
    .slice(0, LIMITE);

  console.log(`Prospects ${FORCE ? "para reescrever" : "sem copy"}${CIDADE ? ` em ${CIDADE}` : ""}: ${fila.length}`);
  console.log(`Modo: ${GO ? "GRAVA" : "dry-run"}\n`);
  if (!fila.length) return;

  let locais = 0;
  const gerados = fila.map((d) => {
    const c = d.contato;
    const copy = gerarCopy({
      empresa: d.company || "",
      // temSite pesa no texto: quem tem site recebe a versao "a prova esta espalhada",
      // quem nao tem recebe a versao "quem aparece na hora da busca entra na cotacao".
      temSite: ehSiteProprio(d.site_url) || ehSiteProprio(c.site_url),
      mapsInfo: mapsInfoDe(c.rating, c.reviews_count),
      cidade: c.city || null,
    });
    if (/de Monlevade mesmo/.test(copy)) locais++;
    return { id: d.id, empresa: d.company, copy };
  });

  console.log(`Com a variante local (case nomeado): ${locais}/${gerados.length}\n`);
  for (const g of gerados.slice(0, GO ? 3 : 6)) {
    console.log(`── #${g.id} ${g.empresa}`);
    console.log(g.copy.split("\n").map((l) => "   " + l).join("\n") + "\n");
  }

  if (!GO) {
    console.log("Dry-run: nada gravado. Rode com --go para salvar em deals.copy_text.");
    return;
  }

  let ok = 0;
  for (const g of gerados) {
    const r = await crm(`deals?id=eq.${g.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ copy_text: g.copy }),
    });
    if (r.ok) ok++;
    else console.log(`  FALHA #${g.id}: ${r.status}`);
  }
  console.log(`\nCopies gravadas: ${ok}/${gerados.length}.`);
  console.log("A fila de disparo (uazapi-send-batch) ja enxerga esses leads.");
})();