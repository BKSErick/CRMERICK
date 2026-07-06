/**
 * apply-schema-api.js
 * Aplica o supabase-schema.sql via Supabase Management API
 * Usa o personal access token (não precisa de senha do banco)
 *
 * USO: node scripts/apply-schema-api.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PROJECT_REF   = 'rezgkabwxxltpprpvdua';
// Token via env var: set SUPABASE_ACCESS_TOKEN=sbp_... no terminal antes de rodar
const ACCESS_TOKEN  = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!ACCESS_TOKEN) {
  console.error('\n❌ SUPABASE_ACCESS_TOKEN não definido!');
  console.error('   Rode: $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/apply-schema-api.js');
  process.exit(1);
}
const SCHEMA_FILE   = path.join(__dirname, 'supabase-schema.sql');

const sql = fs.readFileSync(SCHEMA_FILE, 'utf8')
  // Remove comentários de bloco /** */ para evitar erros de parse
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .trim();

const body = JSON.stringify({ query: sql });

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

console.log('🚀 Aplicando schema no Supabase via Management API...');
console.log(`   Projeto: ${PROJECT_REF}`);

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('\n✅ Schema aplicado com sucesso!');
      console.log('   Agora rode: node scripts/seed-supabase.js');
    } else {
      console.error(`\n❌ Erro HTTP ${res.statusCode}:`);
      try {
        const parsed = JSON.parse(data);
        console.error(JSON.stringify(parsed, null, 2));
      } catch {
        console.error(data);
      }
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Erro de rede:', e.message);
});

req.write(body);
req.end();
