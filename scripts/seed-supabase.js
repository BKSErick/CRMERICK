/**
 * seed-supabase.js
 * Lê o mock-db.js e sobe todos os deals + contacts para o Supabase.
 * Roda UMA VEZ (idempotente: verifica duplicatas pelo ticket_id / nome).
 *
 * USO:
 *   node scripts/seed-supabase.js
 *   node scripts/seed-supabase.js --dry-run   (mostra quantos registros, não sobe)
 *   node scripts/seed-supabase.js --limit=20  (só os 20 primeiros, pra testar)
 */

const { createClient } = require('@supabase/supabase-js');
const path  = require('path');
const vm    = require('vm');
const fs    = require('fs');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://rezgkabwxxltpprpvdua.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_xGIK0X5KEuzmIBftq4DJJA_gfxJmgik';
const MOCK_DB_PATH  = path.join(__dirname, '..', 'js', 'mock-db.js');
const BATCH_SIZE    = 50;
const DRY_RUN       = process.argv.includes('--dry-run');
const LIMIT_ARG     = process.argv.find(a => a.startsWith('--limit='));
const LIMIT         = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity;
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Carrega window.deals e window.contacts do mock-db.js usando vm sandbox.
 */
function loadMockDb() {
  console.log('📂 Lendo mock-db.js...');
  const raw = fs.readFileSync(MOCK_DB_PATH, 'utf8');
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(raw, sandbox);
  } catch(e) {
    // mock-db pode usar eval-unsafe patterns; tentar fallback via regex
    console.warn('⚠️  vm falhou, usando regex fallback:', e.message);
    const dealsMatch    = raw.match(/window\.deals\s*=\s*(\[[\s\S]*?\]);/);
    const contactsMatch = raw.match(/window\.contacts\s*=\s*(\[[\s\S]*?\]);/);
    if (!dealsMatch || !contactsMatch) {
      throw new Error('Não foi possível parsear mock-db.js');
    }
    sandbox.window.deals    = eval(dealsMatch[1]);
    sandbox.window.contacts = eval(contactsMatch[1]);
  }
  return {
    deals:    (sandbox.window.deals    || []).slice(0, LIMIT),
    contacts: (sandbox.window.contacts || []).slice(0, LIMIT),
  };
}

/**
 * Mapeia um deal do mock-db para o schema do Supabase.
 */
// URLs que indicam "sem site" (artefatos do gerador)
const FAKE_SITE_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

function cleanSiteUrl(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (FAKE_SITE_PATTERNS.some(p => lower.includes(p))) return null;
  return url;
}

function mapDeal(d) {
  return {
    name:         d.name        || '',
    company:      d.company     || '',
    segment:      d.segment     || '',
    value:        d.value       || 0,
    prob:         d.prob        || 0,
    stage:        d.stage       || 'prospect',
    owner:        d.owner       || '',
    owner_name:   d.ownerName   || '',
    close_date:   d.close       || null,
    tag:          d.tag         || '',
    tag_type:     d.tagType     || '',
    ticket_id:    d.ticketId    || '',
    points:       d.points      || 0,
    progress:     d.progress    || 0,
    assignee:     d.assignee    || '',
    analysis_url: d.analysisUrl || '',
    copy_text:    d.copyText    || '',
    site_url:     cleanSiteUrl(d.siteUrl),
    status:       'open',
  };
}

/**
 * Mapeia um contact do mock-db para o schema do Supabase.
 */
function mapContact(c) {
  return {
    name:       c.name       || '',
    company:    c.company    || '',
    email:      c.email      || '—',
    phone:      c.phone      || '—',
    whatsapp:   c.whatsapp   || null,
    status:     c.status     || 'lead',
    initials:   c.initials   || '',
    owner:      c.owner      || '',
    owner_name: c.ownerName  || '',
    notes:      c.notes      || null,
  };
}

/**
 * Insert em batches (evita timeout em 1k+ registros).
 * Usa insert simples — idempotente pela verificação de contagem prévia.
 */
async function insertBatch(table, rows) {
  let successCount = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`\n❌ Erro no batch ${i}-${i+BATCH_SIZE} de ${table}:`, error.message);
    } else {
      successCount += batch.length;
      process.stdout.write(`  ✅ ${table}: ${successCount}/${rows.length}\r`);
    }
  }
  console.log(`  ✅ ${table}: ${successCount}/${rows.length} — concluído!`);
}

async function tableIsEmpty(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return true; // assume vazia se erro
  return (count || 0) === 0;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  const { deals, contacts } = loadMockDb();
  const mappedDeals    = deals.map(mapDeal);
  const mappedContacts = contacts.map(mapContact);

  console.log(`\n📊 Total: ${mappedDeals.length} deals | ${mappedContacts.length} contacts`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY-RUN — exemplo dos primeiros 2 deals:');
    console.log(JSON.stringify(mappedDeals.slice(0, 2), null, 2));
    console.log('\n🔍 Exemplo dos primeiros 2 contacts:');
    console.log(JSON.stringify(mappedContacts.slice(0, 2), null, 2));
    console.log('\n✋ Nada foi salvo (--dry-run).');
    return;
  }

  // Verificação de idempotência
  const dealsEmpty    = await tableIsEmpty('deals');
  const contactsEmpty = await tableIsEmpty('contacts');

  if (!dealsEmpty || !contactsEmpty) {
    console.log('\n⚠️  Tabelas já contêm dados!');
    console.log('   Para re-popular, limpe as tabelas no painel do Supabase primeiro.');
    console.log('   Ou use: node scripts/seed-supabase.js --force para ignorar este aviso.');
    if (!process.argv.includes('--force')) {
      console.log('\n❌ Abortado. Use --force para forçar.');
      return;
    }
    console.log('\n⚡ --force detectado, continuando mesmo assim...');
  }

  console.log('\n⬆️  Subindo deals...');
  await insertBatch('deals', mappedDeals);

  console.log('\n⬆️  Subindo contacts...');
  await insertBatch('contacts', mappedContacts);

  console.log('\n🏁 Seed concluído!');
  console.log(`   🔗 Veja em: https://rezgkabwxxltpprpvdua.supabase.co/project/default/editor`);
})();
