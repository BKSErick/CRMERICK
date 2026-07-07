const fs = require('fs');

const PROJECT_REF = 'rezgkabwxxltpprpvdua';

function loadEnv() {
  if (!fs.existsSync('.env')) return {};
  return Object.fromEntries(
    fs
      .readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()])
  );
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  if (!env.SUPABASE_ACCESS_TOKEN) {
    throw new Error('SUPABASE_ACCESS_TOKEN ausente.');
  }

  const query = `
    select tablename, policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('deals', 'contacts', 'messages', 'activities', 'pixel_events', 'quiz_leads')
    order by tablename, policyname;
  `;
  const countsQuery = `
    select 'deals' as table_name, count(*)::int as row_count from public.deals
    union all select 'contacts', count(*)::int from public.contacts
    union all select 'messages', count(*)::int from public.messages
    union all select 'activities', count(*)::int from public.activities
    union all select 'quiz_leads', count(*)::int from public.quiz_leads
    order by table_name;
  `;

  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const body = await response.json();
  if (!response.ok) {
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(body, null, 2));

  const countsResponse = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: countsQuery }),
  });
  const countsBody = await countsResponse.json();
  if (!countsResponse.ok) {
    console.error(JSON.stringify(countsBody, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(countsBody, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
