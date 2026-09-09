import fs from "node:fs";
import path from "node:path";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, "")]),
  );
}

const env = { ...readEnv(path.resolve(".env")), ...process.env };
const baseUrl = (process.argv.find((value) => value.startsWith("--base="))?.slice(7) || "https://crmerick.vercel.app")
  .replace(/\/+$/, "");
const secret = env.BREVO_CONVERSATIONS_WEBHOOK_SECRET;

if (!secret) throw new Error("BREVO_CONVERSATIONS_WEBHOOK_SECRET ausente no .env local.");

const protectedPage = await fetch(`${baseUrl}/emails`, { redirect: "manual" });
const protectedApi = await fetch(`${baseUrl}/api/emails`, { redirect: "manual" });
const unauthorizedWebhook = await fetch(`${baseUrl}/api/webhooks/brevo/conversations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
const authorizedWebhook = await fetch(`${baseUrl}/api/webhooks/brevo/conversations`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ event: "codexSmokeIgnored" }),
});

const checks = {
  emails_page_requires_login:
    [302, 303, 307, 308].includes(protectedPage.status) &&
    (protectedPage.headers.get("location") ?? "").startsWith("/login"),
  emails_api_requires_login: protectedApi.status === 401,
  webhook_rejects_missing_secret: unauthorizedWebhook.status === 401,
  webhook_accepts_configured_secret: authorizedWebhook.status === 202,
};

console.log(JSON.stringify({ baseUrl, checks }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
