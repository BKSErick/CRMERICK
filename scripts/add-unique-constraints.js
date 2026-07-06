/**
 * add-unique-constraints.js
 * Adiciona UNIQUE constraints nas tabelas deals e contacts via Management API
 * Necessário para que o upsert funcione corretamente
 *
 * USO: node scripts/add-unique-constraints.js
 */

const https = require('https');

const PROJECT_REF  = 'rezgkabwxxltpprpvdua';
// Token via env var: set SUPABASE_ACCESS_TOKEN=sbp_... no terminal antes de rodar
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!ACCESS_TOKEN) {
  console.error('\n❌ SUPABASE_ACCESS_TOKEN não definido!');
  console.error('   Rode: $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/add-unique-constraints.js');
  process.exit(1);
}

// Primeiro limpa os dados duplicados que o seed errado criou, depois adiciona constraints
const sql = `
-- Remove registros duplicados mantendo apenas o de menor id
DELETE FROM public.deals
WHERE id NOT IN (
  SELECT MIN(id) FROM public.deals GROUP BY ticket_id
);

DELETE FROM public.contacts  
WHERE id NOT IN (
  SELECT MIN(id) FROM public.contacts GROUP BY name
);

-- Adiciona UNIQUE constraint para futuros upserts
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_ticket_id_unique,
  ADD CONSTRAINT deals_ticket_id_unique UNIQUE (ticket_id);

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_name_unique,
  ADD CONSTRAINT contacts_name_unique UNIQUE (name);
`;

function runSQL(sqlQuery) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sqlQuery });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(data);
        } else {
          try { reject(JSON.parse(data)); }
          catch { reject(new Error(`HTTP ${res.statusCode}: ${data}`)); }
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log('🔧 Adicionando UNIQUE constraints e limpando duplicatas...');
  try {
    const result = await runSQL(sql);
    console.log('✅ Constraints adicionadas com sucesso!');
    console.log('   deals: UNIQUE(ticket_id)');
    console.log('   contacts: UNIQUE(name)');
    console.log('\n📊 Resultado:', result);
  } catch (err) {
    console.error('❌ Erro:', err.message || JSON.stringify(err));
  }
})();
