/**
 * apply-schema.js
 * Aplica o supabase-schema.sql diretamente no banco via pg (PostgreSQL driver).
 *
 * Requer: npm install pg
 * USO:  node scripts/apply-schema.js
 *
 * ⚠️  Preencha DB_PASSWORD abaixo com a senha do seu banco Supabase.
 *     (Dashboard → Settings → Database → Database password)
 */

const { Client } = require('pg');
const fs   = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Pegue a senha em: https://supabase.com/dashboard/project/rezgkabwxxltpprpvdua/settings/database
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_URL      = `postgresql://postgres:${DB_PASSWORD}@db.rezgkabwxxltpprpvdua.supabase.co:5432/postgres`;
// ─────────────────────────────────────────────────────────────────────────────

if (!DB_PASSWORD) {
  console.error('❌ Defina DB_PASSWORD:');
  console.error('   $env:DB_PASSWORD="SUA_SENHA"; node scripts/apply-schema.js');
  process.exit(1);
}

const SCHEMA_PATH = path.join(__dirname, 'supabase-schema.sql');

(async () => {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log('🔌 Conectando ao banco...');
    await client.connect();
    console.log('✅ Conectado!\n');

    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    
    // Remove comentários de bloco (/** */) que o pg não aceita
    const cleanSql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    
    console.log('📋 Aplicando schema...');
    await client.query(cleanSql);
    console.log('✅ Schema aplicado com sucesso!');
    console.log('   Tabelas criadas: deals, contacts, messages, activities');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
