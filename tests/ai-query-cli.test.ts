import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cli = readFileSync(new URL("../scripts/ai-chat-query.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("CLI usa o mesmo roteador e broker somente leitura", () => {
  assert.match(cli, /planAiQuery/);
  assert.match(cli, /retrieveAiEvidence/);
  assert.doesNotMatch(cli, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(pkg.scripts["ai:query"], /ai-chat-query\.mjs/);
});
