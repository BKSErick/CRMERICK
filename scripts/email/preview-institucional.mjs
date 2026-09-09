/**
 * preview-institucional.mjs
 * Renderiza a copy de `copy-institucional.mjs` para os leads reais do CRM, sem enviar nada.
 * Roda a guarda de regressão do playbook em cada e-mail e falha alto se alguma palavra
 * proibida escapar ("site", "marketing", "concorrente", "lead", "presença digital"...).
 *
 * USO:
 *   node scripts/email/preview-institucional.mjs --setor=saude
 *   node scripts/email/preview-institucional.mjs --setor=industria --limit=8
 */
import fs from "node:fs";
import { montarEmail, violacoes } from "./copy-institucional.mjs";
import { qualificar } from "./qualificar-destinatario.mjs";

const arg = (n) => process.argv.find((x) => x.startsWith(`--${n}=`))?.split("=")[1] || "";
const SETOR = arg("setor") || "saude";
const LIMITE = Number(arg("limit") || 0);

const env = Object.fromEntries(
  fs.readFileSync("D:/001Gravity/CRM ERICK/.env", "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const r = await fetch(
  `${env.SUPABASE_URL}/rest/v1/deals?setor=eq.${SETOR}&select=id,company,stage,porte,decisor_nome,email_receita,site_url&order=id`,
  { headers: H },
);
const deals = await r.json();
if (!Array.isArray(deals)) {
  console.error("Resposta inesperada do Supabase:", JSON.stringify(deals).slice(0, 300));
  process.exit(1);
}

const rc = await fetch(
  `${env.SUPABASE_URL}/rest/v1/contacts?id=in.(${deals.map((d) => d.id).join(",")})&select=id,email`,
  { headers: H },
);
const emailDoSite = new Map((await rc.json()).map((c) => [c.id, c.email]));

// "—" e "seuemail@..." sao lixo do import antigo e de template de site, nao sao endereco.
const emailValido = (e) => {
  const v = String(e || "").trim().toLowerCase();
  if (!v.includes("@") || v.length < 6) return false;
  if (/^(seuemail|seu-email|email|exemplo|example|nome)@/.test(v)) return false;
  return true;
};

const SO_COM_EMAIL = process.argv.includes("--so-com-email");
let ativos = deals.filter((d) => d.stage !== "lost");
if (SO_COM_EMAIL) {
  ativos = ativos.filter((d) => emailValido(d.email_receita) || emailValido(emailDoSite.get(d.id)));
}
const lista = LIMITE ? ativos.slice(0, LIMITE) : ativos;

let comEmail = 0;
let comDecisor = 0;
let prontos = 0;
const porClasse = {};
const problemas = [];
const blocos = [];

for (const d of lista) {
  const destino = [d.email_receita, emailDoSite.get(d.id)].find(emailValido) || null;
  if (destino) comEmail++;
  if (d.decisor_nome) comDecisor++;

  const q = qualificar({ email: destino, decisorNome: d.decisor_nome, empresa: d.company, siteUrl: d.site_url });
  porClasse[q.classe] = (porClasse[q.classe] || 0) + 1;
  if (q.enviar) prontos++;

  const email = montarEmail({ empresa: d.company, decisorNome: d.decisor_nome, setor: SETOR });
  const v = violacoes(`${email.subject}\n${email.text}`);
  if (v.length) problemas.push({ id: d.id, empresa: d.company, regras: v });

  console.log(
    `#${d.id} ${String(d.company).slice(0, 34).padEnd(34)} ` +
      `${(destino || "SEM E-MAIL").padEnd(34)} ` +
      `${q.enviar ? "OK " : "BLOQ"} ${q.classe.padEnd(8)} ${q.motivo}`,
  );

  const cor = q.enviar ? "#0a7" : "#c00";
  blocos.push(
    `<hr><p style="color:#666"><b>#${d.id} ${d.company}</b> · ${d.porte} · ${d.stage}<br>` +
      `PARA: ${destino || "sem e-mail"} <b style="color:${cor}">[${q.classe}]</b> <i>${q.motivo}</i><br>` +
      `ASSUNTO: <b>${email.subject}</b></p>` +
      (q.enviar ? email.html : `<p style="color:#c00"><i>Bloqueado, não entra na fila.</i></p>`),
  );
}

console.log(`\n=== RESUMO (setor=${SETOR}) ===`);
console.log(`Leads ativos (fora os lost): ${lista.length}`);
console.log(`Com decisor identificado:    ${comDecisor}`);
console.log(`Com algum e-mail:            ${comEmail}`);
console.log(`Classificação: ${Object.entries(porClasse).map(([k, n]) => `${k}=${n}`).join(" | ")}`);
console.log(`PRONTOS PRA DISPARAR:        ${prontos}`);

if (problemas.length) {
  console.log(`\nVIOLAÇÕES DO PLAYBOOK (${problemas.length}):`);
  for (const p of problemas) console.log(`  #${p.id} ${p.empresa}: ${p.regras.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`\nGuarda do playbook: OK, nenhuma palavra proibida na copy.`);
}

const saida = `D:/001Gravity/CRM ERICK/preview-institucional-${SETOR}.html`;
fs.writeFileSync(
  saida,
  `<!doctype html><meta charset=utf-8><title>Preview institucional ${SETOR}</title>
<body style="font-family:system-ui;max-width:660px;margin:24px auto;padding:0 16px;line-height:1.5">
<h2>Preview cold email institucional · setor ${SETOR}</h2>
<p style="color:#666">${lista.length} leads ativos · ${comEmail} com e-mail utilizável</p>${blocos.join("\n")}</body>`,
  "utf8",
);
console.log(`\nPreview: ${saida}`);
