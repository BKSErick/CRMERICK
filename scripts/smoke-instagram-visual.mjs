import fs from "node:fs";
import path from "node:path";
import { createAdminSession } from "../src/lib/adminAuth.ts";

const cdpUrl = process.env.CRM_SMOKE_CDP_URL || "http://127.0.0.1:9223";
const appUrl = process.env.CRM_SMOKE_APP_URL || "http://127.0.0.1:3107";
const outputDir = process.env.TEMP || "D:/tmp";
const smokeEmail = "admin@example.invalid";
const smokeSecret = "0123456789abcdef0123456789abcdef";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openPage() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${cdpUrl}/json/new?${appUrl}/instagram`, { method: "PUT" });
      if (response.ok) return response.json();
    } catch {
      // O Chrome pode levar alguns instantes para publicar o endpoint CDP.
    }
    await sleep(250);
  }
  throw new Error("Chrome CDP indisponivel para o smoke visual.");
}

const page = await openPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
};

await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send("Network.enable");
const token = await createAdminSession({ email: smokeEmail, secret: smokeSecret });
await send("Network.setCookie", {
  name: "crm_admin_session",
  value: token,
  url: appUrl,
  httpOnly: true,
  sameSite: "Lax",
});
await send("Page.navigate", { url: `${appUrl}/instagram` });
await sleep(2500);

for (const [name, tabIndex] of [["overview", null], ["prospecting", 1], ["followups", 2]]) {
  if (tabIndex !== null) {
    await send("Runtime.evaluate", {
      expression: `document.querySelectorAll(".ig-tabs button")[${tabIndex}].click()`,
    });
    await sleep(name === "followups" ? 4000 : 1200);
  }
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const target = path.join(outputDir, `crm-erick-instagram-${name}.png`);
  fs.writeFileSync(target, Buffer.from(screenshot.data, "base64"));
  console.log(`captured_${name}=${target}`);
}

await send("Browser.close");
