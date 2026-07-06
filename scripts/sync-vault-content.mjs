// Sync vault -> content/ : parseia os docs curados do Obsidian (fonte de verdade)
// e gera JSON commitado no repo, pra as telas funcionarem no build da Vercel
// (o vault fica FORA do repo, entao lemos aqui local e versionamos a saida).
//
// Uso: node scripts/sync-vault-content.mjs [caminho-do-vault-root]
import fs from "node:fs";
import path from "node:path";

const VAULT_ROOT = process.argv[2] || "D:/01 -Arquivos/Obsidian/obsidian-mind";
const CRM_DIR = path.join(VAULT_ROOT, "SaaS", "CRM ERICK");
const ERICK_DIR = path.join(CRM_DIR, "Erick Sena");

const OUT_DIR = path.resolve(process.cwd(), "content");
fs.mkdirSync(OUT_DIR, { recursive: true });

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}
function frontmatterDesc(md) {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return "";
  const d = fm[1].match(/description:\s*["']?(.+?)["']?\s*$/m);
  return d ? d[1].trim() : "";
}
function firstHeading(md) {
  const h = md.match(/^#\s+(.+)/m);
  return h ? h[1].replace(/[*_`#]/g, "").trim() : "";
}
const DEAD = /BackstageFY|Backstage FY|BKS[- ]?Grow/i;
function write(name, payload) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(payload, null, 2), "utf8");
}

// ============ 1) CONTEUDO (posts + stories) ============
function parseCopies(md) {
  const items = [];
  for (const block of md.split(/\n(?=### )/)) {
    const head = block.match(/^###\s+(?:📌|🎬)?\s*(Post|Story)\s+(\d+):\s*(.+)/i);
    if (!head) continue;
    const type = /post/i.test(head[1]) ? "Post" : "Story";
    const hookMatch = block.match(/\*\*Texto na Imagem\*\*:\s*\*?["“]?([^"”*]+)["”]?\*?/i);
    const legIdx = block.search(/\*\*Legenda[^*]*\*\*/i);
    const scope = legIdx >= 0 ? block.slice(legIdx) : block;
    const firstQuote = scope.match(/\n\s*>\s*(.+)/);
    items.push({
      n: Number(head[2]),
      type,
      title: head[3].trim(),
      hook: hookMatch ? hookMatch[1].trim() : "",
      excerpt: firstQuote ? firstQuote[1].trim().slice(0, 180) : "",
      status: "Planejado",
    });
  }
  return items;
}
const copies = parseCopies(read(path.join(ERICK_DIR, "copies_instagram.md")));
write("conteudo.json", {
  generatedAt: new Date().toISOString(),
  source: "vault: SaaS/CRM ERICK/Erick Sena/copies_instagram.md",
  counts: {
    total: copies.length,
    posts: copies.filter((i) => i.type === "Post").length,
    stories: copies.filter((i) => i.type === "Story").length,
  },
  items: copies.sort((a, b) => (a.type === b.type ? a.n - b.n : a.type === "Post" ? -1 : 1)),
});

// ============ 2) BRAIN (indice de docs estrategicos ATUAIS) ============
// Fonte: SaaS/CRM ERICK/** + thinking/*Erick Sena* . Exclui BackstageFY/BKS-Grow morto
// e os docs ja usados em Conteudo (copies/threads).
const EXCLUDE_FROM_BRAIN = /copies_instagram|Threads_Posts_Prontos/i;
const brainFiles = [
  ...walk(CRM_DIR),
  ...walk(path.join(VAULT_ROOT, "thinking")).filter((f) => /Erick Sena/i.test(f)),
];
const brain = [];
for (const file of brainFiles) {
  if (EXCLUDE_FROM_BRAIN.test(file)) continue;
  const md = read(file);
  if (DEAD.test(md.slice(0, 600))) continue; // pula docs mortos (BackstageFY)
  const rel = path.relative(VAULT_ROOT, file).replace(/\\/g, "/");
  const category = rel.includes("thinking/")
    ? "Thinking"
    : rel.split("/").slice(2, 3)[0] === "Erick Sena"
      ? "Erick Sena"
      : rel.split("/").slice(2, 3)[0] || "CRM";
  brain.push({
    title: firstHeading(md) || path.basename(file, ".md"),
    description: frontmatterDesc(md) || "",
    category: category.replace(/\.md$/, ""),
    file: rel,
  });
}
brain.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
write("brain.json", {
  generatedAt: new Date().toISOString(),
  source: "vault: SaaS/CRM ERICK/** + thinking/*Erick Sena*",
  count: brain.length,
  items: brain,
});

// ============ 3) CARTEIRA (clientes ATIVOS curados) ============
// Set definido pelo Erick: Metalthec, Jotta, OStrack (SaaS proprio), Ideia Hub (agencia).
function clientDesc(folder, fallback) {
  const md = read(path.join(VAULT_ROOT, "Clientes", folder, `${folder}.md`));
  if (!md) return fallback;
  const desc = frontmatterDesc(md);
  if (desc) return desc.slice(0, 200);
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const firstLine = body.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">"));
  return (firstLine || fallback).trim().slice(0, 200);
}
const carteira = [
  { name: "Metalthec", type: "Serviço", description: clientDesc("Metalthec", "Usinagem pesada industrial (Vale do Aço); prova real com parque Ø1300mm."), status: "Ativo" },
  { name: "Jotta Manutenções", type: "Serviço", description: clientDesc("Jotta Manutenções", "Manutenção industrial (Vale do Aço); case de landing/prospecção."), status: "Ativo" },
  { name: "OStrack", type: "SaaS próprio", description: "SaaS de gestão de ordens de serviço para recuperadora industrial (ativo do Erick).", status: "Ativo" },
  { name: "Ideia Hub", type: "Agência (prestador)", description: "Agência de marketing onde Erick atua como prestador de serviços (arquitetura/sistemas).", status: "Ativo" },
];
write("carteira.json", {
  generatedAt: new Date().toISOString(),
  source: "curado (Erick) + vault Clientes/*",
  count: carteira.length,
  items: carteira,
});

console.log(`✅ content/ gerado:`);
console.log(`   conteudo.json — ${copies.length} itens`);
console.log(`   brain.json    — ${brain.length} docs estrategicos`);
console.log(`   carteira.json — ${carteira.length} clientes ativos`);
