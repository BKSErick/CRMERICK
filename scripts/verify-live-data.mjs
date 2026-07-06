// Verificação rápida: IG Graph + Supabase estão retornando dados reais?
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const envPath = path.resolve(process.cwd(), ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const V = "v21.0";

async function checkInstagram() {
  const token = env.IG_ACCESS_TOKEN;
  const acc = env.IG_BUSINESS_ACCOUNT_ID;
  if (!token || !acc) return console.log("IG: creds faltando");
  const url = `https://graph.facebook.com/${V}/${acc}?fields=username,name,followers_count,media_count&access_token=${token}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) return console.log("IG ❌", r.status, j.error.message);
    console.log(`IG ✅ @${j.username} | ${j.followers_count} seguidores | ${j.media_count} posts`);
    // testa o endpoint de reach (insights) que o Funil usa
    const now = Math.floor(Date.now() / 1000);
    const since = now - 30 * 86400;
    const iu = `https://graph.facebook.com/${V}/${acc}/insights?metric=reach&period=day&metric_type=total_value&since=${since}&until=${now}&access_token=${token}`;
    const ir = await fetch(iu);
    const ij = await ir.json();
    if (ij.error) return console.log("IG reach30 ❌", ir.status, ij.error.message);
    console.log(`IG reach30 ✅ =`, ij.data?.[0]?.total_value?.value ?? "(vazio)");
  } catch (e) {
    console.log("IG ❌ fetch", e.message);
  }
}

async function checkSupabase() {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_KEY;
  if (!base || !key) return console.log("Supabase: creds faltando");
  try {
    // lista tabelas via REST root (retorna OpenAPI se key válida)
    const r = await fetch(`${base}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    console.log(`Supabase REST ${r.status} ${r.ok ? "✅ key válida" : "❌"}`);
  } catch (e) {
    console.log("Supabase ❌", e.message);
  }
}

async function checkPixelToken() {
  const token = env.META_API_TOKEN;
  const ds = env.META_DATASET_ID || env.FACEBOOK_PIXEL_ID;
  if (!token || !ds) return console.log("Pixel: creds faltando");
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${ds}?fields=name,id&access_token=${token}`);
    const j = await r.json();
    if (j.error) return console.log("Pixel token ❌", r.status, j.error.message);
    console.log(`Pixel token ✅ acessa dataset "${j.name}" (${j.id})`);
  } catch (e) {
    console.log("Pixel ❌", e.message);
  }
}

async function checkPixelSend() {
  const token = env.META_API_TOKEN;
  const ds = env.META_DATASET_ID || env.FACEBOOK_PIXEL_ID;
  if (!token || !ds) return console.log("Pixel send: creds faltando");
  const payload = {
    data: [{
      event_name: "DiagnosticoView",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_source_url: "https://verify.local/test",
      user_data: {
        em: [crypto.createHash("sha256").update("teste@verify.local").digest("hex")],
        client_ip_address: "8.8.8.8",
        client_user_agent: "verify-script/1.0",
      },
    }],
    test_event_code: "TEST_VERIFY", // marca como teste, não polui produção
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${ds}/events?access_token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (j.error) return console.log("Pixel send ❌", r.status, JSON.stringify(j.error));
    console.log(`Pixel send ✅ events_received=${j.events_received} trace=${j.fbtrace_id}`);
  } catch (e) {
    console.log("Pixel send ❌", e.message);
  }
}

await checkInstagram();
await checkPixelToken();
await checkPixelSend();
await checkSupabase();
