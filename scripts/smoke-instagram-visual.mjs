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
const browserDiagnostics = [];
let sequence = 0;

socket.addEventListener("message", async (event) => {
  const rawMessage = typeof event.data === "string" ? event.data : await event.data.text();
  const message = JSON.parse(rawMessage);
  if (message.method === "Runtime.exceptionThrown") {
    browserDiagnostics.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || "Runtime exception");
  }
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
    browserDiagnostics.push(message.params.entry.text);
  }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

socket.addEventListener("close", () => {
  for (const request of pending.values()) request.reject(new Error("Conexao CDP encerrada antes da resposta."));
  pending.clear();
});

await new Promise((resolve, reject) => {
  if (socket.readyState === WebSocket.OPEN) {
    resolve();
    return;
  }
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send("Network.enable");
await send("Runtime.enable");
await send("Log.enable");
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

for (const [name, label] of [
  ["overview", "Visão geral"],
  ["prospecting", "Achados"],
  ["followups", "Leads e follow-ups"],
]) {
  const clickTarget = await send("Runtime.evaluate", {
    expression: `(() => {
      const expected = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll(".ig-tabs button")]
        .find((item) => item.textContent.trim() === expected);
      if (!button) return { ok: false, reason: "tab_not_found", expected };
      const rect = button.getBoundingClientRect();
      return { ok: true, expected, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
    returnByValue: true,
  });
  if (!clickTarget.result.value?.ok) throw new Error(`Aba ${label} nao encontrada no smoke visual.`);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: clickTarget.result.value.x,
    y: clickTarget.result.value.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: clickTarget.result.value.x,
    y: clickTarget.result.value.y,
    button: "left",
    clickCount: 1,
  });
  await sleep(1200);
  const active = await send("Runtime.evaluate", {
    expression: `document.querySelector(".ig-tabs button.active")?.textContent.trim() || ""`,
    returnByValue: true,
  });
  if (active.result.value !== label) {
    const diagnostic = await send("Runtime.evaluate", {
      expression: `(() => {
        const expected = ${JSON.stringify(label)};
        const button = [...document.querySelectorAll(".ig-tabs button")]
          .find((item) => item.textContent.trim() === expected);
        const reactPropsKey = button ? Object.keys(button).find((key) => key.startsWith("__reactProps")) : null;
        return {
          readyState: document.readyState,
          nextError: document.querySelector("nextjs-portal")?.shadowRoot?.textContent?.trim().slice(0, 500) || "",
          reactPropsKey: reactPropsKey || "",
          hasOnClick: Boolean(reactPropsKey && button?.[reactPropsKey]?.onClick),
          scripts: [...document.scripts].map((script) => script.src).filter(Boolean).length,
          browserDiagnostics: ${JSON.stringify(browserDiagnostics)}.slice(-8),
        };
      })()`,
      returnByValue: true,
    });
    throw new Error(`Smoke permaneceu em ${active.result.value || "nenhuma aba"}; esperado ${label}. Diagnostico: ${JSON.stringify(diagnostic.result.value)}`);
  }
  if (name === "followups") {
    let queueState = { ready: false, error: "" };
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await send("Runtime.evaluate", {
        expression: `({
          ready: Boolean(document.querySelector(".ig-kanban-layout")),
          error: document.querySelector(".ig-notice.error")?.textContent?.trim() || "",
        })`,
        returnByValue: true,
      });
      queueState = result.result.value;
      if (queueState.ready || queueState.error) break;
      await sleep(500);
    }
    if (queueState.error) throw new Error(`Fila do Instagram falhou no smoke visual: ${queueState.error}`);
    if (!queueState.ready) throw new Error("Kanban do Instagram nao carregou a tempo no smoke visual.");
    await sleep(500);
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
