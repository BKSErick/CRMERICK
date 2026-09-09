import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import {
  buildEmailFunnel,
  parseRecipientFromDescription,
  type BrevoEvent,
  type EmailSendRecord,
} from "@/lib/emailFunnel";

// Funil de e-mail frio da aba Funis.
//
// Webhook de evento transacional exigiria plano pago no Brevo, entao o dado vem por
// POLLING: a cada request lemos os eventos da janela e cruzamos com os envios.
//
// Quem sao os envios: `activities` do tipo `email_sent`, gravadas pelo brevo_send.mjs.
// NAO usamos o sent_log.json porque ele e um arquivo local do script e nao existe no
// deploy. O e-mail do destinatario sai do `description` — os 9 primeiros disparos
// (08/09/2026) nasceram sem `metadata.message_id`, entao casar por messageId perderia
// o primeiro lote inteiro.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BREVO_EVENTS_URL = "https://api.brevo.com/v3/smtp/statistics/events";
const PAGE = 100;

type ActivityRow = {
  deal_id: number | null;
  description: string | null;
  created_at: string;
};

async function fetchBrevoEvents(apiKey: string, startDate: string, endDate: string): Promise<BrevoEvent[]> {
  const headers = { "api-key": apiKey, accept: "application/json" };
  const all: BrevoEvent[] = [];

  for (let offset = 0; offset < 5000; offset += PAGE) {
    const url = `${BREVO_EVENTS_URL}?limit=${PAGE}&offset=${offset}&startDate=${startDate}&endDate=${endDate}&sort=asc`;
    const response = await fetch(url, { headers, cache: "no-store" });
    const text = await response.text();

    if (!response.ok) {
      // 401 aqui costuma ser o recurso Authorized-IPs ligado na conta, nao chave
      // errada: o servidor da Vercel tem IP diferente da maquina que cadastrou.
      throw new Error(`Brevo ${response.status}: ${text.slice(0, 160)}`);
    }

    const batch = (JSON.parse(text).events ?? []) as BrevoEvent[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }

  return all;
}

export async function GET(request: Request) {
  const apiKey = process.env.BREVO_API_KEY;
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30), 1), 90);

  try {
    const supabase = getCrmSupabaseAdmin();

    const since = new Date(Date.now() - days * 864e5).toISOString();
    const { data: activities, error: activitiesError } = await supabase
      .from("activities")
      .select("deal_id, description, created_at")
      .eq("type", "email_sent")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (activitiesError) throw new Error(activitiesError.message);

    const rows = (activities ?? []) as ActivityRow[];
    const sends: EmailSendRecord[] = [];
    for (const row of rows) {
      const email = parseRecipientFromDescription(row.description ?? "");
      if (!email) continue;
      sends.push({ email, company: "", dealId: row.deal_id, sentAt: row.created_at });
    }

    if (sends.length === 0) {
      return NextResponse.json({
        ok: true,
        configured: Boolean(apiKey),
        message: "Nenhum e-mail disparado na janela.",
        report: buildEmailFunnel([], [], []),
      });
    }

    // Nome da empresa so para a tabela ficar legivel.
    const dealIds = [...new Set(sends.map((s) => s.dealId).filter((id): id is number => typeof id === "number"))];
    if (dealIds.length) {
      const { data: deals } = await supabase.from("deals").select("id, company").in("id", dealIds);
      const byId = new Map((deals ?? []).map((d) => [d.id as number, String(d.company ?? "")]));
      for (const send of sends) {
        if (send.dealId != null) send.company = byId.get(send.dealId) ?? "";
      }
    }

    // Resposta de lead: o Brevo nao reporta isso (resposta nao passa pelo relay de
    // envio), entao vem da caixa de entrada ja integrada (Brevo Conversations +
    // Gmail Apps Script), casando o remetente com quem recebeu o disparo.
    const recipients = sends.map((s) => s.email);
    const { data: replies } = await supabase
      .from("messages")
      .select("from_email")
      .eq("direction", "received")
      .in("from_email", recipients);
    const repliedEmails = (replies ?? [])
      .map((m) => String((m as { from_email: string | null }).from_email ?? "").toLowerCase())
      .filter(Boolean);

    if (!apiKey) {
      // Sem a chave ainda da para mostrar envios e respostas; entrega e abertura ficam
      // zeradas e a aba avisa, em vez de fingir que o funil parou no envio.
      return NextResponse.json({
        ok: true,
        configured: false,
        message: "BREVO_API_KEY ausente no servidor: entrega e abertura indisponiveis.",
        report: buildEmailFunnel(sends, [], repliedEmails),
      });
    }

    const startDate = sends[0].sentAt.slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10); // a API recusa data futura
    const events = await fetchBrevoEvents(apiKey, startDate, endDate);

    return NextResponse.json({
      ok: true,
      configured: true,
      message: `Eventos Brevo de ${startDate} a ${endDate}.`,
      window: { startDate, endDate, days },
      report: buildEmailFunnel(sends, events, repliedEmails),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: Boolean(apiKey),
        error: error instanceof Error ? error.message : "Falha ao ler eventos de e-mail.",
      },
      { status: 500 },
    );
  }
}
