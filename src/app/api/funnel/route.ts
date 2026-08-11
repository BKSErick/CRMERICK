import { NextRequest, NextResponse } from "next/server";

import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { calculateForecast } from "@/lib/dealForecast.mjs";
import { buildLossAnalysis } from "@/lib/dealLossReasons.mjs";
import { buildOperationalFunnel, buildVariantReport } from "@/lib/funnelMetrics";
import salesPlaybookModule from "@/lib/salesPlaybook.mjs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const [dealsResult, activitiesResult, meetingsResult, lossRecordsResult] = await Promise.all([
      supabase
        .from("deals")
        .select("id, name, company, stage, response_type, referred_phone, value, prob, recurring, is_prospect, copy_variant, experiment_id, close_date, closed_at, last_inbound_at, last_outbound_at, next_action_at, deal_health_score, qualification")
        .limit(10000),
      supabase
        .from("activities")
        .select("deal_id, type")
        .in("type", ["whatsapp_sent", "whatsapp_sent_sync"])
        .limit(20000),
      supabase
        .from("calendar_events")
        .select("deal_id, kind, starts_at, meeting_status, done")
        .eq("kind", "reuniao")
        .limit(5000),
      supabase
        .from("deal_loss_records")
        .select("id, deal_id, episode_id, reason_code, note, recorded_by, recorded_at, segment_snapshot, origin_snapshot, superseded_reason")
        .limit(10000),
    ]);

    if (dealsResult.error) throw dealsResult.error;
    if (activitiesResult.error) throw activitiesResult.error;
    if (meetingsResult.error) throw meetingsResult.error;

    const lossRecords = lossRecordsResult.error ? [] : (lossRecordsResult.data ?? []);
    const currentLossByDeal = new Map(
      lossRecords
        .filter((record) => !record.superseded_reason)
        .map((record) => [Number(record.deal_id), record]),
    );
    const deals = (dealsResult.data ?? []).map((deal) => {
      const loss = currentLossByDeal.get(Number(deal.id));
      return loss ? {
        ...deal,
        loss_reason_code: loss.reason_code,
        loss_reason_note: loss.note,
        loss_recorded_at: loss.recorded_at,
        loss_recorded_by: loss.recorded_by,
      } : deal;
    });
    const activities = activitiesResult.data ?? [];
    const meetings = meetingsResult.data ?? [];
    const funnel = buildOperationalFunnel({ deals, activities, meetings });
    const experimentId = salesPlaybookModule.SALES_PLAYBOOK.experiment.id;
    const variants = buildVariantReport({ deals, activities, meetings, experimentId });
    const forecastResult = calculateForecast({
      deals,
      meetings,
      period: {
        from: request.nextUrl.searchParams.get("from") ?? undefined,
        to: request.nextUrl.searchParams.get("to") ?? undefined,
      },
    });
    const dealId = Number(request.nextUrl.searchParams.get("dealId"));
    const dealForecast = Number.isInteger(dealId) && dealId > 0
      ? forecastResult.deals.find((item) => item.dealId === dealId) ?? null
      : null;
    const forecast = {
      rubricVersion: forecastResult.rubricVersion,
      probabilitySource: forecastResult.probabilitySource,
      period: forecastResult.period,
      pipeline: forecastResult.pipeline,
      predicted: forecastResult.predicted,
      realized: forecastResult.realized,
      attention: forecastResult.attention,
      counts: forecastResult.counts,
      relevantDeals: forecastResult.relevantDeals,
    };
    const losses = lossRecordsResult.error ? null : buildLossAnalysis({
      deals,
      records: lossRecords,
      period: {
        from: request.nextUrl.searchParams.get("from") ?? undefined,
        to: request.nextUrl.searchParams.get("to") ?? undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      experimentId,
      funnel,
      variants,
      forecast,
      losses,
      lossesStatus: lossRecordsResult.error ? "migration_pending" : "ready",
      dealForecast,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao calcular o funil." },
      { status: 500 },
    );
  }
}
