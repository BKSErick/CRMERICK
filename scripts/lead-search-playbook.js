/**
 * lead-search-playbook.js
 *
 * Playbook versionado para melhorar as buscas do Garimpo e priorizar leads
 * para venda consultiva de paginas/sites de conversao.
 *
 * Uso:
 *   node scripts/lead-search-playbook.js
 *   node scripts/lead-search-playbook.js --top=50
 *   node scripts/lead-search-playbook.js --json
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'js', 'garimpo-leads.json');
const TOP_ARG = process.argv.find((arg) => arg.startsWith('--top='));
const TOP = TOP_ARG ? Number(TOP_ARG.split('=')[1]) : 50;
const JSON_OUTPUT = process.argv.includes('--json');

const HIGH_INTENT_QUERIES = {
  industrial: [
    '"manutencao industrial" "orcamento" "Belo Horizonte"',
    '"manutencao industrial" "orcamento" "Ipatinga"',
    '"usinagem CNC" "pecas sob medida" "Sao Bernardo do Campo"',
    '"caldeiraria industrial" "orcamento" "Contagem"',
    '"automacao industrial" "CLP" "Ipatinga"',
    '"manutencao de compressores" "assistencia tecnica" "MG"',
    '"manutencao hidraulica industrial" "orcamento" "MG"',
    '"refrigeracao industrial" "manutencao" "WhatsApp"',
  ],
  localServices: [
    '"climatizacao" "manutencao" "Ipatinga"',
    '"ar condicionado" "agendamento" "Ipatinga"',
    '"energia solar" "simulacao" "Ipatinga"',
    '"dentista invisalign" "agendamento" "Ipatinga"',
    '"espaco de eventos" "reserva" "Sao Paulo"',
  ],
  painEvents: [
    '"site fora do ar" "orcamento" segmento cidade',
    '"403 forbidden" segmento cidade',
    '"404" "orcamento" segmento cidade',
    '"linktree" segmento cidade',
    '"instagram" "sem site" segmento cidade',
    '"sem WhatsApp" "orcamento" segmento cidade',
  ],
};

const EXCLUDE_TERMS = [
  'sindicato',
  'clube',
  'parque',
  'bairro',
  'associacao',
  'associação',
  'municipal',
  'prefeitura',
  'metalurgicos',
  'metalúrgicos',
  'reel',
  'news',
];

const SEGMENT_RULES = [
  {
    key: 'industrial_b2b',
    terms: ['manutencao industrial', 'manutenção industrial', 'usinagem', 'caldeiraria', 'automacao industrial', 'automação industrial', 'compressores', 'hidraulica industrial', 'hidráulica industrial'],
    channel: 'email_linkedin_whatsapp',
    angle: 'validacao_b2b_e_orcamento',
  },
  {
    key: 'climatizacao',
    terms: ['climatizacao', 'climatização', 'ar condicionado', 'refrigeracao', 'refrigeração'],
    channel: 'whatsapp_instagram',
    angle: 'urgencia_e_agendamento',
  },
  {
    key: 'odontologia',
    terms: ['odontologia', 'dentista', 'invisalign', 'clinica odontologica', 'clínica odontológica'],
    channel: 'whatsapp_instagram',
    angle: 'agendamento_e_confianca',
  },
  {
    key: 'eventos',
    terms: ['evento', 'eventos', 'espaco', 'espaço', 'wedding'],
    channel: 'email_whatsapp_instagram',
    angle: 'reserva_e_prova_visual',
  },
];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasWebsite(lead) {
  const website = normalize(lead.website);
  return Boolean(website && website !== 'null' && website !== 'undefined');
}

function hasInstagramOnly(lead) {
  return hasWebsite(lead) && normalize(lead.website).includes('instagram.com');
}

function classifySegment(lead) {
  const text = normalize(`${lead.name} ${lead.address || ''}`);
  return SEGMENT_RULES.find((rule) => rule.terms.some((term) => text.includes(normalize(term)))) || {
    key: 'outro',
    channel: 'whatsapp',
    angle: 'validacao_digital_generica',
  };
}

function isExcluded(lead) {
  const text = normalize(`${lead.name} ${lead.address || ''}`);
  return EXCLUDE_TERMS.some((term) => text.includes(normalize(term)));
}

function getConsciousnessLevel(lead) {
  const reviews = Number(lead.reviews_count || 0);
  const rating = Number(lead.rating || 0);
  const website = hasWebsite(lead);

  if (website) return 'consciente';
  if (!website && rating >= 4.2 && reviews >= 5) return 'semi_consciente';
  if (!website && reviews > 0) return 'baixa_consciencia';
  return 'inconsciente';
}

function getOpportunityType(lead) {
  if (!hasWebsite(lead)) return 'SEM_SITE';
  if (hasInstagramOnly(lead)) return 'INSTAGRAM_COMO_SITE';
  const website = normalize(lead.website);
  if (website.includes('linktree') || website.includes('wa.me') || website.includes('bit.ly')) return 'LINK_INTERMEDIARIO';
  if (website.includes('jotform') || website.includes('webnode') || website.includes('sites.google')) return 'SITE_FRACO_BUILDER';
  return 'SITE_EXISTENTE_AUDITAR';
}

function scoreLead(lead) {
  let score = 0;
  const reviews = Number(lead.reviews_count || 0);
  const rating = Number(lead.rating || 0);
  const segment = classifySegment(lead);
  const consciousness = getConsciousnessLevel(lead);
  const opportunity = getOpportunityType(lead);

  if (lead.phone) score += 18;
  if (lead.website) score += 6;
  if (!hasWebsite(lead)) score += 16;
  if (hasInstagramOnly(lead)) score += 10;
  if (rating >= 4.3) score += 12;
  if (reviews >= 10) score += 12;
  if (reviews >= 50) score += 8;
  if (segment.key === 'industrial_b2b') score += 18;
  if (['climatizacao', 'odontologia', 'eventos'].includes(segment.key)) score += 10;
  if (consciousness === 'semi_consciente') score += 14;
  if (consciousness === 'consciente') score += 10;
  if (opportunity === 'SITE_FRACO_BUILDER') score += 12;
  if (opportunity === 'LINK_INTERMEDIARIO') score += 10;
  if (isExcluded(lead)) score -= 45;
  if (!lead.phone) score -= 20;
  if (reviews === 0 && !hasWebsite(lead)) score -= 15;

  return Math.max(0, score);
}

function recommendedChannel(lead) {
  const segment = classifySegment(lead);
  if (segment.key === 'industrial_b2b') {
    if (lead.website && !hasInstagramOnly(lead)) return 'email';
    return lead.phone ? 'whatsapp' : 'linkedin';
  }
  if (hasInstagramOnly(lead)) return 'instagram';
  return lead.phone ? 'whatsapp' : 'instagram';
}

function buildSearchDiagnosis(lead) {
  const segment = classifySegment(lead);
  const consciousness = getConsciousnessLevel(lead);
  const opportunity = getOpportunityType(lead);
  return {
    name: lead.name,
    website: lead.website || '',
    phone: lead.phone || '',
    rating: lead.rating ?? null,
    reviews_count: lead.reviews_count ?? 0,
    address: lead.address || '',
    segment: segment.key,
    consciousness,
    opportunity,
    channel: recommendedChannel(lead),
    needs_email_research: classifySegment(lead).key === 'industrial_b2b' && !lead.email,
    needs_linkedin_research: classifySegment(lead).key === 'industrial_b2b',
    angle: segment.angle,
    priority_score: scoreLead(lead),
    excluded: isExcluded(lead),
  };
}

function loadLeads() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function dedupeLeads(leads) {
  const seen = new Map();

  for (const lead of leads) {
    const keyParts = [
      normalize(lead.name),
      normalize(lead.phone || ''),
      normalize(lead.website || ''),
      normalize(lead.address || ''),
    ].filter(Boolean);
    const key = keyParts.slice(0, 3).join('|') || normalize(lead.name);
    const current = seen.get(key);

    if (!current) {
      seen.set(key, lead);
      continue;
    }

    const currentScore = scoreLead(current);
    const nextScore = scoreLead(lead);
    if (nextScore > currentScore) seen.set(key, lead);
  }

  return Array.from(seen.values());
}

function main() {
  const leads = loadLeads();
  const uniqueLeads = dedupeLeads(leads);
  const enriched = uniqueLeads
    .map(buildSearchDiagnosis)
    .sort((a, b) => b.priority_score - a.priority_score);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      queries: HIGH_INTENT_QUERIES,
      top: enriched.slice(0, TOP),
    }, null, 2));
    return;
  }

  console.log('Lead Search Playbook - CRM ERICK');
  console.log(`Total leads analisados: ${leads.length}`);
  console.log(`Leads unicos apos dedupe: ${uniqueLeads.length}`);
  console.log('\nBuscas recomendadas:');
  Object.entries(HIGH_INTENT_QUERIES).forEach(([group, queries]) => {
    console.log(`\n[${group}]`);
    queries.forEach((query) => console.log(`- ${query}`));
  });

  console.log(`\nTop ${TOP} leads por prioridade:`);
  enriched.slice(0, TOP).forEach((lead, index) => {
    const enrichment = lead.needs_email_research ? ' | enriquecer email/LinkedIn' : '';
    console.log(`${index + 1}. ${lead.name} | score ${lead.priority_score} | ${lead.segment} | ${lead.consciousness} | ${lead.opportunity} | canal: ${lead.channel}${enrichment}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  HIGH_INTENT_QUERIES,
  buildSearchDiagnosis,
  classifySegment,
  dedupeLeads,
  getConsciousnessLevel,
  getOpportunityType,
  recommendedChannel,
  scoreLead,
};
