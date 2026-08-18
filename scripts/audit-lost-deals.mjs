/**
 * Auditoria READ-ONLY dos deals em `lost`. Nao escreve NADA no banco.
 *
 * Por que existe (18/08/2026): a vistoria do funil achou 517 deals em `lost` sem
 * loss_reason_code, sem loss_recorded_by e sem loss_recorded_at -- ou seja, ninguem
 * registrou a perda. Desses, a maioria nunca recebeu uma unica mensagem e boa parte
 * esta marcada is_icp=true pelo proprio classificador. Antes de devolver qualquer lead
 * para a fila, o Erick precisa VER o que tem ali.
 *
 * Uso:
 *   node --env-file-if-exists=.env scripts/audit-lost-deals.mjs
 *   node --env-file-if-exists=.env scripts/audit-lost-deals.mjs --md   (grava docs/AUDITORIA-lost.md)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ehOrfao, ehProspect } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD = process.argv.includes("--md");
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!SUPA || !KEY) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

// PostgREST corta em 1000 linhas sem avisar; pagina sempre.
async function todas(caminho) {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${SUPA}/rest/v1/${caminho}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${de}-${de + 999}` },
    });
    const json = await r.json();
    if (!Array.isArray(json)) throw new Error(JSON.stringify(json).slice(0, 200));
    saida.push(...json);
    if (json.length < 1000) return saida;
  }
}

const lost = await todas(
  "deals?stage=eq.lost&select=id,company,name,segment,is_icp,icp_source,loss_reason_code,loss_recorded_by,loss_recorded_at,contact_id,points,created_at",
);
const atividades = await todas(
  "activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&select=deal_id",
);
const contatos = await todas("contacts?select=id,whatsapp_jid,phone");

const tocados = new Set(atividades.map((a) => Number(a.deal_id)).filter(Boolean));
// contacts.id e deals.id sao o MESMO numero para o mesmo lead (import do Garimpo), sem
// foreign key. Por isso o canal e resolvido por contact_id E, no fallback, pelo proprio
// id do deal: nos leads em lost o contact_id costuma vir nulo.
const porIdContato = new Map(contatos.map((c) => [Number(c.id), c]));
const comWhats = new Set(contatos.filter((c) => c.whatsapp_jid).map((c) => Number(c.id)));
const temCanal = (deal) =>
  comWhats.has(Number(deal.contact_id)) || comWhats.has(Number(deal.id));

const semRegistro = lost.filter((d) => !d.loss_reason_code && !d.loss_recorded_at);
const nuncaTocado = lost.filter((d) => !tocados.has(Number(d.id)));
// Candidato a volta: ICP, nunca contatado, sem motivo de perda e com WhatsApp confirmado.
const recuperaveis = lost.filter(
  (d) =>
    d.is_icp === true &&
    !tocados.has(Number(d.id)) &&
    !d.loss_reason_code &&
    !ehOrfao(d.company, d.name) &&
    ehProspect(d.company, d.name),
);
const comCanal = recuperaveis.filter(temCanal);
const comTelefone = recuperaveis.filter((d) => {
  const c = porIdContato.get(Number(d.id)) || porIdContato.get(Number(d.contact_id));
  return Boolean(c?.phone);
});
// Segmento vazio explica boa parte da vala comum: sem segment canonico o lead entra no
// CRM mas fica invisivel para a fila de disparo, entao ele nunca sai de lugar nenhum.
const semSegmento = recuperaveis.filter((d) => !d.segment);

const contar = (lista, campo) => {
  const mapa = {};
  for (const item of lista) {
    const chave = item[campo] === null || item[campo] === undefined ? "(vazio)" : String(item[campo]);
    mapa[chave] = (mapa[chave] || 0) + 1;
  }
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
};

const linhas = [];
const diz = (texto = "") => {
  linhas.push(texto);
  console.log(texto);
};

diz(`# Auditoria dos deals em \`lost\` — ${new Date().toISOString().slice(0, 10)}`);
diz();
diz(`Total em lost: **${lost.length}**`);
diz(`Sem motivo e sem data de perda registrados: **${semRegistro.length}**`);
diz(`Nunca receberam uma mensagem: **${nuncaTocado.length}**`);
diz(`Marcados is_icp=true: **${lost.filter((d) => d.is_icp === true).length}**`);
diz();
diz(`## Recuperaveis`);
diz();
diz(`ICP + nunca contatado + sem motivo de perda: **${recuperaveis.length}**`);
diz(`Desses, com telefone no contato: **${comTelefone.length}**`);
diz(`Desses, com WhatsApp ja confirmado (whatsapp_jid): **${comCanal.length}**`);
diz(`Desses, sem segmento canonico: **${semSegmento.length}** (sem segment o lead fica invisivel para a fila de disparo)`);
diz();
diz(`Para virarem fila de disparo faltam DOIS passos, nessa ordem:`);
diz(`1. \`node scripts/uazapi-check-numbers.mjs --go\` — nenhum deles passou pelo check, por isso o whatsapp_jid esta zerado.`);
diz(`2. preencher \`deals.segment\` canonico nos ${semSegmento.length} sem segmento.`);
diz(`So depois disso vale mover de \`lost\` para \`prospect\`.`);
diz();
diz(`## Distribuicoes`);
diz();
for (const [campo, titulo] of [
  ["icp_source", "Origem da classificacao ICP"],
  ["loss_reason_code", "Motivo da perda"],
  ["segment", "Segmento"],
]) {
  diz(`**${titulo}:** ` + contar(lost, campo).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(", "));
}
diz();
diz(`## Amostra dos recuperaveis com telefone (ate 40)`);
diz();
for (const d of comTelefone.slice(0, 40)) {
  diz(`- #${d.id} ${d.company} — segmento ${d.segment || "(vazio)"}, score ${d.points ?? "-"}`);
}
diz();
diz(`> Nenhum registro foi alterado por este script. Devolver lead para \`prospect\` e decisao manual.`);

if (MD) {
  const destino = path.join(RAIZ, "docs", "AUDITORIA-lost.md");
  fs.writeFileSync(destino, linhas.join("\n") + "\n");
  console.log(`\nRelatorio gravado em ${destino}.`);
}
