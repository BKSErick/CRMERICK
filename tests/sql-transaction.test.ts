import assert from "node:assert/strict";
import test from "node:test";

import { unwrapOuterTransaction } from "../scripts/lib/sqlTransaction.mjs";

test("unwrapOuterTransaction removes one explicit outer BEGIN/COMMIT pair", () => {
  const sql = `-- migration\nbegin;\n\ncreate table public.example (id bigint);\n\ncommit;\n`;

  assert.equal(
    unwrapOuterTransaction(sql),
    `-- migration\n\n\ncreate table public.example (id bigint);\n\n\n`,
  );
});

test("unwrapOuterTransaction preserves SQL without an outer transaction", () => {
  const sql = "create table public.example (id bigint);\n";

  assert.equal(unwrapOuterTransaction(sql), sql);
});

test("unwrapOuterTransaction does not remove transaction words inside strings", () => {
  const sql = `begin;\nselect 'commit;' as example;\ncommit;`;

  assert.equal(unwrapOuterTransaction(sql), `\nselect 'commit;' as example;\n`);
});
