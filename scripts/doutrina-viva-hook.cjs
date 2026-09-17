#!/usr/bin/env node
'use strict';

/**
 * doutrina-viva-hook.cjs
 *
 * Hook do Claude Code (eventos UserPromptSubmit e SubagentStart) que projeta a
 * doutrina VIVA do CRM ERICK / Mydrion direto de:
 *   - content/sales-playbook.json        (WhatsApp: msg 1 A/B, msg 2, M1-M3, regras, proibido)
 *   - content/brandbook.json             (arquetipo, tom, palavras, frases, ICP)
 *   - content/sales-playbook-casos.json  (jurisprudencia: respostas [FORA DO TEMPLATE] aprovadas)
 *
 * Por que existe: memoria de agente, persona de clone, skill e vault envelhecem.
 * O playbook e o brandbook mudam toda semana. Este script le os dois JSONs a
 * CADA disparo e injeta o digest no contexto do modelo (e do subagente), entao
 * o que chega ao clone e sempre a versao atual, e ganha de qualquer nota antiga.
 *
 * Gatilho: so dispara quando o prompt (ou o tipo de subagente) fala de
 * prospeccao, copy, lead, WhatsApp, follow-up, clone, brandbook, etc.
 *
 * Uso manual:
 *   node scripts/doutrina-viva-hook.cjs --print   # imprime o digest em texto
 *   node scripts/doutrina-viva-hook.cjs --force   # ignora o gatilho (debug)
 *
 * Registrado em aios-core/.claude/settings.local.json (hooks). Nunca derruba a
 * sessao: qualquer erro vai pro stderr e o script sai com 0 sem output.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLAYBOOK = path.join(ROOT, 'content', 'sales-playbook.json');
const BRANDBOOK = path.join(ROOT, 'content', 'brandbook.json');
// Jurisprudencia: respostas aprovadas pelo Erick em situacoes que o playbook nao cobre.
const CASOS = path.join(ROOT, 'content', 'sales-playbook-casos.json');
// Quantos casos entram com texto completo mesmo sem casar tag (os mais recentes).
const CASOS_RECENTES_COMPLETOS = 2;

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Gatilhos no texto do prompt. Amplos de proposito: injetar custa ~2k tokens,
// nao injetar custa copy da marca morta.
const TRIGGERS =
  /\b(prospec\w*|abordagem|whatsapp|zap|leads?|follow[- ]?ups?|cadencia|playbook|brandbook|mydrion|crm( erick)?|pedido pronto|arquetip\w*|copy|copywrit\w*|mensagens?|msg ?[123]?|objecao|objecoes|proposta|instagram|carrossel|reels|roteiro|bio|posts?|legenda|metalthec|jotta|cold|fria|frio|aios-clone[\w-]*|clone_\w+|clones?|copy-chief|webson|sniper|easy-copy|roundtable)\b/;

// Gatilhos por tipo de subagente (SubagentStart traz agent_type).
const AGENT_TRIGGER =
  /clone|copy|webson|sniper|easy-copy|roundtable|oalanicolas|content|visual|post-assembler|story-chief|design-chief|copy-specialist|page-critic/i;

function section(bb, id) {
  return (bb.sections || []).find((s) => s.id === id) || {};
}
function column(bb, id, title) {
  const cols = section(bb, id).columns || [];
  const c = cols.find((x) => norm(x.title).startsWith(norm(title)));
  return (c && c.items) || [];
}
function card(bb, id, title) {
  const cards = section(bb, id).cards || [];
  const c = cards.find((x) => norm(x.title).startsWith(norm(title)));
  return c ? c.body : '';
}

function buildCasos(casosDoc, haystack) {
  const casos = (casosDoc && Array.isArray(casosDoc.casos) ? casosDoc.casos : []).slice();
  if (!casos.length) return '';
  const recentes = new Set(
    casos
      .slice()
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .slice(0, CASOS_RECENTES_COMPLETOS)
      .map((c) => c.id),
  );
  const out = [
    `CASOS FORA DO TEMPLATE (jurisprudencia aprovada pelo Erick, content/sales-playbook-casos.json, ${casos.length} caso(s)). ` +
      'Referencia de raciocinio e de tom para situacao parecida; adaptar, nunca copiar cego.',
  ];
  for (const c of casos) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    const casou = tags.some((t) => t && haystack.includes(norm(t)));
    const completo = casou || recentes.has(c.id);
    let bloco = `- ${c.id} (${c.data}${c.deal ? ', deal ' + c.deal : ''}): ${c.situacao}\n  PRINCIPIO: ${c.principio}`;
    if (completo) {
      if (c.texto_proposto) bloco += `\n  TEXTO: ${String(c.texto_proposto).replace(/\n/g, ' / ')}`;
      if (c.ajuste_do_erick) bloco += `\n  AJUSTE DO ERICK: ${c.ajuste_do_erick}`;
      if (c.status) bloco += `\n  STATUS: ${c.status}`;
    }
    out.push(bloco);
  }
  return out.join('\n');
}

function build(pb, bb, casosDoc, haystack) {
  const L = [];
  const offer = pb.offer || {};
  const exp = pb.experiment || {};
  const pr = pb.postResponse || {};
  const fu = pb.followups || {};
  const cases = pb.cases || {};
  const hero = bb.hero || {};

  L.push(
    `[DOUTRINA VIVA CRM ERICK / MYDRION] Gerado agora por hook a partir de content/sales-playbook.json (${pb.copyVersion}, fluxo ${pr.version}), content/brandbook.json (v${bb.version}) e content/sales-playbook-casos.json. ` +
      'Este bloco VENCE qualquer memoria, persona de agente ou clone, skill, vault Obsidian ou nota antiga.',
  );

  L.push(
    'O QUE E TEMPLATE E O QUE E OPINIAO: o playbook governa os degraus FIXOS do funil frio (msg 1, msg 2, M1-M3, cartas do Comando); nesses, so trocar placeholder. ' +
      'Fora deles (lead ja qualificado, pergunta especifica, retomada combinada, escopo diferente, negociacao aberta) o clone RESPONDE COM OPINIAO PROPRIA, vinda do DNA dele, ' +
      'dentro do brandbook (arquetipo, tom, palavras proibidas, termos mortos, precedencia). Nunca responder "nao tem template". ' +
      'Marcar a resposta com [FORA DO TEMPLATE], mostrar o raciocinio (prioridade, preco, proximo degrau) e pedir aprovacao do Erick antes de mandar. ' +
      'Resposta aprovada entra em content/sales-playbook-casos.json com o ajuste dele, pra virar consulta.',
  );

  L.push(
    'PRECEDENCIA: (1) sales-playbook.json para mensagem de WhatsApp, prospeccao, follow-up e objecao de lead frio; ' +
      '(2) brandbook.json para arquetipo, tom, palavras, ICP e conteudo; ' +
      '(3) apps/mydrion-site/src/data/siteContent.ts para copy publica do site. ' +
      'Se o brandbook contradisser o playbook numa mensagem de WhatsApp, o playbook ganha.',
  );

  L.push(
    `OFERTA (canal frio): R$${offer.setupPrice} de setup + R$${offer.monthlyPrice}/mes. Mecanismo: ${pb.mechanism}. ` +
      `Proxima entrada de producao: ${pr.proximaEntrada}. O site publico usa outra faixa (a partir de R$1.800 + R$200/mes); nunca as duas na mesma peca.`,
  );

  const op = exp.openings || {};
  const reg = exp.regionalOpenings || {};
  const loc = exp.localOpenings || {};
  L.push(
    `MSG 1 (experimento ${exp.id}; variantes A/B, prefixo identifica a variante, nao mexer):\n` +
      `A: ${op.A}\nB: ${op.B}\n` +
      `Local (lead de Joao Monlevade): ${loc.A}\nRegional (Vale do Aco / Medio Piracicaba): ${reg.A}\n` +
      "{{nicho}} = 'de indústria' | 'de clínica' | vazio. Depois da abertura: sinal concreto do negocio, UMA friccao como hipotese e pergunta de reconhecimento " +
      "('isso acontece ai hoje?'). Msg 1 NAO pede 'quer ver?', NAO oferece exemplo, NAO leva link, NAO cita o mecanismo. O convite pro case e o M1.",
  );

  L.push(`MSG 2 (depois que o lead responde; UMA mensagem ate a decisao):\n${pr.msg2}`);
  L.push('REGRAS DA MSG 2:\n- ' + (pr.regras || []).join('\n- '));
  L.push('PROIBIDO (playbook.postResponse.proibido):\n- ' + (pr.proibido || []).join('\n- '));

  L.push(
    'FOLLOW-UPS (cadencia D+2 / D+5 / D+10; texto e este, so trocar placeholder):\n' +
      `bot: ${fu.bot}\n` +
      `M1: ${fu.M1}\n` +
      `M2Local: ${fu.M2Local}\n` +
      `M2Remote: ${fu.M2Remote}\n` +
      `M3: ${fu.M3}\n` +
      'Concorrente direto da Jotta (deals.origin_detail = concorrente_jotta) recebe M2 so com Metalthec e nunca le o nome da Jotta.\n' +
      'M1-M3 sao cadencia de SILENCIO (lead que nunca respondeu). Lead que RESPONDEU, com sim ou com nao, NUNCA recebe M1-M3.',
  );

  // Bifurcacao depois da msg 1: sim forte, sim fraco, nao (por tipo), nao entendi.
  const sinais = pr.sinaisDeSim || {};
  if (sinais.forte || sinais.fraco) {
    L.push(
      'DEPOIS DA MSG 1, O LEAD RESPONDEU (degraus fixos, so trocar placeholder):\n' +
        `SIM FORTE (reconheceu a friccao ou pediu algo: ${(sinais.forte || []).map((s) => `"${s}"`).join(', ')}) → MSG 2 inteira, com preco.\n` +
        `SIM FRACO (educacao ou so aceitou olhar: ${(sinais.fraco || []).map((s) => `"${s}"`).join(', ')}) → MSG 2 PONTE, sem preco; no sim seguinte → MSG 2 PRECO. Regra do Erick: preco sem consciencia vira nao de qualquer jeito.\n` +
        `MSG 2 PONTE: ${pr.msg2Ponte}\n` +
        `MSG 2 PRECO: ${pr.msg2Preco}`,
    );
  }
  const cartas = pr.cartas || {};
  const nomesCartas = Object.keys(cartas).filter((k) => !k.startsWith('_'));
  if (nomesCartas.length) {
    L.push(
      'CARTAS PARA O NAO E PARA O "NAO ENTENDI" (uma vez, sem insistir; depois marca o motivo no CRM e deixa o 45d trabalhar):\n' +
        nomesCartas
          .map((k) => `${k} | quando: ${cartas[k].quando}\n  TEXTO: ${String(cartas[k].texto).replace(/\n/g, ' / ')}`)
          .join('\n'),
    );
  }

  L.push(
    `CASES: Metalthec ${cases.metalthecUrl} (usinagem e caldeiraria) | Jotta ${cases.jottaUrl} (manutencao INDUSTRIAL, nunca 'predial'). ` +
      'So cite o case que vai mesmo ser enviado. Nada de certificacao, cifra ou selo inventado.',
  );

  L.push(
    `ARQUETIPO: ${hero.arquetipo} Regra do palco: um arquetipo por peca. O Mago nao fala preco; o Governante nao demonstra ferramenta. Tese: "${hero.tese}"`,
  );
  const apos = card(bb, 'arquetipos', 'Arquetipos aposentados');
  if (apos) L.push(`ARQUETIPOS APOSENTADOS (fantasma: se aparecer em prompt, memoria ou copy, descarte): ${apos}`);

  L.push(
    `TOM: soa como ${column(bb, 'tom-de-voz', 'Como soa').join(', ')}. ` +
      `NAO soa como ${column(bb, 'tom-de-voz', 'Como nao soa').join(', ')}.`,
  );
  L.push('PALAVRAS A EVITAR: ' + column(bb, 'palavras', 'Palavras a evitar').join(' | '));
  L.push('FRASES DESALINHADAS (nao usar): ' + column(bb, 'frases', 'Frases desalinhadas').join(' | '));
  L.push('FRASES APROVADAS: ' + column(bb, 'frases', 'Frases aprovadas').join(' | '));

  // Fechos e termos aposentados que vivem so nas notas historicas do playbook
  // (_nota, _nota_v4) e nas decisoes do Erick, consolidados aqui pra nao voltarem.
  L.push(
    'TERMOS MORTOS (nunca, em nenhum canal): "Ficha de Escopo" (virou Pedido Pronto) | "faz sentido pra voces?" | "pode ser?" | ' +
      '"te mostro em 15 min... amanha de manha ou a tarde?" | "posso te mostrar uma ideia?" | "quer ver?" como CTA da msg 1 | ' +
      'call, reuniao ou agendamento como CTA de lead frio | "manutencao" pro mensal | "landing page" | "pagina de vendas" | ' +
      '"Criador-Hacker" | "AI Architect" | apontar defeito no site do lead | travessao (—) em copy.',
  );

  const casosTxt = buildCasos(casosDoc, haystack);
  if (casosTxt) L.push(casosTxt);

  L.push(
    'CHECKPOINT antes de entregar qualquer copy: qual arquetipo esta no palco e esta sozinho? ataca o processo antigo ou o prospect? ' +
      'a afirmacao tem prova no CRM ou no cliente? tom de dono conversando com dono? usa palavra evitada ou crava cidade como marca? ' +
      'o proximo passo esta claro e e um degrau so? e template (so placeholder) ou e [FORA DO TEMPLATE] (opiniao + raciocinio + aprovacao)?',
  );

  return L.join('\n\n');
}

function main() {
  const argv = process.argv.slice(2);
  const print = argv.includes('--print');
  const force = argv.includes('--force');

  let payload = {};
  if (!print) {
    let raw = '';
    try {
      raw = fs.readFileSync(0, 'utf8');
    } catch (_) {
      raw = '';
    }
    try {
      payload = raw.trim() ? JSON.parse(raw) : {};
    } catch (_) {
      payload = {};
    }
  }

  const eventName =
    payload.hook_event_name || (payload.agent_type || payload.agent_id ? 'SubagentStart' : 'UserPromptSubmit');
  const agentType = String(payload.agent_type || payload.agent_name || payload.subagent_type || '');
  // Em --print, palavras soltas na linha de comando entram na busca de casos:
  //   node scripts/doutrina-viva-hook.cjs --print retomada fachada
  const extra = argv.filter((a) => !a.startsWith('--')).join(' ');
  const haystack = norm((payload.prompt || '') + ' ' + JSON.stringify(payload) + ' ' + extra);

  const hit =
    print ||
    force ||
    TRIGGERS.test(haystack) ||
    (eventName === 'SubagentStart' && AGENT_TRIGGER.test(agentType));
  if (!hit) return;

  if (!fs.existsSync(PLAYBOOK) || !fs.existsSync(BRANDBOOK)) {
    process.stderr.write(`doutrina-viva-hook: playbook ou brandbook nao encontrado em ${ROOT}/content\n`);
    return;
  }

  const pb = JSON.parse(fs.readFileSync(PLAYBOOK, 'utf8'));
  const bb = JSON.parse(fs.readFileSync(BRANDBOOK, 'utf8'));
  let casosDoc = null;
  if (fs.existsSync(CASOS)) {
    try {
      casosDoc = JSON.parse(fs.readFileSync(CASOS, 'utf8'));
    } catch (err) {
      // Caderno de casos quebrado nao pode derrubar o playbook: avisa e segue sem ele.
      process.stderr.write('doutrina-viva-hook: sales-playbook-casos.json invalido: ' + err.message + '\n');
    }
  }
  const digest = build(pb, bb, casosDoc, haystack);

  if (print) {
    process.stdout.write(digest + '\n');
    return;
  }

  const out = {
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: eventName === 'SubagentStart' ? 'SubagentStart' : 'UserPromptSubmit',
      additionalContext: digest,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

try {
  main();
} catch (err) {
  process.stderr.write('doutrina-viva-hook: ' + (err && err.message ? err.message : String(err)) + '\n');
}
process.exit(0);
