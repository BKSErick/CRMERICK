/**
 * Seed one-time do CRM.
 *
 * Le js/mock-db.js, js/garimpo-leads.json e js/disparo-data.json e grava em
 * Supabase via service-role server-side. Aborta por padrao se as tabelas ja
 * tiverem dados para evitar duplicacao acidental.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MOCK_DB_PATH = path.join(ROOT, 'js', 'mock-db.js');
const GARIMPO_PATH = path.join(ROOT, 'js', 'garimpo-leads.json');
const DISPARO_PATH = path.join(ROOT, 'js', 'disparo-data.json');
const BATCH_SIZE = 50;
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number.parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()])
  );
}

const env = { ...loadEnv(), ...process.env };
const supabaseUrl = env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

function loadMockDb() {
  const raw = fs.readFileSync(MOCK_DB_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(raw, sandbox, { timeout: 5000 });
  return {
    deals: Array.isArray(sandbox.window.deals) ? sandbox.window.deals : [],
    contacts: Array.isArray(sandbox.window.contacts) ? sandbox.window.contacts : [],
  };
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanSiteUrl(url) {
  if (!url) return null;
  const lower = String(url).toLowerCase();
  if (lower.includes('fonts.googleapis.com') || lower.includes('fonts.gstatic.com')) return null;
  return String(url);
}

function normalizeStage(status) {
  if (status === 'qualificado') return 'qualified';
  if (status === 'extraido') return 'prospect';
  return status || 'prospect';
}

function mapMockDeal(deal) {
  const phone = cleanPhone(deal.phone || deal.whatsapp);
  return {
    name: deal.name || deal.title || deal.company || '',
    company: deal.company || deal.name || '',
    segment: deal.segment || '',
    value: Number(deal.value) || 0,
    prob: Number(deal.prob ?? deal.probability) || 0,
    stage: normalizeStage(deal.stage),
    owner: deal.owner || 'Erick',
    owner_name: deal.ownerName || 'Erick',
    close_date: deal.close || null,
    tag: deal.tag || 'Outbound',
    tag_type: deal.tagType || 'research',
    ticket_id: deal.ticketId || '',
    points: Number(deal.points) || 0,
    progress: Number(deal.progress) || 0,
    assignee: deal.assignee || '',
    phone,
    whatsapp: phone,
    analysis_url: deal.analysisUrl || '',
    copy_text: deal.copyText || '',
    site_url: cleanSiteUrl(deal.siteUrl),
    status: deal.status || 'open',
  };
}

function mapLeadDeal(lead, source) {
  const phone = cleanPhone(lead.phone || lead.phoneRaw);
  return {
    name: lead.name || '',
    company: lead.name || '',
    segment: lead.segment || '',
    value: 0,
    prob: Number(lead.score) || 0,
    stage: normalizeStage(lead.status),
    owner: 'Erick',
    owner_name: 'Erick',
    tag: source,
    tag_type: 'research',
    ticket_id: `${source.toUpperCase()}-${String(lead.name || '').slice(0, 64)}`,
    points: Math.round((Number(lead.score) || 0) / 10),
    progress: 0,
    assignee: 'ES',
    phone,
    whatsapp: phone,
    analysis_url: lead.auditFile || '',
    copy_text: lead.message || '',
    site_url: cleanSiteUrl(lead.website),
    status: 'open',
  };
}

function mapMockContact(contact) {
  const phone = cleanPhone(contact.phone || contact.whatsapp);
  return {
    name: contact.name || contact.company || '',
    company: contact.company || '',
    email: contact.email || '',
    phone,
    whatsapp: phone,
    status: contact.status || 'lead',
    initials: contact.initials || '',
    owner: contact.owner || 'Erick',
    owner_name: contact.ownerName || 'Erick',
    notes: contact.notes || null,
  };
}

function mapLeadContact(lead) {
  const phone = cleanPhone(lead.phone || lead.phoneRaw);
  return {
    name: lead.name || '',
    company: lead.name || '',
    email: '',
    phone,
    whatsapp: phone,
    status: 'lead',
    initials: '',
    owner: 'Erick',
    owner_name: 'Erick',
    notes: lead.address || null,
  };
}

function dedupeBy(rows, keyFn) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyFn(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function tableCount(table) {
  if (!supabase) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias para gravar o seed.');
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function insertBatch(table, rows) {
  if (!supabase) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias para gravar o seed.');
  let successCount = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
    successCount += batch.length;
    process.stdout.write(`  ${table}: ${successCount}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${successCount}/${rows.length}`);
}

async function main() {
  const mock = loadMockDb();
  const garimpo = readJsonArray(GARIMPO_PATH);
  const disparo = readJsonArray(DISPARO_PATH);

  const deals = dedupeBy(
    [
      ...mock.deals.map(mapMockDeal),
      ...garimpo.map((lead) => mapLeadDeal(lead, 'garimpo')),
      ...disparo.map((lead) => mapLeadDeal(lead, 'disparo')),
    ],
    (deal) => `${deal.company}|${deal.phone}|${deal.site_url}`
  ).slice(0, LIMIT);

  const contacts = dedupeBy(
    [
      ...mock.contacts.map(mapMockContact),
      ...garimpo.map(mapLeadContact),
      ...disparo.map(mapLeadContact),
    ],
    (contact) => `${contact.name}|${contact.phone}`
  ).slice(0, LIMIT);

  console.log(`Seed preparado: ${deals.length} deals | ${contacts.length} contacts`);

  if (DRY_RUN) {
    console.log(JSON.stringify({ deals: deals.slice(0, 2), contacts: contacts.slice(0, 2) }, null, 2));
    return;
  }

  const [dealsCount, contactsCount] = await Promise.all([tableCount('deals'), tableCount('contacts')]);
  if (!FORCE && (dealsCount > 0 || contactsCount > 0)) {
    console.error(`Seed abortado: deals=${dealsCount}, contacts=${contactsCount}. Use --force conscientemente.`);
    process.exit(1);
  }

  await insertBatch('deals', deals);
  await insertBatch('contacts', contacts);
  console.log('Seed concluido.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
