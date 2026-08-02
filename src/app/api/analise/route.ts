import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// Analise de conversas POR TIPO DE EMPRESA.
//
// Le o que os scripts de analise gravaram (segment_norm, is_prospect e as notas de
// classificacao) e agrega por segmento. A CLASSIFICACAO NAO ACONTECE AQUI: quem
// classifica e scripts/classify-conversations.mjs. Esta rota so agrega e serve.
//
// Doutrina do relatorio em docs/ANALISE-conversas.md.

export const runtime = "nodejs";

const AUTORESPONDER =
  /agradece|obrigado (por|pelo)|seja bem-vind|responderemos|assistente virtual|em breve|hor[aá]rio de atendimento/i;

// Amostra minima para uma celula ter direito de concluir algo. Abaixo disso a taxa
// sai marcada como indicativa e suavizada contra a media geral.
const AMOSTRA_MINIMA = 8;
const PESO_PRIOR = 12;

/** Media bayesiana: puxa celula pequena para a media geral. Espelha lib/analise-comum.mjs. */
function taxaSuavizada(acertos: number, total: number, mediaGeral: number) {
  return (acertos + PESO_PRIOR * mediaGeral) / (total + PESO_PRIOR);
}

type Amostra = {
  company: string;
  stage: string;
  awareness: number | null;
  sophistication: number | null;
  depth: number | null;
  clarity: string | null;
  demanded: string | null;
  blocker: string | null;
  evidence: string | null;
};

type Segmento = {
  segmento: string;
  leads: number;
  abordados: number;
  responderam: number;
  taxaResposta: number;
  taxaRespostaCrua: number;
  amostraBaixa: boolean;
  comFollowup: number;
  respondeuAoFollowup: number;
  taxaFollowup: number;
  resgatadosSoPeloFollowup: number;
  classificados: number;
  consciencia: number | null;
  sofisticacao: number | null;
  profundidade: number | null;
  clareza: Array<{ valor: string; n: number }>;
  demanda: Array<{ valor: string; n: number }>;
  travas: Array<{ valor: string; n: number }>;
  amostras: Amostra[];
};

function contar(valores: Array<string | null>) {
  const mapa = new Map<string, number>();
  for (const v of valores) if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
  return [...mapa.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n);
}

