import fs from "node:fs";
import path from "node:path";
import { createAdminSession } from "../src/lib/adminAuth.ts";

const cdpUrl = "http://127.0.0.1:9223";
const appUrl = "http://127.0.0.1:3107";
const outputDir = process.env.TEMP || "D:/tmp";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${cdpUrl}/json/new?${appUrl}/pipeline`, { method: "PUT" });
      if (response.ok) return response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome CDP indisponivel.");
}

const page = await openPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const patchRequests = [];
let sequence = 0;

socket.addEventListener("message", async (event) => {
  const raw = typeof event.data === "string" ? event.data : await event.data.text();
  const message = JSON.parse(raw);
  if (message.method === "Network.requestWillBeSent" && message.params?.request?.method === "PATCH") {
    patchRequests.push(message.params.request.url);
  }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await new Promise((resolve, reject) => {
  if (socket.readyState === WebSocket.OPEN) return resolve();
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
const token = await createAdminSession({
  email: "admin@example.invalid",
  secret: "0123456789abcdef0123456789abcdef",
});
await send("Network.setCookie", { name: "crm_admin_session", value: token, url: appUrl, httpOnly: true, sameSite: "Lax" });
await send("Page.navigate", { url: `${appUrl}/pipeline` });

let cardReady = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const result = await send("Runtime.evaluate", {
    expression: `Boolean(document.querySelector('.kanban-column:not([data-stage="lost"]) .deal-card'))`,
    returnByValue: true,
  });
  if (result.result.value) { cardReady = true; break; }
  await sleep(500);
}
if (!cardReady) throw new Error("Nenhum deal ativo foi carregado no Pipeline.");

await send("Runtime.evaluate", {
  expression: `document.querySelector('.kanban-column:not([data-stage="lost"]) .deal-card').click()`,
  returnByValue: true,
});
let statusReady = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const result = await send("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('.meta-row')].some((item)=>item.querySelector('.meta-label')?.textContent.trim()==='Status')`,
    returnByValue: true,
  });
  if (result.result.value) { statusReady = true; break; }
  await sleep(250);
}
if (!statusReady) throw new Error("Overlay do deal nao abriu com o seletor de status.");

const stageChange = await send("Runtime.evaluate", {
  expression: `(() => {
    const row=[...document.querySelectorAll('.meta-row')].find((item)=>item.querySelector('.meta-label')?.textContent.trim()==='Status');
    const select=row?.querySelector('select');
    if(!select) return {ok:false};
    const previous=select.value;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'lost');
    select.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:true,previous};
  })()`,
  returnByValue: true,
});
if (!stageChange.result.value?.ok) throw new Error("Seletor de status nao encontrado.");
await sleep(500);

const dialog = await send("Runtime.evaluate", {
  expression: `(() => { const heading=[...document.querySelectorAll('h2')].find((item)=>item.textContent.trim()==='Registrar razao da perda'); if(!heading)return {ok:false}; const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim()==='Cancelar'); const r=button.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`,
  returnByValue: true,
});
if (!dialog.result.value?.ok) throw new Error("Dialogo de razao da perda nao abriu.");

const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
const target = path.join(outputDir, "crm-erick-loss-reason-dialog.png");
fs.writeFileSync(target, Buffer.from(screenshot.data, "base64"));

await send("Input.dispatchMouseEvent", { type: "mousePressed", x: dialog.result.value.x, y: dialog.result.value.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dialog.result.value.x, y: dialog.result.value.y, button: "left", clickCount: 1 });
await sleep(400);

const cancelled = await send("Runtime.evaluate", {
  expression: `(() => {
    const hasDialog=[...document.querySelectorAll('h2')].some((item)=>item.textContent.trim()==='Registrar razao da perda');
    const row=[...document.querySelectorAll('.meta-row')].find((item)=>item.querySelector('.meta-label')?.textContent.trim()==='Status');
    return {hasDialog,value:row?.querySelector('select')?.value||null};
  })()`,
  returnByValue: true,
});
if (cancelled.result.value.hasDialog || cancelled.result.value.value !== stageChange.result.value.previous || patchRequests.length > 0) {
  throw new Error(`Cancelamento invalido: ${JSON.stringify({ state: cancelled.result.value, patchRequests })}`);
}

console.log(JSON.stringify({ ok: true, screenshot: target, previousStage: stageChange.result.value.previous, patchRequests: 0 }));
await send("Browser.close");
