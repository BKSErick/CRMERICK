/**
 * Audita se a base esta pronta para disparo:
 * - deal com copy
 * - contato/lead com telefone
 * - link WhatsApp geravel
 *
 * USO:
 *   node scripts/audit-disparo-readiness.js
 *   node scripts/audit-disparo-readiness.js --csv
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MOCK_DB_PATH = path.join(__dirname, '..', 'js', 'mock-db.js');
const EXPORT_CSV = process.argv.includes('--csv');

function loadMockDb() {
  const raw = fs.readFileSync(MOCK_DB_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(raw, sandbox);
  return {
    deals: sandbox.window.deals || [],
    contacts: sandbox.window.contacts || [],
  };
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(value) {
  const phone = digits(value);
  if (!phone || phone.length < 8) return '';
  return phone.startsWith('55') ? phone : `55${phone}`;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

const { deals, contacts } = loadMockDb();
const contactsByName = new Map();
const contactsByCompany = new Map();

for (const contact of contacts) {
  if (contact.name) contactsByName.set(contact.name.toLowerCase().trim(), contact);
  if (contact.company) contactsByCompany.set(contact.company.toLowerCase().trim(), contact);
}

const rows = deals.map((deal) => {
  const contact =
    contactsByName.get(String(deal.name || '').toLowerCase().trim()) ||
    contactsByCompany.get(String(deal.company || '').toLowerCase().trim());
  const phone = normalizePhone(deal.phone || contact?.phone || contact?.whatsapp);
  const copy = String(deal.copyText || '').trim();

  return {
    ticketId: deal.ticketId || deal.id,
    company: deal.company || deal.name || '',
    stage: deal.stage || '',
    phone,
    hasPhone: Boolean(phone),
    hasCopy: copy.length > 20,
    hasAnalysis: Boolean(deal.analysisUrl),
    ready: Boolean(phone && copy.length > 20),
    messageChars: copy.length,
  };
});

const summary = {
  totalDeals: rows.length,
  ready: rows.filter((row) => row.ready).length,
  missingPhone: rows.filter((row) => !row.hasPhone).length,
  missingCopy: rows.filter((row) => !row.hasCopy).length,
  missingAnalysis: rows.filter((row) => !row.hasAnalysis).length,
};

if (EXPORT_CSV) {
  const csvPath = path.join(__dirname, '..', 'tmp-disparo-readiness.csv');
  const header = ['ticketId', 'company', 'stage', 'phone', 'hasPhone', 'hasCopy', 'hasAnalysis', 'ready', 'messageChars'];
  const lines = [header.join(',')].concat(rows.map((row) => header.map((key) => csvEscape(row[key])).join(',')));
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
  console.log(`[audit] CSV gerado: ${csvPath}`);
}

console.log(JSON.stringify(summary, null, 2));