const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();

    const [dealsRes, msgsRes, actsRes] = await Promise.all([
      supabase
        .from("deals")
        .select(
          "id, company, name, stage, segment_norm, is_prospect, awareness_level, sophistication_level, offer_clarity, offer_demanded, conversation_depth, blocker, classification_evidence, classified_at",
        )
        .limit(5000),
      supabase
        .from("messages")
        .select("deal_id, direction, content, occurred_at, created_at")
        .not("deal_id", "is", null)
        .limit(5000),
      // Fonte SEPARADA de "foi abordado": disparo manual por wa.me nunca gerou
      // linha em `messages`, so activity. Usar so messages contaria menos da
      // metade dos abordados e dobraria toda taxa de resposta.
      supabase
        .from("activities")
        .select("deal_id, type")
        .in("type", ["whatsapp_sent", "whatsapp_sent_sync"])
        .limit(5000),
    ]);

    if (dealsRes.error) throw dealsRes.error;
    if (msgsRes.error) throw msgsRes.error;
    if (actsRes.error) throw actsRes.error;

    const disparos = new Map<number, number>();
    for (const a of actsRes.data ?? []) {
      disparos.set(a.deal_id as number, (disparos.get(a.deal_id as number) ?? 0) + 1);
    }

    const threads = new Map<number, Array<{ direction: string; content: string | null; at: string }>>();
    for (const m of msgsRes.data ?? []) {
      const id = m.deal_id as number;
      if (!threads.has(id)) threads.set(id, []);
      threads.get(id)!.push({
        direction: String(m.direction ?? ""),
        content: (m.content as string) ?? null,
        at: String(m.occurred_at ?? m.created_at ?? ""),
      });
    }

    type Info = { envios: number; respondeu: boolean; temFollowup: boolean; soPeloFollowup: boolean };
    const info = new Map<number, Info>();

    for (const [id, lista] of threads) {
      const ordenada = [...lista].sort((a, b) => (a.at > b.at ? 1 : -1));
      const envios = ordenada.filter((m) => m.direction === "sent");
      const respostas = ordenada.filter(
        (m) => m.direction === "received" && m.content && !AUTORESPONDER.test(m.content),
      );
      const t2 = envios[1]?.at ?? null;
      const total = Math.max(envios.length, disparos.get(id) ?? 0);
      info.set(id, {
        envios: total,
        respondeu: respostas.length > 0,
        temFollowup: total >= 2,
        // "Resgatado pelo follow-up" so conta se a resposta veio DEPOIS do 2o envio.
        // Sem isso o follow-up leva credito por resposta que ja tinha acontecido.
        soPeloFollowup:
          !!t2 && respostas.some((r) => r.at > t2) && !respostas.some((r) => r.at <= t2),
      });
    }
    // Lead abordado por wa.me manual nao tem linha em `messages` e sumiria do
    // denominador, inflando a taxa do segmento.
    for (const [id, n] of disparos) {
      if (!info.has(id)) {
        info.set(id, { envios: n, respondeu: false, temFollowup: n >= 2, soPeloFollowup: false });
      }
    }

    // is_prospect vem do banco (gravado por normalize-segments.mjs) em vez de ser
    // recalculado aqui: duas implementacoes da mesma regra divergem em silencio.
    const deals = (dealsRes.data ?? []).filter((d) => d.is_prospect !== false);

    const grupos = new Map<string, typeof deals>();
    for (const d of deals) {
      const k = (d.segment_norm as string) || "(sem classificacao)";
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(d);
    }

    const comEnvio = deals.filter((d) => (info.get(d.id as number)?.envios ?? 0) > 0);
    const mediaResposta = comEnvio.length
      ? comEnvio.filter((d) => info.get(d.id as number)?.respondeu).length / comEnvio.length
      : 0;
    const comFu = deals.filter((d) => info.get(d.id as number)?.temFollowup);
    const mediaFu = comFu.length
      ? comFu.filter((d) => info.get(d.id as number)?.soPeloFollowup).length / comFu.length
      : 0;

    const segmentos: Segmento[] = [...grupos.entries()]
      .map(([segmento, lista]) => {
        const abordados = lista.filter((d) => (info.get(d.id as number)?.envios ?? 0) > 0);
        const responderam = abordados.filter((d) => info.get(d.id as number)?.respondeu);
        const fu = lista.filter((d) => info.get(d.id as number)?.temFollowup);
        const fuOk = fu.filter((d) => info.get(d.id as number)?.soPeloFollowup);
        const cls = lista.filter((d) => d.classified_at);

        return {
          segmento,
          leads: lista.length,
          abordados: abordados.length,
          responderam: responderam.length,
          taxaResposta: abordados.length
            ? taxaSuavizada(responderam.length, abordados.length, mediaResposta)
            : 0,
          taxaRespostaCrua: abordados.length ? responderam.length / abordados.length : 0,
          amostraBaixa: abordados.length < AMOSTRA_MINIMA,
          comFollowup: fu.length,
          respondeuAoFollowup: fuOk.length,
          taxaFollowup: fu.length ? taxaSuavizada(fuOk.length, fu.length, mediaFu) : 0,
          resgatadosSoPeloFollowup: fuOk.length,
          classificados: cls.length,
          consciencia: media(cls.map((d) => d.awareness_level as number).filter(Boolean)),
          sofisticacao: media(cls.map((d) => d.sophistication_level as number).filter(Boolean)),
          profundidade: media(
            cls.map((d) => d.conversation_depth as number).filter((x) => x !== null && x !== undefined),
          ),
          clareza: contar(cls.map((d) => d.offer_clarity as string)),
          demanda: contar(
            cls.map((d) => d.offer_demanded as string).filter((x) => x && x !== "nenhuma"),
          ),
          travas: contar(cls.map((d) => d.blocker as string).filter((x) => x && x !== "nao_travou")),
          amostras: cls
            .sort((a, b) => ((b.conversation_depth as number) ?? 0) - ((a.conversation_depth as number) ?? 0))
            .slice(0, 6)
            .map((d) => ({
              company: (d.company as string) || (d.name as string) || "(sem nome)",
              stage: (d.stage as string) ?? "",
              awareness: (d.awareness_level as number) ?? null,
              sophistication: (d.sophistication_level as number) ?? null,
              depth: (d.conversation_depth as number) ?? null,
              clarity: (d.offer_clarity as string) ?? null,
              demanded: (d.offer_demanded as string) ?? null,
              blocker: (d.blocker as string) ?? null,
              evidence: (d.classification_evidence as string) ?? null,
            })),
        };
      })
      .sort((a, b) => b.abordados - a.abordados);

    // Pendencias: quem RESPONDEU e ainda nao foi classificado e trabalho real.
    // Quem nunca respondeu nao tem o que classificar e nao pode entrar no mesmo balde.
    const pendentes = deals
      .filter(
        (d) =>
          (info.get(d.id as number)?.envios ?? 0) > 0 &&
          info.get(d.id as number)?.respondeu &&
          !d.classified_at,
      )
      .map((d) => (d.company as string) || (d.name as string));

    const totals = {
      leads: deals.length,
      abordados: comEnvio.length,
      responderam: comEnvio.filter((d) => info.get(d.id as number)?.respondeu).length,
      taxaResposta: mediaResposta,
      comFollowup: comFu.length,
      resgatadosPeloFollowup: comFu.filter((d) => info.get(d.id as number)?.soPeloFollowup).length,
      classificados: deals.filter((d) => d.classified_at).length,
      naoProspect: (dealsRes.data ?? []).filter((d) => d.is_prospect === false).length,
      amostraMinima: AMOSTRA_MINIMA,
    };

    return NextResponse.json({ ok: true, totals, segmentos, pendentes });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao agregar analise" },
      { status: 500 },
    );
  }
}