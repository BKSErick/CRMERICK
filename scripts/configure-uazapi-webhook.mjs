import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

const baseUrl = process.env.UAZAPI_BASE_URL;
const instanceToken = process.env.UAZAPI_INSTANCE_TOKEN;
const webhookUrl =
  process.env.UAZAPI_WEBHOOK_URL || "https://crmerick.vercel.app/api/webhooks/uazapi";
const webhookSecret =
  process.env.UAZAPI_WEBHOOK_SECRET || randomBytes(32).toString("base64url");

const missing = [
  ["UAZAPI_BASE_URL", baseUrl],
  ["UAZAPI_INSTANCE_TOKEN", instanceToken],
  ...(dryRun
    ? []
    : [
        ["SUPABASE_URL", process.env.SUPABASE_URL],
        ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
      ]),
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.error(`Variaveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

const endpoint = new URL("/webhook", baseUrl);
const destination = new URL(webhookUrl);
destination.searchParams.set("secret", webhookSecret);

const payload = {
  enabled: true,
  url: destination.toString(),
  events: ["messages"],
  excludeMessages: ["wasSentByApi", "isGroupYes"],
  addUrlEvents: false,
  addUrlTypesMessages: false,
};

if (dryRun) {
  console.log(`Servidor: ${endpoint.origin}`);
  console.log(`Webhook: ${destination.origin}${destination.pathname}?secret=[redacted]`);
  console.log(
    JSON.stringify(
      {
        ...payload,
        url: `${destination.origin}${destination.pathname}?secret=[redacted]`,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const secretHash = createHash("sha256").update(webhookSecret).digest("hex");
const stored = await supabase.from("integration_settings").upsert(
  {
    provider: "uazapi",
    webhook_secret_hash: secretHash,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "provider" },
);
if (stored.error) {
  console.error(`Falha ao registrar autenticacao do webhook: ${stored.error.message}`);
  process.exit(1);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    token: instanceToken,
  },
  body: JSON.stringify(payload),
});
const body = await response.text();

if (!response.ok) {
  console.error(`Falha ao configurar webhook: HTTP ${response.status}`);
  console.error(body.slice(0, 500));
  process.exit(1);
}

console.log(`Webhook da Uazapi configurado com sucesso (HTTP ${response.status}).`);
console.log("O banco armazenou somente o hash do segredo exclusivo do webhook.");
