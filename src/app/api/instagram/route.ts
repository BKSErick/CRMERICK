import { NextResponse } from "next/server";

const API_VERSION = "v21.0";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: Request) {
  const overrideToken = request.headers.get("x-crm-ig-access-token")?.trim();
  const overrideAccountId = request.headers.get("x-crm-ig-business-account-id")?.trim();
  const accessToken = overrideToken || process.env.IG_ACCESS_TOKEN;
  const accountId = overrideAccountId || process.env.IG_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    return jsonError("Instagram server credentials are not configured.", 503);
  }

  const baseUrl = `https://graph.facebook.com/${API_VERSION}`;
  const accountUrl = new URL(`${baseUrl}/${accountId}`);
  accountUrl.searchParams.set(
    "fields",
    "username,name,biography,followers_count,media_count,profile_picture_url",
  );
  accountUrl.searchParams.set("access_token", accessToken);

  const mediaUrl = new URL(`${baseUrl}/${accountId}/media`);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
  );
  mediaUrl.searchParams.set("limit", "12");
  mediaUrl.searchParams.set("access_token", accessToken);

  const now = Math.floor(Date.now() / 1000);
  const since = now - 30 * 86400;
  const reachUrl = new URL(`${baseUrl}/${accountId}/insights`);
  reachUrl.searchParams.set("metric", "reach");
  reachUrl.searchParams.set("period", "day");
  reachUrl.searchParams.set("metric_type", "total_value");
  reachUrl.searchParams.set("since", String(since));
  reachUrl.searchParams.set("until", String(now));
  reachUrl.searchParams.set("access_token", accessToken);

  try {
    const [accountResponse, mediaResponse, reachResponse] = await Promise.all([
      fetch(accountUrl),
      fetch(mediaUrl),
      fetch(reachUrl),
    ]);
    const [account, media, reach] = await Promise.all([
      accountResponse.json(),
      mediaResponse.json(),
      reachResponse.json(),
    ]);

    if (!accountResponse.ok || account.error) {
      return jsonError(account.error?.message ?? "Instagram account request failed.", accountResponse.status);
    }

    if (!mediaResponse.ok || media.error) {
      return jsonError(media.error?.message ?? "Instagram media request failed.", mediaResponse.status);
    }

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
        reach30: reachResponse.ok ? (reach.data?.[0]?.total_value?.value ?? 0) : 0,
      },
      media: media.data ?? [],
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected Instagram API error.");
  }
}
