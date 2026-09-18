import { NextRequest, NextResponse } from "next/server";
import { requireAiChatAdminSession } from "@/lib/aiChatAuth";
import { getFreeModelCatalog } from "@/lib/aiModelCatalog.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAiChatAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const catalog = await getFreeModelCatalog("OpenRouter");
    return NextResponse.json({
      ok: true,
      provider: "OpenRouter",
      discoveredAt: catalog.discoveredAt,
      models: catalog.models.map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        contextLength: model.contextLength,
        modalities: model.modalities ?? { input: ["text"], output: ["text"] },
        availability: "available",
      })),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Nao foi possivel comprovar o catalogo gratuito agora." }, { status: 503 });
  }
}
