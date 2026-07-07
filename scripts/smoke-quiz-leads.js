const fs = require("node:fs");

const PROJECT_REF = "rezgkabwxxltpprpvdua";

function loadEnv() {
  if (!fs.existsSync(".env")) return {};
  return Object.fromEntries(
    fs
      .readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]),
  );
}

async function queryProject(query) {
  const env = { ...loadEnv(), ...process.env };
  if (!env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN ausente.");
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 600)}`);
  }

  return body ? JSON.parse(body) : [];
}

async function main() {
  const marker = `smoke-${Date.now()}`;
  const email = `${marker}@example.invalid`;
  const phone = `119${String(Date.now()).slice(-8)}`;

  await queryProject(`
    delete from public.quiz_leads where source = 'smoke' or external_id like 'smoke-%';
    delete from public.deals where ticket_id like 'QUIZ-smoke-%';
  `);

  let row;
  try {
    await queryProject(`
      insert into public.quiz_leads (external_id, source, name, email, phone, whatsapp, score, gargalo, raw_payload)
      values ('${marker}', 'smoke', 'Lead Smoke Quiz', '${email}', '${phone}', '${phone}', 87, 'Follow-up lento', '{"smoke":true}'::jsonb);
    `);

    const result = await queryProject(`
      select
        q.id as quiz_lead_id,
        q.materialized_deal_id,
        q.score,
        q.gargalo,
        d.stage,
        d.points,
        d.prob,
        d.segment,
        d.phone,
        d.whatsapp
      from public.quiz_leads q
      join public.deals d on d.id = q.materialized_deal_id
      where q.external_id = '${marker}'
      limit 1;
    `);

    row = result[0];
    if (!row || row.stage !== "prospect" || Number(row.points) < 8 || row.segment !== "Follow-up lento") {
      throw new Error(`Smoke quiz_leads falhou: ${JSON.stringify(row)}`);
    }
  } finally {
    await queryProject(`
      delete from public.quiz_leads where external_id = '${marker}';
      delete from public.deals where ticket_id = 'QUIZ-${marker}';
    `);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        stage: row.stage,
        points: row.points,
        prob: row.prob,
        segment: row.segment,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
