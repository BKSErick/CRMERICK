import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapDealFromRow } from "@/lib/crmRecords";

export const runtime = "nodejs";

const PROVIDERS = [
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    getKey: () => process.env.OPENROUTER_API_KEY,
    models: [
      "google/gemini-2.5-flash:free",
      "meta-llama/llama-3-8b-instruct:free",
      "qwen/qwen-2-7b-instruct:free",
    ],
    getHeaders: (key: string) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://crmerick.vercel.app",
      "X-Title": "CRM Erick",
    }),
  },
  {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    getKey: () => process.env.GROQ_API_KEY,
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ],
    getHeaders: (key: string) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
  },
];

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const { action, dealId } = body;

    if (!action || !dealId) {
      return NextResponse.json(
        { ok: false, error: "Parâmetros 'action' e 'dealId' são obrigatórios." },
        { status: 400 }
      );
    }

    const { data: dealRow, error: fetchError } = await supabase
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .single();

    if (fetchError || !dealRow) {
      return NextResponse.json(
        { ok: false, error: "Deal não encontrado." },
        { status: 404 }
      );
    }

    const deal = mapDealFromRow(dealRow);

    const { data: contactRow } = await supabase
      .from("contacts")
      .select("*")
      .eq("company", deal.company)
      .limit(1)
      .maybeSingle();

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "generate-copy") {
      systemPrompt = `Você é o assistente virtual do Erick Sena, especialista em vendas B2B e captação de clientes.
Seu papel é criar uma mensagem de abordagem comercial pelo WhatsApp curta, direta, consultiva e extremamente persuasiva.
Ela DEVE ser escrita em português (PT-BR) e seguir o estilo de abordagem do "vendedor Webson":
- Amigável e consultiva, sem parecer um script robotizado ou panfletagem de agência.
- Mencione o site da empresa (se houver) e aponte sutilmente o gargalo de conversão identificado (ex: falta de carregamento rápido, site inseguro, perda de leads, etc.) com foco na perda de faturamento ou confiança comercial.
- Proponha uma conversa rápida (de 15 minutos) para mostrar o diagnóstico e a solução.
- Mantenha a mensagem curta (no máximo 3 ou 4 parágrafos curtos, pronta para ler no celular).
- NÃO invente informações que não foram fornecidas.
- Se o site do cliente não for fornecido, fale sobre a presença digital dele no geral.`;

      userPrompt = `Gere a mensagem de abordagem com os seguintes dados do lead:
- Empresa: ${deal.company}
- Nome do contato (opcional, use se fizer sentido): ${contactRow?.name || ""}
- Site do lead: ${deal.siteUrl || "Não informado"}
- Gargalo identificado: ${deal.segment || "Não detalhado"}
- Pontuação/Score do lead (de 0 a 10): ${deal.points || 0}/10

Retorne APENAS o texto da mensagem a ser enviada no WhatsApp. Não inclua observações, tags adicionais, introduções ou explicações.`;
    } else if (action === "generate-summary") {
      systemPrompt = `Você é um analista de negócios e assistente do CRM.
Seu papel é gerar um resumo curto, técnico e estruturado de um Deal comercial no pipeline.
Gere o resumo com três partes principais:
1. **Contexto**: Quem é a empresa, qual o seu setor (se dedutível do nome/gargalo) e sua presença digital.
2. **Estágio & Situação**: A situação atual do deal e sua pontuação de prioridade.
3. **Próximo Passo Recomendado**: Uma sugestão de ação prática imediata para o operador comercial.
Retorne o resumo formatado em Markdown limpo (usando negritos e listas). Mantenha tudo muito conciso e profissional em português (PT-BR).`;

      userPrompt = `Gere o resumo para o seguinte deal:
- Empresa: ${deal.company}
- Nome do contato: ${contactRow?.name || "Não cadastrado"}
- Estágio no Pipeline: ${deal.stage}
- Valor Estimado: R$ ${deal.value || 0}
- Gargalo Principal: ${deal.segment || "Não detalhado"}
- Prioridade (Pontuação): ${deal.points || 0}/10
- Última atualização: ${deal.updated_at || "Recente"}`;
    } else {
      return NextResponse.json(
        { ok: false, error: "Ação inválida. Use 'generate-copy' ou 'generate-summary'." },
        { status: 400 }
      );
    }

    let lastError = "";
    let aiContent = "";
    let providerUsed = "";
    let modelUsed = "";

    for (const provider of PROVIDERS) {
      const key = provider.getKey();
      if (!key) {
        lastError += `[${provider.name}]: API Key não configurada. `;
        continue;
      }

      for (const model of provider.models) {
        try {
          const response = await fetch(provider.url, {
            method: "POST",
            headers: provider.getHeaders(key),
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            }),
          });

          if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
            const errText = await response.text();
            lastError += `[${provider.name} - ${model}]: HTTP ${response.status} ${errText.slice(0, 100)}. `;
            continue;
          }

          if (!response.ok) {
            const errText = await response.text();
            lastError += `[${provider.name} - ${model}]: HTTP ${response.status} ${errText.slice(0, 100)}. `;
            continue;
          }

          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            aiContent = content.trim();
            providerUsed = provider.name;
            modelUsed = model;
            break;
          } else {
            lastError += `[${provider.name} - ${model}]: Resposta sem conteúdo. `;
          }
        } catch (e) {
          lastError += `[${provider.name} - ${model}]: ${e instanceof Error ? e.message : String(e)}. `;
        }
      }

      if (aiContent) break; // Sucesso com algum provedor, interrompe loop
    }

    if (!aiContent) {
      return NextResponse.json(
        { ok: false, error: "Todos os provedores e modelos de IA falharam.", detail: lastError },
        { status: 502 }
      );
    }

    if (action === "generate-copy") {
      const { data: updatedData, error: updateError } = await supabase
        .from("deals")
        .update({ copy_text: aiContent })
        .eq("id", dealId)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: "Falha ao salvar a mensagem no banco.", detail: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        copyText: aiContent,
        providerUsed,
        modelUsed,
        deal: mapDealFromRow(updatedData),
      });
    }

    return NextResponse.json({
      ok: true,
      summary: aiContent,
      providerUsed,
      modelUsed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro inesperado na rota de IA.",
      },
      { status: 500 }
    );
  }
}
