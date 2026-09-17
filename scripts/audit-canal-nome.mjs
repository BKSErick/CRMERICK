/**
 * audit-canal-nome.mjs
 * Confere na Uazapi se o numero gravado em cada card e mesmo da empresa do card.
 *
 * Nasceu do incidente de 14/09/2026: a Steel Usinagem (#795) tinha no whatsapp_site o
 * WhatsApp da G6 Embalagens (sobra de template no site antigo dela) e a copy inteira
 * da Steel chegou na G6. O perfil do WhatsApp ("G6 Embalagens") denunciava o erro; so
 * ninguem olhava. Ver scripts/lib/canalWhatsapp.mjs para a regra.
 *
 * So leitura. Imprime quem tem perfil de outra empresa (nome_divergente) e quem nao
 * esta no WhatsApp (nao_existe). Corrigir o cadastro na mao: whatsapp_site/whatsapp_jid.
 *
 * USO:
 *   node --env-file-if-exists=.env scripts/audit-canal-nome.mjs                    # prospect + abordado + followup
 *   node --env-file-if-exists=.env scripts/audit-canal-nome.mjs --stage=abordado   # so quem ja recebeu mensagem
 *   node --env-file-if-exists=.env scripts/audit-canal-nome.mjs --ids=795,1146
 *   node --env-file-if-exists=.env scripts/audit-canal-nome.mjs --so-problemas     # esconde os que conferem
 */

import { conferirCanal } from "./lib/canalWhatsapp.mjs";
import { fetchAllPages } from "./lib/supabaseRest.mjs";

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : d;
};
const STAGES = arg("stage", "prospect,abordado,followup");
const IDS = arg("ids", "").split(",").map(Number).filter(Boolean);
const SO_PROBLEMAS = process.argv.includes("--so-problemas");

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.UAZAPI_BASE_URL;
const TOKEN = process.env.UAZAPI_INSTANCE_TOKEN;
if (!SUPA || !KEY || !BASE || !TOKEN) {
  console.error("Faltam variaveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN");
  process.exit(1);
}
const supa = (rota, init = {}) =>
  fetch(`${SUPA}/rest/v1/${rota}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...(init.headers || {}) } });

const filtro = IDS.length ? `id=in.(${IDS.join(",")})` : `stage=in.(${STAGES})&is_prospect=not.is.false`;
const [deals, contatos] = await Promise.all([
  fetchAllPages(supa, `deals?${filtro}&select=id,company,stage`),
  fetchAllPages(supa, "contacts?select=id,phone,whatsapp_site,whatsapp_jid"),
]);
const porId = Object.fromEntries(contatos.map((c) => [c.id, c]));

// Mesma regra de canal dos dois scripts de disparo (nao importa de la: o send-batch
// roda o lote ao ser importado): jid confirmado > numero do site. Celular so do Maps
// nao dispara automatico, entao nao entra aqui.
const canal = (c) => {
  if (c?.whatsapp_jid) return String(c.whatsapp_jid).split("@")[0];
  if (c?.whatsapp_site) return String(c.whatsapp_site).replace(/\D/g, "");
  return null;
};
const alvo = deals
  .map((d) => {
    const fone = canal(porId[d.id]);
    return fone ? { ...d, fone } : null;
  })
  .filter(Boolean);

console.log(`Cards com canal confirmado: ${alvo.length} de ${deals.length} (${IDS.length ? `ids ${IDS.join(",")}` : `stages ${STAGES}`})\n`);

const resumo = { nome_confere: 0, sem_nome: 0, consulta_falhou: 0, nao_existe: 0, nome_divergente: 0 };
const problemas = [];
for (const d of alvo) {
  const r = await conferirCanal(d.fone, d.company, { base: BASE, token: TOKEN });
  resumo[r.motivo] = (resumo[r.motivo] || 0) + 1;
  const linha = `#${String(d.id).padStart(4)} ${d.stage.padEnd(9)} ${String(d.company).slice(0, 42).padEnd(42)} ${d.fone.padEnd(14)} ${r.motivo}${r.nome ? `  perfil="${r.nome}"` : ""}`;
  if (!r.ok) problemas.push(linha);
  if (!r.ok || !SO_PROBLEMAS) console.log(linha);
}

console.log(`\nResumo: ${JSON.stringify(resumo)}`);
if (problemas.length) {
  console.log(`\n${problemas.length} card(s) para corrigir no cadastro (whatsapp_site/whatsapp_jid):`);
  problemas.forEach((p) => console.log(`   ${p}`));
}
