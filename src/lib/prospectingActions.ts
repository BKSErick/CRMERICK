import { classifyInboundResponse, type NextActionType, type ResponseType } from "./followup.ts";
import type { ChannelStatus, ProspectingChannel } from "./prospecting.ts";

export type ProspectingAction =
  | "open"
  | "confirm_sent"
  | "register_reply"
  | "classify"
  | "schedule"
  | "pause"
  | "opt_out";

type ActionInput = {
  action: ProspectingAction;
  dealId: number;
  channel: ProspectingChannel;
  now?: string;
  content?: string;
  previousOutboundCount?: number;
  responseType?: ResponseType;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  note?: string | null;
};

type ChannelUpdate = {
  status?: ChannelStatus;
  lastOpenedAt?: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  nextActionNote?: string | null;
  responseType?: ResponseType;
  responseTypeSource?: "automatic" | "manual";
  optedOutAt?: string;
};

type PlannedMessage = {
  channel: ProspectingChannel;
  content: string;
  status: "sent" | "replied";
  provider: "manual";
  direction: "sent" | "received";
  occurredAt: string;
  sentAt: string | null;
};

function validNow(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Data da acao invalida.");
  return date.toISOString();
}

function nextCadence(now: string, previousOutboundCount: number) {
  const steps = [
    { tier: "M1", days: 2 },
    { tier: "M2", days: 3 },
    { tier: "M3", days: 5 },
  ] as const;
  const step = steps[previousOutboundCount];
  if (!step) return null;
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + step.days);
  return { tier: step.tier, days: step.days, at: date.toISOString() };
}

export function planProspectingAction(input: ActionInput): {
  channelUpdate: ChannelUpdate;
  activity: { type: string; description: string } | null;
  message: PlannedMessage | null;
} {
  if (!Number.isInteger(input.dealId) || input.dealId <= 0) throw new Error("dealId invalido.");
  const now = validNow(input.now);
  const prefix = input.channel;

  if (input.action === "open") {
    return {
      channelUpdate: { status: "opened", lastOpenedAt: now },
      activity: { type: `${prefix}_opened`, description: "Perfil do Instagram aberto" },
      message: null,
    };
  }

  if (input.action === "confirm_sent") {
    const content = input.content?.trim();
    if (!content) throw new Error("Conteudo enviado e obrigatorio.");
    const cadence = nextCadence(now, Math.max(0, input.previousOutboundCount ?? 0));
    return {
      channelUpdate: {
        status: "contacted",
        lastOutboundAt: now,
        nextActionAt: cadence?.at ?? null,
        nextActionType: cadence ? "followup_silencio" : null,
        nextActionNote: cadence ? `Instagram ${cadence.tier} em D+${cadence.days}` : null,
      },
      activity: { type: `${prefix}_sent_manual`, description: `Instagram enviado: ${content}` },
      message: {
        channel: input.channel,
        content,
        status: "sent",
        provider: "manual",
        direction: "sent",
        occurredAt: now,
        sentAt: now,
      },
    };
  }

  if (input.action === "register_reply") {
    const content = input.content?.trim();
    if (!content) throw new Error("Conteudo da resposta e obrigatorio.");
    const responseType = classifyInboundResponse(content);
    return {
      channelUpdate: {
        status: "replied",
        lastInboundAt: now,
        responseType,
        responseTypeSource: "automatic",
        nextActionAt: null,
        nextActionType: responseType === "encaminhamento" ? "contactar_responsavel" : "responder",
        nextActionNote: "Resposta do Instagram registrada manualmente",
      },
      activity: { type: `${prefix}_received_manual`, description: `Instagram recebido: ${content}` },
      message: {
        channel: input.channel,
        content,
        status: "replied",
        provider: "manual",
        direction: "received",
        occurredAt: now,
        sentAt: null,
      },
    };
  }

  if (input.action === "classify") {
    if (!input.responseType) throw new Error("Classificacao e obrigatoria.");
    return {
      channelUpdate: { responseType: input.responseType, responseTypeSource: "manual" },
      activity: { type: `${prefix}_classified`, description: `Resposta classificada como ${input.responseType}` },
      message: null,
    };
  }

  if (input.action === "schedule") {
    if (!input.nextActionAt || Number.isNaN(new Date(input.nextActionAt).getTime())) {
      throw new Error("Data da proxima acao invalida.");
    }
    return {
      channelUpdate: {
        nextActionAt: new Date(input.nextActionAt).toISOString(),
        nextActionType: input.nextActionType ?? "followup_silencio",
        nextActionNote: input.note?.trim() || "Agendado manualmente",
      },
      activity: { type: `${prefix}_scheduled`, description: `Proxima acao agendada para ${input.nextActionAt}` },
      message: null,
    };
  }

  if (input.action === "pause") {
    return {
      channelUpdate: { status: "paused", nextActionAt: null, nextActionType: null, nextActionNote: input.note?.trim() || "Canal pausado" },
      activity: { type: `${prefix}_paused`, description: "Canal pausado manualmente" },
      message: null,
    };
  }

  return {
    channelUpdate: {
      status: "opted_out",
      optedOutAt: now,
      nextActionAt: null,
      nextActionType: null,
      nextActionNote: "Opt-out registrado manualmente",
    },
    activity: { type: `${prefix}_opted_out`, description: "Opt-out registrado manualmente" },
    message: null,
  };
}
