/**
 * normalize-segments.mjs
 * Preenche deals.segment_norm com uma das 5 chaves canonicas.
 *
 * POR QUE EXISTE: hoje so 384 dos 1030 deals tem segmento canonico. 525 estao
 * vazios e ~120 carregam a categoria crua do Google Maps com n=1 cada ("Trocadores
 * de Calor", "Vila Alpina", "Caixa de Correio"). Qualquer relatorio "por tipo de
 * empresa" agrupado nisso produz 120 grupos de 1 lead, que nao e agrupamento.
 *
 * O campo `segment` original NAO e tocado — a categoria crua e sinal util.
 *
 * USO:
 *   node scripts/normalize-segments.mjs           # dry-run: mostra o que mudaria
 *   node scripts/normalize-segments.mjs --go      # grava segment_norm
 *   node scripts/normalize-segments.mjs --amostra # mostra exemplos por segmento
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  carregarEnv,
  clienteSupabase,
  segmentoCanonico,
  CANONICOS,
  ehProspect,
} from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const GO = process.argv.includes("--go");
const AMOSTRA = process.argv.includes("--amostra");
const db = clienteSupabase();

(async () => {
  const [deals, contatos] = await Promise.all([
    db.get("deals?select=id,company,name,segment,segment_norm,is_prospect,description,site_url"),
    db.get("contacts?select=id,company,notes"),
  ]);

  // contacts nao tem coluna de segmento — o texto livre util fica em `notes`.
  // Serve de reforco quando o deal sozinho nao da sinal.
  const porEmpresa = new Map();
  for (const c of contatos) {
    if (c.company) porEmpresa.set(String(c.company).toLowerCase(), c.notes || "");
  }

  const planos = [];
  const contagem = Object.fromEntries([...CANONICOS, "(sem classificacao)"].map((k) => [k, 0]));
  const exemplos = {};
  let naoProspect = 0;

  for (const d of deals) {
    const reforco = porEmpresa.get(String(d.company || "").toLowerCase()) || "";
    const alvo = segmentoCanonico(d.segment, `${d.company || ""} ${d.name || ""}`, `${reforco} ${d.description || ""}`);
    const chave = alvo || "(sem classificacao)";
    contagem[chave]++;
    (exemplos[chave] ||= []).push(`${d.company || d.name} :: ${d.segment || "(vazio)"}`);

    // is_prospect e gravado SEMPRE, mesmo quando o segmento nao mudou: e ele que a
    // tela do CRM usa pra excluir cliente atual e contato pessoal das taxas.
    const prospect = ehProspect(d.company, d.name);
    if (prospect !== d.is_prospect) naoProspect += prospect ? 0 : 1;
    if ((alvo && d.segment_norm !== alvo) || d.is_prospect !== prospect) {
      planos.push({
        id: d.id,
        segment_norm: alvo || d.segment_norm || null,
        fonte: d.segment === alvo ? "canonico" : "inferido",
        is_prospect: prospect,
      });
    }
  }

  console.log(`\nDEALS: ${deals.length}   |   a gravar: ${planos.length}\n`);
  console.log("DISTRIBUICAO APOS NORMALIZAR");
  for (const [k, v] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(4)}  ${((v / deals.length) * 100).toFixed(1)}%`);
  }

  if (AMOSTRA) {
    for (const [k, lista] of Object.entries(exemplos)) {
      console.log(`\n--- ${k} (${lista.length}) ---`);
      for (const l of lista.slice(0, 12)) console.log(`  ${l}`);
    }
  }

  const semClass = contagem["(sem classificacao)"];
  if (semClass) {
    console.log(
      `\n${semClass} deals seguem sem segmento. Isso e proposital: e melhor um balde` +
        `\nhonesto do que empurrar o lead pro grupo errado e sujar a taxa dele.` +
        `\nRode com --amostra pra ver quais sao e decidir se vale nova regra.`,
    );
  }

  if (!GO) {
    console.log("\nDRY-RUN. Nada gravado. Rode com --go para aplicar.\n");
    return;
  }

  let feitos = 0;
  for (const p of planos) {
    await db.patch(`deals?id=eq.${p.id}`, {
      segment_norm: p.segment_norm,
      segment_norm_source: p.fonte,
      is_prospect: p.is_prospect,
    });
    if (++feitos % 50 === 0) console.log(`  ...${feitos}/${planos.length}`);
  }
  console.log(`\nOK: ${feitos} deals normalizados.\n`);
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});