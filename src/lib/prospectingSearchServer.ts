import { getCrmSupabaseAdmin } from "./crmSupabase";
import { buildSearchQueries, normalizeInstagramIdentity, type ProspectingVertical } from "./prospecting";
import { safePublicHttpUrl } from "./prospectingApi";
import {
  classifyCandidateAgainstCrm,
  rankInstagramEvidence,
  type ExistingProspectingReference,
} from "./prospectingSearch";
import { serper } from "./serper";

type Place = {
  title?: string;
  address?: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  cid?: string;
  latitude?: number;
  longitude?: number;
};

type OrganicResult = { title?: string; link?: string; snippet?: string };

function fold(value?: string | null) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractInstagramFromHtml(html: string) {
  const matches = html.match(/https?:\/\/(?:www\.)?instagram\.com\/[a-z0-9._-]+\/?/gi) ?? [];
  return matches.find((url) => normalizeInstagramIdentity(url)) ?? null;
}

async function instagramFromOfficialWebsite(value?: string | null) {
  const url = safePublicHttpUrl(value);
  if (!url || /instagram\.com/i.test(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "CRM-Erick-Lead-Research/1.0" },
    });
    if (!response.ok) return null;
    return extractInstagramFromHtml((await response.text()).slice(0, 1_000_000));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function profileForPlace(place: Place, organic: readonly OrganicResult[]) {
  const websiteProfile = normalizeInstagramIdentity(place.website) ? place.website ?? null : null;
  if (websiteProfile) return { url: websiteProfile, source: "maps_profile", title: place.title ?? "" };
  const company = fold(place.title);
  const tokens = company.split(" ").filter((token) => token.length >= 4);
  const match = organic.find((item) => {
    if (!normalizeInstagramIdentity(item.link)) return false;
    const haystack = fold(`${item.title ?? ""} ${item.snippet ?? ""}`);
    return tokens.some((token) => haystack.includes(token));
  });
  return match?.link ? { url: match.link, source: "serper_search", title: match.title ?? "" } : null;
}

async function existingReferences(): Promise<ExistingProspectingReference[]> {
  const supabase = getCrmSupabaseAdmin();
  const [contactsResult, dealsResult, channelsResult] = await Promise.all([
    supabase.from("contacts").select("id,name,company,phone,maps_cid,site_url,status").limit(5000),
    supabase.from("deals").select("id,name,company,phone,site_url").limit(5000),
    supabase.from("prospecting_channels").select("deal_id,identity,channel").eq("channel", "instagram").limit(5000),
  ]);
  if (contactsResult.error) throw contactsResult.error;
  if (dealsResult.error) throw dealsResult.error;
  if (channelsResult.error) throw channelsResult.error;

  const contacts = new Map((contactsResult.data ?? []).map((row) => [Number(row.id), row]));
  const identities = new Map((channelsResult.data ?? []).map((row) => [Number(row.deal_id), row.identity]));
  return (dealsResult.data ?? []).map((deal) => {
    const contact = contacts.get(Number(deal.id));
    return {
      dealId: Number(deal.id),
      name: deal.company || deal.name || contact?.company || contact?.name,
      mapsCid: contact?.maps_cid,
      phone: deal.phone || contact?.phone,
      website: deal.site_url || contact?.site_url,
      instagramUsername: identities.get(Number(deal.id)),
    };
  });
}

export async function searchInstagramProspects(input: { city: string; uf: string; vertical: ProspectingVertical }, suppressionList: readonly string[]) {
  const queries = buildSearchQueries(input.vertical, input.city, input.uf);
  const [mapsResponses, searchResponses, existing] = await Promise.all([
    Promise.all(queries.maps.map((q) => serper.maps({ q, num: 20 }))),
    Promise.all(queries.profiles.map((q) => serper.search({ q, num: 10 }))),
    existingReferences(),
  ]);
  const organic = searchResponses.flatMap((payload) => (payload.organic as OrganicResult[] | undefined) ?? []);
  const unique = new Map<string, Place>();
  for (const payload of mapsResponses) {
    for (const place of ((payload.places ?? payload.maps ?? []) as Place[])) {
      if (!place.title) continue;
      const key = place.cid || `${fold(place.title)}|${(place.phoneNumber ?? "").replace(/\D/g, "")}`;
      if (!unique.has(key)) unique.set(key, place);
    }
  }

  const places = [...unique.values()].slice(0, 40);
  const officialProfiles = new Map<string, string>();
  for (let index = 0; index < Math.min(places.length, 20); index += 5) {
    await Promise.all(places.slice(index, index + 5).map(async (place) => {
      const url = await instagramFromOfficialWebsite(place.website);
      if (url) officialProfiles.set(place.cid || fold(place.title), url);
    }));
  }

  let withoutInstagram = 0;
  const candidates = [];
  for (const place of places) {
    const officialUrl = officialProfiles.get(place.cid || fold(place.title));
    const suggested = officialUrl
      ? { url: officialUrl, source: "official_website", title: place.title ?? "" }
      : profileForPlace(place, organic);
    if (!suggested?.url) {
      withoutInstagram += 1;
      continue;
    }
    const evidence = rankInstagramEvidence({
      companyName: place.title ?? "",
      profileTitle: suggested.title,
      profileUrl: suggested.url,
      foundOnOfficialWebsite: suggested.source === "official_website",
    });
    const raw = {
      name: place.title ?? "",
      city: input.city,
      uf: input.uf,
      address: place.address ?? null,
      mapsCid: place.cid ?? null,
      phone: place.phoneNumber ?? null,
      website: safePublicHttpUrl(place.website),
      rating: place.rating ?? null,
      reviewsCount: place.ratingCount ?? 0,
      instagramUrl: suggested.url,
      instagramUsername: normalizeInstagramIdentity(suggested.url),
      matchSource: suggested.source,
      matchConfidence: evidence.confidence,
      requiresReview: evidence.requiresReview,
      evidence: { reasons: evidence.reasons, activityConfirmed: false },
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
    };
    candidates.push({ ...raw, crm: classifyCandidateAgainstCrm(raw, existing, suppressionList) });
  }

  return { candidates, stats: { found: places.length, withInstagram: candidates.length, withoutInstagram } };
}
