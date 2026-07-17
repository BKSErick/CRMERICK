import { NextResponse } from "next/server";

const API_VERSION = "v21.0";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type InsightRow = { name: string; total_value?: { value?: number }; values?: { value?: number }[] };
function sumInsights(data: InsightRow[] | undefined) {
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    out[row.name] = row.total_value?.value ?? (row.values ?? []).reduce((a, v) => a + (v.value ?? 0), 0);
  }
  return out;
}

// follower_demographics vem com total_value.breakdowns[].results[] ({dimension_values, value}).
type DemoJson = {
  data?: { total_value?: { breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[] } }[];
  error?: { message?: string };
};
function parseBreakdown(json: DemoJson): { label: string; value: number }[] {
  const results = json?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return results
    .map((r) => ({ label: (r.dimension_values ?? []).join(" "), value: Number(r.value ?? 0) }))
    .filter((r) => r.label && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export async function GET(request: Request) {
  const overrideToken = request.headers.get("x-crm-ig-access-token")?.trim();
  const overrideAccountId = request.headers.get("x-crm-ig-business-account-id")?.trim();
  const accessToken = overrideToken || process.env.IG_ACCESS_TOKEN;
  const accountId = overrideAccountId || process.env.IG_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    return jsonError("Instagram server credentials are not configured.", 503);
  }

  const base = `https://graph.facebook.com/${API_VERSION}`;
  const now = Math.floor(Date.now() / 1000);
  const since = now - 30 * 86400;

  const accountUrl = new URL(`${base}/${accountId}`);
  accountUrl.searchParams.set("fields", "username,name,biography,followers_count,media_count,profile_picture_url");
  accountUrl.searchParams.set("access_token", accessToken);

  const mediaUrl = new URL(`${base}/${accountId}/media`);
  mediaUrl.searchParams.set("fields", "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count");
  mediaUrl.searchParams.set("limit", "12");
  mediaUrl.searchParams.set("access_token", accessToken);

  // insights de conta (30d) — metricas REAIS validadas na Graph API v21
  const insightsA = new URL(`${base}/${accountId}/insights`);
  insightsA.searchParams.set("metric", "reach,views,profile_views,accounts_engaged");
  insightsA.searchParams.set("period", "day");
  insightsA.searchParams.set("metric_type", "total_value");
  insightsA.searchParams.set("since", String(since));
  insightsA.searchParams.set("until", String(now));
  insightsA.searchParams.set("access_token", accessToken);

  const insightsB = new URL(`${base}/${accountId}/insights`);
  insightsB.searchParams.set("metric", "total_interactions,likes,comments,saves,shares");
  insightsB.searchParams.set("period", "day");
  insightsB.searchParams.set("metric_type", "total_value");
  insightsB.searchParams.set("since", String(since));
  insightsB.searchParams.set("until", String(now));
  insightsB.searchParams.set("access_token", accessToken);

  // Demografia dos seguidores (lifetime): pais, cidade, faixa etaria, genero.
  // Exige conta com 100+ seguidores; se a API negar, o campo volta vazio (sem inventar).
  const demoUrl = (breakdown: string) => {
    const u = new URL(`${base}/${accountId}/insights`);
    u.searchParams.set("metric", "follower_demographics");
    u.searchParams.set("period", "lifetime");
    u.searchParams.set("metric_type", "total_value");
    u.searchParams.set("breakdown", breakdown);
    u.searchParams.set("access_token", accessToken);
    return u;
  };

  try {
    const [accountRes, mediaRes, insARes, insBRes, demoCountryRes, demoCityRes, demoAgeRes, demoGenderRes] = await Promise.all([
      fetch(accountUrl), fetch(mediaUrl), fetch(insightsA), fetch(insightsB),
      fetch(demoUrl("country")), fetch(demoUrl("city")), fetch(demoUrl("age")), fetch(demoUrl("gender")),
    ]);
    const [account, media, insA, insB, demoCountry, demoCity, demoAge, demoGender] = await Promise.all([
      accountRes.json(), mediaRes.json(), insARes.json(), insBRes.json(),
      demoCountryRes.json(), demoCityRes.json(), demoAgeRes.json(), demoGenderRes.json(),
    ]);

    if (!accountRes.ok || account.error) {
      return jsonError(account.error?.message ?? "Instagram account request failed.", accountRes.status);
    }

    const acct = { ...sumInsights(insA.data), ...sumInsights(insB.data) };

    // enriquece cada midia com insights REAIS por post (reach, saved, shares, interactions)
    const rawMedia = (media.data ?? []).slice(0, 12);
    const enriched = await Promise.all(
      rawMedia.map(async (m: Record<string, unknown>) => {
        try {
          const piUrl = new URL(`${base}/${m.id}/insights`);
          piUrl.searchParams.set("metric", "reach,saved,shares,total_interactions");
          piUrl.searchParams.set("access_token", accessToken);
          const pi = await (await fetch(piUrl)).json();
          const v = sumInsights(pi.data);
          return { ...m, reach: v.reach ?? 0, saved: v.saved ?? 0, shares: v.shares ?? 0, total_interactions: v.total_interactions ?? 0 };
        } catch {
          return { ...m, reach: 0, saved: 0, shares: 0, total_interactions: 0 };
        }
      }),
    );

    return NextResponse.json({
      ok: true,
      credentialSource: overrideToken || overrideAccountId ? "local-override" : "server-env",
      profile: {
        username: account.username,
        name: account.name,
        biography: account.biography,
        followers: account.followers_count,
        mediaCount: account.media_count,
        profilePictureUrl: account.profile_picture_url,
      },
      metrics: {
        reach30: acct.reach ?? 0,
        views30: acct.views ?? 0,
        profileViews30: acct.profile_views ?? 0,
        accountsEngaged30: acct.accounts_engaged ?? 0,
        interactions30: acct.total_interactions ?? 0,
        likes30: acct.likes ?? 0,
        comments30: acct.comments ?? 0,
        saves30: acct.saves ?? 0,
        shares30: acct.shares ?? 0,
      },
      media: enriched,
      demographics: {
        country: parseBreakdown(demoCountry as DemoJson),
        city: parseBreakdown(demoCity as DemoJson),
        age: parseBreakdown(demoAge as DemoJson),
        gender: parseBreakdown(demoGender as DemoJson),
        note: (demoCountry as DemoJson)?.error?.message ?? null,
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected Instagram API error.");
  }
}
