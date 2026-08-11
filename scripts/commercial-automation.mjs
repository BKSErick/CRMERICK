import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { createCommercialEvent } from "../src/lib/commercialAutomation.mjs";
import {
  processCommercialEvent,
  scanDueCommercialEvents,
} from "../src/lib/commercialAutomationService.mjs";

function flagValue(argv, name, fallback = "") {
  const item = argv.find((value) => value.startsWith(`--${name}=`));
  return item ? item.split("=").slice(1).join("=") : fallback;
}

function parsePayload(value) {
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--payload deve ser um objeto JSON.");
  }
  return parsed;
}

export function parseAutomationArgs(argv = process.argv.slice(2)) {
  const dealId = Number(flagValue(argv, "deal-id"));
  return {
    go: argv.includes("--go"),
    scanDue: argv.includes("--scan-due"),
    eventType: flagValue(argv, "event-type"),
    eventId: flagValue(argv, "event-id"),
    dealId: Number.isInteger(dealId) && dealId > 0 ? dealId : null,
    payload: parsePayload(flagValue(argv, "payload")),
  };
}

function stableEventId(options, occurredAt) {
  if (options.eventId) return options.eventId;
  const canonical = JSON.stringify({
    type: options.eventType,
    dealId: options.dealId,
    payload: options.payload,
    occurredAt: occurredAt.slice(0, 10),
  });
  return `cli:${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function printSummary(results, go) {
  const list = Array.isArray(results) ? results : [results];
  const decisions = list.flatMap((item) => item.decisions ?? []);
  console.log(JSON.stringify({
    mode: go ? "apply" : "dry-run",
    events: list.length,
    duplicateEvents: list.filter((item) => item.duplicate).length,
    planned: decisions.filter((item) => item.status === "planned").length,
    applied: decisions.filter((item) => item.status === "applied").length,
    awaitingConfirmation: decisions.filter((item) => item.status === "awaiting_confirmation").length,
    skipped: decisions.filter((item) => item.status === "skipped").length,
    failed: decisions.filter((item) => item.status === "failed").length,
    results: list,
  }, null, 2));
}

async function main() {
  const options = parseAutomationArgs();
  if (!options.scanDue && !options.eventType) {
    console.log("Uso: npm run automation:commercial -- --scan-due [--go]");
    console.log("  ou: --event-type=message.received --deal-id=123 --payload='{}' [--event-id=id] [--go]");
    process.exitCode = 1;
    return;
  }

  const supabase = getSupabase();
  if (options.scanDue) {
    printSummary(await scanDueCommercialEvents(supabase, { apply: options.go }), options.go);
    return;
  }

  const occurredAt = new Date().toISOString();
  const event = createCommercialEvent({
    id: stableEventId(options, occurredAt),
    type: options.eventType,
    dealId: options.dealId,
    occurredAt,
    source: "commercial-automation-cli",
    payload: options.payload,
  });
  printSummary(await processCommercialEvent(supabase, event, { apply: options.go }), options.go);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
