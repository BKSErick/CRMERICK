import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapDealFromRow } from "@/lib/crmRecords";
import { getCompanySignals, signalAliases, type CompanySignal } from "@/lib/sinais";

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

    if (!action || (action !== "compile-achados" && !dealId)) {
      return NextResponse.json(
        { ok: false, error: "Parâmetro 'action' é obrigatório ('dealId' também, exceto em compile-achados)." },
        { status: 400 }
      );
    }

    let systemPrompt = "";
    let userPrompt = "";
    let dealCompany: string | null = null;

    if (action === "compile-achados") {
      // Compila todos os achados da tabela insights numa memória + plano de melhoria.
      const { data: rows, error: achErr } = await supabase
        .from("insights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (achErr) throw achErr;

      const achados = (rows ?? []).filter((r) => r.type !== "compilado");
      if (achados.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Nenhum achado para compilar ainda. Registre achados primeiro." },
          { status: 400 }
        );
      }

      systemPrompt = `Você é o analista de aprendizado do CRM do Erick Sena (vendas B2B de landing pages e serviços digitais para indústria).
Sua tarefa: ler TODOS os achados registrados (aprendizados de copy, dores, objeções, conversões) e compilar uma memória estratégica.
Responda em português (PT-BR), em Markdown, com EXATAMENTE estas seções:
1. **Padrões encontrados**: temas que se repetem nos achados (dores, objeções, o que converte).
2. **O que está funcionando**: práticas confirmadas pelos achados (manter).
3. **Plano de melhoria**: 3 a 5 ações concretas e priorizadas para as próximas abordagens e copies (comece pela de maior impacto).
4. **Teste da semana**: 1 experimento simples e mensurável para validar a melhoria mais promissora.
Baseie TUDO nos achados fornecidos. NÃO invente dados, números ou casos que não estejam neles.`;

      userPrompt = `Achados registrados (${achados.length}, do mais recente ao mais antigo):\n\n` +
        achados
          .map((a) => {
            const empresa = a.company ? ` | empresa: ${a.company}` : "";
            const data = a.created_at ? ` | ${String(a.created_at).slice(0, 10)}` : "";
            return `[${a.type ?? "geral"}${empresa}${data}]\n${a.content}`;
          })
          .join("\n---\n");
    } else {

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
    dealCompany = deal.company;

    // Fio 3: usa o contact_id (FK real) quando existe; cai para o match por empresa
    // só no punhado de deals sem contato casado.
    const contactId = (dealRow as { contact_id?: number | null }).contact_id ?? null;
    const contactQuery = contactId
      ? supabase.from("contacts").select("*").eq("id", contactId)
      : supabase.from("contacts").select("*").eq("company", deal.company);
    const { data: contactRow } = await contactQuery.limit(1).maybeSingle();

    // Fio 2: a IA deixa de ser cega ao comportamento. Lê o sinal de interesse
    // (aberturas/cliques nas páginas) e as últimas atividades reais do deal, e
    // injeta isso no prompt para a resposta virar próxima ação, não descrição.
    let signalContext = "";
    try {
      const [signalIndex, activitiesRes] = await Promise.all([
        getCompanySignals(supabase).catch(() => new Map<string, CompanySignal>()),
        supabase
          .from("activities")
          .select("type, description, created_at")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      let signal: CompanySignal | null = null;
      for (const alias of [...signalAliases(deal.company), ...signalAliases(deal.name ?? "")]) {
        const hit = signalIndex.get(alias);
        if (hit) { signal = hit; break; }
      }

      const parts: string[] = [];
      if (signal) {
        const quando = signal.lastEvent ? new Date(signal.lastEvent).toLocaleString("pt-BR") : "recente";
        parts.push(
          `Sinal de interesse (páginas): ${signal.views} abertura(s), ${signal.linkClicks} clique(s) em link, ` +
            `${signal.waClicks} clique(s) no WhatsApp. ${signal.hot ? "QUENTE (ativo nas últimas 48h)." : "Sem atividade recente."} Último sinal: ${quando}.`,
        );
      } else {
        parts.push("Sinal de interesse (páginas): nenhuma abertura registrada ainda.");
      }
      const acts = activitiesRes.data ?? [];
      if (acts.length > 0) {
        parts.push(
          "Atividade recente:\n" +
            acts
              .map((a) => `- [${String(a.created_at ?? "").slice(0, 10)}] ${a.type ?? "nota"}: ${a.description ?? ""}`)
              .join("\n"),
        );
      }
      signalContext = "\n\n" + parts.join("\n");
    } catch {
      signalContext = "";
    }

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
- Pontuação/Score do lead (de 0 a 10): ${deal.points || 0}/10${signalContext}

Se o lead já abriu a página ou clicou no WhatsApp, use isso a favor (ex: "vi que você deu uma olhada..."), sem soar invasivo.
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
- Última atualização: ${deal.updated_at || "Recente"}${signalContext}

No "Próximo Passo Recomendado", leve em conta o sinal de interesse e a atividade recente acima (se o lead esquentou, priorize; se esfriou, sugira reativação).`;
    } else if (action === "generate-insight") {
      systemPrompt = `Você é o Webson, vendedor consultivo B2B do Erick Sena.
Sua tarefa: ler a ABORDAGEM enviada e as PRIMEIRAS MENSAGENS/DORES do lead e destilar insights ACIONÁVEIS de vendas.
Responda em português (PT-BR), em Markdown curto e direto, com estas seções:
1. **Dor real**: a dor central por trás do que o lead disse (1-2 linhas).
2. **Provável objeção**: a objeção mais provável a ser tratada.
3. **O que responder agora**: 1 sugestão concreta de próxima mensagem (curta, consultiva, sem parecer script).
4. **Aprendizado p/ copy**: 1 frase do que isso ensina para melhorar as abordagens futuras.
NÃO invente dados. Se faltar informação, diga o que perguntar ao lead.`;

      userPrompt = `Analise este lead:
- Empresa: ${deal.company}
- Abordagem enviada: ${deal.copyText || "Não registrada"}
- Dores anotadas: ${deal.pains || "Não informado"}
- Primeiras mensagens do lead: ${deal.leadMessages || "Nenhuma resposta registrada ainda"}${signalContext}`;
    } else if (action === "next-action") {
      // #3: próxima ação do copiloto. Usa sinal + atividade para dizer POR QUE agir
      // agora e O QUE fazer no próximo toque. Não persiste — é sugestão de tela.
      systemPrompt = `Você é o copiloto de vendas do Erick Sena (B2B, landing pages e serviços digitais para indústria).
Dado um lead, o sinal de interesse (aberturas/cliques nas páginas) e a atividade recente, responda em NO MÁXIMO 2 frases curtas:
1. Por que agir com esse lead agora (use o sinal se houver: "abriu 3x", "clicou no WhatsApp ontem").
2. O que fazer no próximo toque (ação concreta e canal).
Direto, sem enrolação, PT-BR, sem markdown. Se não houver sinal nenhum, diga que é abordagem fria e sugira o primeiro toque.`;
      userPrompt = `Lead: ${deal.company}
Estágio: ${deal.stage}
Score: ${deal.points || 0}/10
Gargalo: ${deal.segment || "não detalhado"}${signalContext}`;
    } else {
      return NextResponse.json(
        { ok: false, error: "Ação inválida. Use 'generate-copy', 'generate-summary', 'generate-insight', 'next-action' ou 'compile-achados'." },
        { status: 400 }
      );
    }
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

    if (action === "compile-achados") {
      const { data: compiledRow, error: compErr } = await supabase
        .from("insights")
        .insert({ deal_id: null, company: null, type: "compilado", content: aiContent })
        .select("*")
        .single();

      if (compErr) {
        return NextResponse.json(
          { ok: false, error: "Falha ao salvar o compilado.", detail: compErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        insight: compiledRow,
        summary: aiContent,
        providerUsed,
        modelUsed,
      });
    }

    if (action === "generate-insight") {
      const { data: insightRow, error: insErr } = await supabase
        .from("insights")
        .insert({ deal_id: dealId, company: dealCompany, type: "geral", content: aiContent })
        .select("*")
        .single();

      if (insErr) {
        return NextResponse.json(
          { ok: false, error: "Falha ao salvar o insight.", detail: insErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        insight: insightRow,
        summary: aiContent,
        providerUsed,
        modelUsed,
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
