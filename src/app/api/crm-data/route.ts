import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type MockWindow = {
  deals?: unknown[];
  contacts?: unknown[];
  stages?: unknown[];
  ownerMeta?: Record<string, unknown>;
};

export async function GET() {
  const mockDbPath = path.join(process.cwd(), "js", "mock-db.js");

  try {
    const raw = fs.readFileSync(mockDbPath, "utf8");
    const sandbox: { window: MockWindow } = { window: {} };
    vm.runInNewContext(raw, sandbox, { timeout: 5000 });

    return NextResponse.json({
      ok: true,
      deals: sandbox.window.deals ?? [],
      contacts: sandbox.window.contacts ?? [],
      stages: sandbox.window.stages ?? [],
      ownerMeta: sandbox.window.ownerMeta ?? {},
      source: "js/mock-db.js",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao carregar mock-db.js",
      },
      { status: 500 },
    );
  }
}
