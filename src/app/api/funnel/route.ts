import { NextResponse } from "next/server";

import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { buildOperationalFunnel, buildVariantReport } from "@/lib/funnelMetrics";
import salesPlaybookModule from "@/lib/salesPlaybook.mjs";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const [dealsResult, activitiesResult, meetingsResult] = await Promise.all([
      supabase
        .from("deals")
        .select("id, stage, response_type, referred_phone, value, recurring, is_prospect, copy_variant, experiment_id")
        .limit(10000),
      supabase
        .from("activities")
        .select("deal_id, type")
        .in("type", ["whatsapp_sent", "whatsapp_sent_sync"])
        .limit(20000),
      supabase
        .from("calendar_events")
        .select("deal_id, kind, meeting_status, done")
        .eq("kind", "reuniao")
        .limit(5000),
    ]);

    if (dealsResult.error) throw dealsResult.error;
    if (activitiesResult.error) throw activitiesResult.error;
    if (meetingsResult.error) throw meetingsResult.error;

    const deals = dealsResult.data ?? [];
    const activities = activitiesResult.data ?? [];
    const meetings = meetingsResult.data ?? [];
    const funnel = buildOperationalFunnel({ deals, activities, meetings });
    const experimentId = salesPlaybookModule.SALES_PLAYBOOK.experiment.id;
    const variants = buildVariantReport({ deals, activities, meetings, experimentId });

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      experimentId,
      funnel,
      variants,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao calcular o funil." },
      { status: 500 },
    );
  }
}
