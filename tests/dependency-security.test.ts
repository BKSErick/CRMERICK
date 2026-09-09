import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { expand } = require("brace-expansion") as { expand: (pattern: string) => string[] };
const { minimatch } = require("minimatch") as {
  minimatch: (value: string, pattern: string) => boolean;
};
const packageJson = require("../package.json") as {
  dependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

test("mantem o grafo de glob seguro e compativel com o lint", () => {
  assert.equal(typeof expand, "function");
  assert.deepEqual(expand("{a,b}"), ["a", "b"]);
  assert.equal(typeof minimatch, "function");
  assert.equal(minimatch("src/app/api/deals/route.ts", "src/**/*.ts"), true);
  assert.equal(packageJson.dependencies?.next, "16.3.4");

  assert.deepEqual(packageJson.overrides, {
    "baseline-browser-mapping": "2.11.0",
    "brace-expansion": "5.0.9",
    minimatch: "10.2.5",
    postcss: "8.5.25",
    sharp: "0.35.4",
  });
});
