/**
 * lead-search-playbook.js - CLI de busca/scoring de leads (v2, Story 017).
 *
 * Usa o modulo COMPARTILHADO src/lib/leadScoring.js - a MESMA logica que a fila do dia
 * server-side (src/app/api/comando) consome. Enriquecimento por HTML e best-effort e opcional.
 *
 * Uso:
 *   node scripts/lead-search-playbook.js
 *   node scripts/lead-search-playbook.js --top=50 --json
 *   node scripts/lead-search-playbook.js --enrich [--enrich-limit=40]   (coleta HTML best-effort)
 *   node scripts/lead-search-playbook.js --compare=10                    (v1 vs v2 dos top N)
 */

const fs = require("node:fs");
const path = require("node:path");
const { HIGH_INTENT_QUERIES, dedupeLeads, diagnoseLead } = require("../src/lib/leadScoring.js");
const { fetchLeadHtml, analyzeHtml } = require("./lib/leadEnrich.js");

// Fonte primaria: js/ (quando presente). Fallback dev: legacy/js/ (gitignored, referencia local).
const DATA_CANDIDATES = [
  path.join(__dirname, "..", "js", "garimpo-leads.json"),
  path.join(__dirname, "..", "legacy", "js", "garimpo-leads.json"),
];

function arg(name, fallback) {
  const found = process.argv.find((x) => x.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : fallback;
}

const TOP = Number(arg("top", 50));
const JSON_OUTPUT = process.argv.includes("--json");
const ENRICH = process.argv.includes("--enrich");
const ENRICH_LIMIT = Number(arg("enrich-limit", 40));
const COMPARE = process.argv.some((x) => x === "--compare" || x.startsWith("--compare="));
const COMPARE_N = Number(arg("compare", 10));

function loadLeads() {
  const file = DATA_CANDIDATES.find((p) => fs.existsSync(p));
  if (!file) {
    console.error("Aviso: garimpo-leads.json nao encontrado em js/ nem legacy/js/. Nada a analisar.");
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw : raw.items || [];
}

async function run() {
  const leads = loadLeads();
  const unique = dedupeLeads(leads);
  const items = unique.map((lead) => ({ lead, diag: diagnoseLead(lead) }));
  items.sort((a, b) => b.diag.priority_score - a.diag.priority_score);

  if (ENRICH) {
    for (const item of items.slice(0, ENRICH_LIMIT)) {
      if (!item.diag.website) continue;
      const html = await fetchLeadHtml(item.diag.website);
      if (html) item.diag = diagnoseLead(analyzeHtml(item.lead, html));
    }
    items.sort((a, b) => b.diag.priority_score - a.diag.priority_score);
  }

  const enriched = items.map((i) => i.diag);

  if (COMPARE) {
    console.log(`# Comparativo v1 vs v2 (top ${COMPARE_N})`);
    console.log("rank | nome | v1 | v2 | delta | opportunity | consciencia | approach | canal");
    enriched.slice(0, COMPARE_N).forEach((d, i) => {
      console.log(
        `${i + 1} | ${d.name} | ${d.priority_score_v1} | ${d.priority_score} | ${d.priority_score - d.priority_score_v1} | ${d.opportunity} | ${d.consciousness} | ${d.recommended_approach} | ${d.channel}`,
      );
    });
    return;
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), queries: HIGH_INTENT_QUERIES, top: enriched.slice(0, TOP) }, null, 2));
    return;
  }

  console.log("Lead Search Playbook v2 - CRM ERICK");
  console.log(`Leads unicos: ${unique.length}${ENRICH ? " | enrich on" : ""}`);
  console.log(`\nTop ${TOP} por prioridade (v2):`);
  enriched.slice(0, TOP).forEach((d, i) => {
    console.log(
      `${i + 1}. ${d.name} | v2 ${d.priority_score} (v1 ${d.priority_score_v1}) | ${d.segment} | ${d.consciousness} | ${d.opportunity} | ${d.recommended_approach} | canal: ${d.channel}`,
    );
  });
}

if (require.main === module) {
  run().catch((e) => {
    console.error("Erro:", e.message);
    process.exit(1);
  });
}

module.exports = { loadLeads, run };
