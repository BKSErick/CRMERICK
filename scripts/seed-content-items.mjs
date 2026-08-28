// Importa o backlog editorial de content/conteudo.json (gerado do vault por
// sync-vault-content.mjs) para a tabela content_items, que passou a ser a fonte de
// verdade editavel. Idempotente: a chave (channel, type, legacy_n) faz rodar de novo
// atualizar em vez de duplicar.
//
// Uso:
//   node --env-file-if-exists=.env scripts/seed-content-items.mjs --dry-run
//   node --env-file-if-exists=.env scripts/seed-content-items.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");
const jsonPath = path.resolve(process.cwd(), "content", "conteudo.json");

if (!fs.existsSync(jsonPath)) {
  console.error(`Arquivo nao encontrado: ${jsonPath}\nRode antes: node scripts/sync-vault-content.mjs`);
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const items = Array.isArray(plan.items) ? plan.items : [];
if (items.length === 0) {
  console.error("conteudo.json nao tem itens.");
  process.exit(1);
}

// O `n` do vault NAO e unico: a numeracao de Story reinicia a cada bloco do doc
// (existem duas series de "Story 1..4"), e o mesmo vale pros threads, numerados por
// secao. Entao a chave do seed e uma ordem propria, contada por canal e tipo.
const ordinals = {};

const rows = items.map((item) => {
  const channel = item.canal === "threads" ? "threads" : "instagram";
  const key = `${channel}|${item.type}`;
  ordinals[key] = (ordinals[key] ?? 0) + 1;
  return {
    channel,
    type: item.type,
    title: item.title ?? null,
    hook: item.hook ?? null,
    excerpt: item.excerpt ?? null,
    // O parser do vault corta a legenda do Instagram na primeira linha do bloco
    // **Legenda**, entao a caption entra truncada de proposito: e um rascunho pra
    // editar na tela, nao texto pronto pra publicar.
    caption: item.excerpt ?? item.hook ?? null,
    status: "planejado",
    source: "vault",
    legacy_n: ordinals[key],
  };
});

const byChannel = rows.reduce((acc, row) => {
  acc[row.channel] = (acc[row.channel] ?? 0) + 1;
  return acc;
}, {});
console.log(`Lidos ${rows.length} itens de conteudo.json:`, byChannel);

if (dryRun) {
  console.log("\n--dry-run: nada foi gravado. Amostra:");
  console.log(JSON.stringify(rows.slice(0, 2), null, 2));
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase
  .from("content_items")
  .upsert(rows, { onConflict: "channel,type,legacy_n" })
  .select("id, channel, type, legacy_n");

if (error) {
  console.error("Falha no upsert:", error.message);
  process.exit(1);
}

console.log(`\nOK: ${data.length} itens gravados em content_items.`);
console.log("As legendas vieram truncadas do vault — revise na tela antes de publicar.");
