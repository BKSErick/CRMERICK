import { NextResponse } from "next/server";
import { aiComplete } from "@/lib/aiComplete";

// Reescreve um post do backlog amarrando ele a um assunto em alta que o Erick digita.
// A API do Threads nao entrega trending (exige App Review), entao o assunto vem na mao.
const VOZ = `Voce reescreve posts de Threads para Erick Sena (@euericksena), que se posiciona
como Criador-Hacker e AI Architect: constroi sistemas de IA e automacao e vende sites e
paginas de conversao para industria e PME.

Regras da voz, todas obrigatorias:
- Portugues do Brasil, primeira pessoa, tom de quem opera e nao de quem ensina.
- NUNCA use travessao (—). Use ponto ou virgula. Isso e inegociavel.
- Sem hype, sem emoji em excesso, sem hashtag, sem "descubra o segredo", sem promessa milagrosa.
- Frases curtas. Comece por um numero especifico ou por um fato concreto quando existir.
- Faca uma afirmacao com a qual da pra discordar. E isso que puxa resposta no Threads.
- Nao termine com pergunta generica tipo "e voce, concorda?".
- Maximo de 480 caracteres no total, contando espacos.
- Devolva SOMENTE o texto do post, sem aspas, sem titulo, sem explicacao.`;

export async function POST(request: Request) {
  let corpo: { text?: string; topic?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo invalido." }, { status: 400 });
  }

  const original = (corpo.text ?? "").trim();
  const assunto = (corpo.topic ?? "").trim();
  if (!original) {
    return NextResponse.json({ ok: false, error: "Texto original vazio." }, { status: 400 });
  }
  if (!assunto) {
    return NextResponse.json(
      { ok: false, error: "Digite o assunto em alta para amarrar o post." },
      { status: 400 },
    );
  }

  const pedido = `Assunto que esta em alta no Threads agora: "${assunto}".

Post original do Erick:
"""${original}"""

Reescreva o post amarrando a ideia dele ao assunto em alta. Mantenha o argumento e os
numeros do original (nao invente numero nenhum). O assunto em alta deve aparecer pelo
vocabulario natural de quem fala dele, nao como palavra-chave repetida nem como hashtag.`;

  const resultado = await aiComplete(VOZ, pedido);
  if (!resultado) {
    return NextResponse.json(
      { ok: false, error: "Nenhum provedor de IA respondeu. Verifique GROQ_API_KEY." },
      { status: 502 },
    );
  }

  // Modelo as vezes devolve entre aspas mesmo com instrucao; limpa antes de entregar.
  const texto = resultado.content.replace(/^["“']|["”']$/g, "").trim();
  return NextResponse.json({
    ok: true,
    text: texto,
    tamanho: texto.length,
    provider: resultado.provider,
    model: resultado.model,
  });
}