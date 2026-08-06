/**
 * extract-referrals.mjs
 * Varre as respostas dos leads, acha os REPASSES DE DECISOR e grava o contato
 * indicado NO DEAL DE ORIGEM.
 *
 * POR QUE EXISTE: encaminhamento e a resposta mais comum do funil (4 das 11
 * conversas reais da base: Vertical Eletrica -> Jean, Pressmix -> Cristiane,
 * Provith -> Andre, Vematech -> Tiele). Sao os leads mais valiosos que existem,
 * porque ja passaram o gatekeeper e chegam com indicacao interna. Hoje cada um
 * vira mensagem nova do zero, sem ligacao com o deal — o historico, o segmento e
 * a copy se perdem, e o lead volta pro comeco da fila.
 *
 * O sinal mais confiavel e o vCard (message_type=ContactMessage): deterministico,
 * sem IA e sem adivinhar linguagem natural. O texto livre entra como segundo
 * criterio, so para MARCAR o deal como encaminhamento quando nao veio vCard.
 *
 * USO:
 *   node scripts/extract-referrals.mjs             # dry-run: mostra o que achou
 *   node scripts/extract-referrals.mjs --go        # grava nos deals
 *   node scripts/extract-referrals.mjs --mensagens # imprime a abordagem pronta
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { carregarEnv, clienteSupabase, ehProspect } from "./lib/analise-comum.mjs";

// Mesma regra de nome curto da copy e do follow-up.
const { nomeCurto } = createRequire(import.meta.url)("./lib/nomeEmpresa.js");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const GO = process.argv.includes("--go");
const MENSAGENS = process.argv.includes("--mensagens");
const db = clienteSupabase();

// --- espelho das regras de src/lib/followup.ts -------------------------------
// Duplicado de proposito: este script roda em Node puro (sem build TS) e nao
// consegue importar o .ts. Se mudar la, mudar aqui. As duas listas vivem juntas
// no doc docs/ANALISE-conversas.md.
const VCARD = /^(.*?)\s*Phone(?:\s*\([^)]*\))?\s*:\s*(\+?[\d\s().-]{10,})$/i;
const RUIDO_NOME =
  /\b(comercial|vendas|financeiro|compras|diretoria|adm|administrativo|suporte|atendimento|contato|orcamento|orcamentos)\b/gi;

const fold = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const PADROES_TEXTO = [
  "responsavel por compras", "responsavel pelas compras", "responsavel por novos materiais",
  "responsavel por questoes como compras", "entre em contato com", "entrar em contato com",
  "fale com meu superior", "falar com meu superior", "meu superior", "encaminhar seu contato",
  "vou encaminhar", "vou te passar o contato", "te passar o contato", "passar o contato",
  "quem cuida disso e", "quem responde por isso", "ela que e responsavel", "ele que e responsavel",
  "segue o contato", "esse e o contato",
];

const SEM_EMOJI = /[\p{Extended_Pictographic}‍️]/gu;
const limpaToken = (t) => fold(t).replace(/[^\w]/g, "");

function extrairContatoIndicado(content, empresa) {
  const m = String(content || "").trim().match(VCARD);
  if (!m) return null;
  const telefone = m[2].replace(/\D/g, "");
  if (telefone.length < 10) return null;

  // Pontuacao fora antes de comparar: sem isso "PROVITH-" nao casa com "Provith"
  // e o contato sai como "Andre Provith", com o nome da empresa de sobrenome.
  const tokensEmpresa = new Set(fold(empresa).split(/\s+/).map(limpaToken).filter((t) => t.length >= 3));
  const nome = m[1]
    .replace(/\s*[-–|]\s*.*$/, "")
    .replace(RUIDO_NOME, " ")
    .replace(SEM_EMOJI, " ")
    .split(/\s+/)
    .filter((p) => p && !tokensEmpresa.has(limpaToken(p)))
    .slice(0, 3)
    .join(" ")
    .trim();

  return nome ? { nome, telefone } : null;
}

const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || n;

function mensagemDecisorIndicado({ nomeDecisor, empresa, quemIndicou }) {
  const emp = nomeCurto(empresa);
  // quemIndicou vem do nome do WhatsApp de quem mandou o vCard: costuma trazer
  // emoji ("Lurdinha🥰") ou ser o proprio nome da empresa ("Pressmix").
  const indicou = String(quemIndicou || "").replace(SEM_EMOJI, "").trim();
  const ehEmpresa =
    !indicou || fold(emp).includes(fold(indicou)) || fold(indicou).includes(fold(emp));
  const ponte = ehEmpresa
    ? `Me passaram seu contato aí na ${emp}`
    : `${primeiroNome(indicou)} me passou seu contato`;

  return (
    `Oi, ${primeiroNome(nomeDecisor)}! Erick aqui. ${ponte}. ` +
    `Eu faço página de vendas para indústria: o comprador chega já sabendo o que vocês atendem e manda o pedido pelo WhatsApp com o serviço definido. ` +
    `Separei um exemplo de uma empresa do mesmo ramo. Quer ver?`
  );
}
// -----------------------------------------------------------------------------

(async () => {
  const [deals, msgs] = await Promise.all([
    db.get("deals?select=id,company,name,stage,segment_norm,is_prospect,referred_name,referred_phone,referred_at"),
    db.get(
      "messages?deal_id=not.is.null&direction=eq.received&select=deal_id,content,message_type,sender_name,occurred_at,created_at&order=occurred_at.asc",
    ),
  ]);

  const D = Object.fromEntries(deals.map((d) => [d.id, d]));
  const achados = [];
  const suspeitas = []; // texto diz repasse mas nao veio vCard

  for (const m of msgs) {
    const d = D[m.deal_id];
    if (!d || !ehProspect(d.company, d.name)) continue;

    const contato = extrairContatoIndicado(m.content, d.company);
    if (contato) {
      // O primeiro vCard vale. Repasse repetido costuma ser o mesmo contato reenviado.
      if (!achados.some((a) => a.deal.id === d.id)) {
        achados.push({
          deal: d,
          ...contato,
          quemIndicou: m.sender_name || null,
          quando: m.occurred_at || m.created_at,
        });
      }
      continue;
    }
    const texto = fold(m.content);
    if (texto && PADROES_TEXTO.some((p) => texto.includes(p))) {
      if (!suspeitas.some((s) => s.deal.id === d.id)) {
        suspeitas.push({ deal: d, trecho: String(m.content).slice(0, 90) });
      }
    }
  }

  console.log(`\nREPASSES COM CONTATO (vCard): ${achados.length}`);
  for (const a of achados) {
    const jaTem = a.deal.referred_phone === a.telefone;
    console.log(
      `  ${String(a.deal.company || a.deal.name).slice(0, 32).padEnd(32)} -> ${a.nome.padEnd(18)} ${a.telefone}${jaTem ? "  (ja gravado)" : ""}`,
    );
  }

  if (suspeitas.length) {
    console.log(`\nREPASSE SEM CONTATO ANEXADO: ${suspeitas.length}`);
    console.log("(o lead disse que ia passar, mas nao mandou o vCard — cobrar o numero)");
    for (const s of suspeitas) {
      console.log(`  ${String(s.deal.company || s.deal.name).slice(0, 32).padEnd(32)} "${s.trecho}"`);
    }
  }

  if (MENSAGENS) {
    console.log("\n--- ABORDAGEM PRONTA ---");
    for (const a of achados) {
      console.log(`\n[${a.deal.company}] -> ${a.nome} (${a.telefone})`);
      console.log(
        mensagemDecisorIndicado({
          nomeDecisor: a.nome,
          empresa: a.deal.company || a.deal.name,
          quemIndicou: a.quemIndicou,
        }),
      );
    }
  }

  if (!GO) {
    console.log(`\nDRY-RUN. Nada gravado. Rode com --go para gravar nos deals.\n`);
    return;
  }

  let gravados = 0;
  for (const a of achados) {
    if (a.deal.referred_phone === a.telefone) continue;
    await db.patch(`deals?id=eq.${a.deal.id}`, {
      referred_name: a.nome,
      referred_phone: a.telefone,
      referred_by: a.quemIndicou,
      referred_at: a.quando,
      // response_type existente marca a fila de encaminhamentos no Comando.
      response_type: "encaminhamento",
      next_action_type: "contactar_responsavel",
      next_action_at: a.quando,
      next_action_note: `Decisor indicado: ${a.nome} (${a.telefone}). Abordar citando quem indicou.`,
    });
    gravados++;
  }
  console.log(`\nOK: ${gravados} decisores indicados gravados no deal de origem.`);
  console.log("Rode com --mensagens para pegar a abordagem pronta de cada um.\n");
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});