/**
 * varredura-duplicados.mjs
 * LEITURA PURA. Nao grava nada.
 *
 * Acha os tres jeitos de uma resposta de lead cair no lugar errado (ou sumir):
 *
 *   A) NUMERO AMBIGUO   - o mesmo telefone em 2+ contatos. O webhook usa `.in()` e
 *                         recusa gravar quando ha mais de um match: a mensagem some.
 *   B) CARD ORFAO       - deal "WhatsApp NNNN" com conversa de verdade. E a conversa
 *                         de um lead real vivendo fora do card dele (caso Salatini
 *                         #1462 -> #1338, 31/08/2026): o card real segue marcado como
 *                         "sem resposta" e a negociacao nao aparece no funil.
 *   C) SO FORMATADO     - contato com phone formatado ("+55 31 99207-4444") e whatsapp
 *                         NULL. O fallback por sufixo exige 8 digitos corridos no valor
 *                         GRAVADO, entao nem o `.in()` nem o fallback casam: a resposta
 *                         nao deixa rastro nenhum (achado de 05/08/2026).
 *
 * USO: node scratchpad/varredura-duplicados.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllPages } from "../scripts/lib/supabaseRest.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = (rota, init = {}) =>
  fetch(`${SUPA}/rest/v1/${rota}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

// Chave de comparacao: os 8 ultimos digitos. E o que sobrevive a 55/DDD/nono digito.
// Sufixo de 8 digitos, mas so de valor que parece telefone brasileiro completo
// (>=12 digitos com DDI, ou >=10 sem). Numero truncado no import gera sufixo
// coincidente e inventa ambiguidade que nao existe: "3320-2020" de tres empresas
// diferentes nao e o mesmo telefone.
// So valor GRAVADO como digito corrido entra na conta de ambiguidade: o webhook
// compara string exata (`.in()`), entao "(31) 3063-0390" nunca colide com
// "553130630390" por esse caminho. Numero formatado tem outro problema, que e o (C).
const chave = (valor) => {
  const bruto = String(valor ?? "").trim();
  if (!/^\+?\d{10,13}$/.test(bruto)) return null;
  return bruto.replace(/\D/g, "").slice(-8);
};
// Formatado de verdade: tem numero suficiente para ser um telefone, mas nenhuma
// sequencia de 8 digitos corridos. O placeholder "—" do import antigo nao conta:
// aquilo e contato SEM telefone, que nunca recebeu nada e nao perde resposta.
const soFormatado = (valor) => {
  const bruto = String(valor ?? "");
  const digitos = bruto.replace(/\D/g, "");
  return digitos.length >= 10 && !/\d{8,}/.test(bruto);
};

const [contatos, deals, msgs] = await Promise.all([
  fetchAllPages(supa, "contacts?select=id,name,phone,whatsapp,whatsapp_jid"),
  fetchAllPages(supa, "deals?select=id,company,stage,is_prospect,contact_id,phone,whatsapp"),
  fetchAllPages(supa, "messages?select=deal_id,direction,content,created_at&order=created_at.asc"),
]);

// --- A) numero em mais de um contato ----------------------------------------
const porChave = new Map();
for (const c of contatos) {
  // So phone e whatsapp: sao os dois unicos campos que o webhook consulta
  // (`.in("phone", variants)` e `.in("whatsapp", variants)`). whatsapp_jid batendo
  // com o telefone de outro contato nao causa ambiguidade nenhuma na entrada.
  for (const valor of [c.phone, c.whatsapp]) {
    const k = chave(valor);
    if (!k) continue;
    if (!porChave.has(k)) porChave.set(k, new Set());
    porChave.get(k).add(c.id);
  }
}
const ambiguos = [...porChave.entries()].filter(([, ids]) => ids.size > 1);

// --- B) cards orfaos com conversa -------------------------------------------
const porDeal = new Map();
for (const m of msgs) {
  if (!m.deal_id) continue;
  if (!porDeal.has(m.deal_id)) porDeal.set(m.deal_id, []);
  porDeal.get(m.deal_id).push(m);
}
const contatoPorId = new Map(contatos.map((c) => [c.id, c]));
// is_prospect=false ja foi triado na mao (conversa pessoal do aparelho): nao e
// negociacao perdida, entao nao entra na lista de coisa para arrumar.
const orfaos = deals.filter((d) => /^WhatsApp \d+$/i.test(String(d.company ?? "")) && d.is_prospect !== false);

// Palavra distintiva de cada empresa real, para adivinhar de quem e a conversa.
const palavras = [];
for (const d of deals) {
  if (/^WhatsApp \d+$/i.test(String(d.company ?? ""))) continue;
  const w = String(d.company ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 5 && !["industria","comercio","servicos","engenharia","manutencao","eireli","limitada"].includes(p));
  if (w.length) palavras.push({ id: d.id, company: d.company, termos: w });
}

const comConversa = [];
for (const o of orfaos) {
  const conversa = porDeal.get(o.id) ?? [];
  const recebidas = conversa.filter((m) => m.direction === "received");
  if (!recebidas.length) continue;
  const texto = recebidas
    .map((m) => String(m.content ?? ""))
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const palpite = palavras.find((p) => p.termos.some((t) => texto.includes(t)));
  comConversa.push({
    id: o.id,
    stage: o.stage,
    fone: contatoPorId.get(o.contact_id)?.whatsapp ?? contatoPorId.get(o.contact_id)?.phone ?? "-",
    msgs: conversa.length,
    ultima: recebidas[recebidas.length - 1]?.created_at?.slice(0, 10),
    palpite: palpite ? `#${palpite.id} ${palpite.company}` : null,
    trecho: String(recebidas[0]?.content ?? "").replace(/\s+/g, " ").slice(0, 60),
  });
}

// --- C) contato so com telefone formatado ------------------------------------
const cegos = contatos.filter((c) => soFormatado(c.phone) && !c.whatsapp && !c.whatsapp_jid);

console.log(`Base: ${contatos.length} contatos, ${deals.length} deals, ${msgs.length} mensagens.\n`);

console.log(`A) NUMERO EM MAIS DE UM CONTATO (mensagem some por ambiguidade): ${ambiguos.length}`);
for (const [k, ids] of ambiguos.slice(0, 15)) {
  const nomes = [...ids].map((id) => `#${id} ${String(contatoPorId.get(id)?.name ?? "").slice(0, 28)}`).join("  |  ");
  console.log(`   ...${k}  ${nomes}`);
}
if (ambiguos.length > 15) console.log(`   (+${ambiguos.length - 15} nao listados)`);

console.log(`\nB) CARD ORFAO COM CONVERSA (a negociacao vive fora do card do lead): ${comConversa.length}`);
for (const o of comConversa) {
  console.log(`   #${o.id} ${o.fone} | ${o.msgs} msgs | ultima ${o.ultima} | stage=${o.stage}`);
  console.log(`      "${o.trecho}"`);
  console.log(`      palpite: ${o.palpite ?? "sem pista no texto, precisa olhar na mao"}`);
}

console.log(`\nC) CONTATO SO COM TELEFONE FORMATADO (resposta some sem rastro): ${cegos.length}`);
for (const c of cegos.slice(0, 10)) console.log(`   #${c.id} ${String(c.name).slice(0, 40)} -> ${c.phone}`);
if (cegos.length > 10) console.log(`   (+${cegos.length - 10} nao listados)`);
