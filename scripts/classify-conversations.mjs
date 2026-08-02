/**
 * classify-conversations.mjs
 * Le a thread de WhatsApp de cada lead e classifica a conversa nas dimensoes que
 * o relatorio por tipo de empresa precisa.
 *
 * DIMENSOES (rubrica completa em docs/ANALISE-conversas.md):
 *   awareness_level       1-5  consciencia (Schwartz)
 *   sophistication_level  1-5  sofisticacao de mercado (Schwartz)
 *   offer_clarity              a oferta ficou clara PRA ELE
 *   conversation_depth    0-5  ate onde a conversa chegou
 *   offer_demanded             o que ele efetivamente pediu
 *   blocker                    por que travou
 *
 * A IA classifica e o Erick audita depois (classified_by='ia' ate ele confirmar).
 * Toda classificacao carrega `classification_evidence`: uma frase do PROPRIO lead
 * que sustenta a nota. Sem evidencia citavel, a classificacao e rejeitada — e o
 * unico freio barato contra o modelo inventar nivel de consciencia.
 *
 * USO:
 *   node scripts/classify-conversations.mjs             # dry-run, mostra o resultado
 *   node scripts/classify-conversations.mjs --go        # grava nos deals
 *   node scripts/classify-conversations.mjs --limite=5  # so os N primeiros
 *   node scripts/classify-conversations.mjs --refazer   # reclassifica quem ja tem nota
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarEnv, clienteSupabase, ehProspect } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : d;
};
const GO = process.argv.includes("--go");
const REFAZER = process.argv.includes("--refazer");
const LIMITE = Number(arg("limite", 0));

const GROQ_KEY = process.env.GROQ_API_KEY;
const MODELOS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const db = clienteSupabase();

// Autoresponder nao e conversa. Mesma regra do lead-winning-profile, senao um
// "obrigado pelo contato, responderemos em breve" vira lead consciente do produto.
const AUTORESPONDER =
  /agradece|obrigado (por|pelo)|seja bem-vind|responderemos|assistente virtual|em breve|hor[aá]rio de atendimento/i;

const VALORES = {
  offer_clarity: ["clara", "parcial", "confusa", "nao_avaliavel"],
  offer_demanded: [
    "pagina_nova", "redesign", "seo_geo", "formulario_orcamento",
    "integracao_whatsapp", "preco_apenas", "outro", "nenhuma",
  ],
  blocker: [
    "sem_resposta", "gatekeeper_bot", "preco", "sem_urgencia", "ja_tem_fornecedor",
    "decisor_ausente", "canal_errado", "audio_nao_transcrito", "nao_travou", "outro",
  ],
};

const RUBRICA = `Voce classifica conversas de prospeccao fria no WhatsApp.
CONTEXTO: Erick vende landing pages e paginas de conversao para pequenas e medias
industrias brasileiras (usinagem, caldeiraria, manutencao industrial, automacao,
climatizacao). Ele aborda pelo WhatsApp e manda um exemplo de cliente real.

Classifique a conversa abaixo. Responda SOMENTE JSON valido, sem markdown.

awareness_level (consciencia do LEAD, escala de Eugene Schwartz):
1 = inconsciente: nao acha que tem problema nenhum de captacao de cliente
2 = consciente do problema: reclama que chega pouca cotacao, mas nao liga isso a presenca digital
3 = consciente da solucao: sabe que precisa de site/pagina melhor, nao sabe de quem
4 = consciente do produto: conhece landing page/agencia, esta comparando fornecedor
5 = totalmente consciente: quer preco, prazo, proposta. So falta a condicao

sophistication_level (quanta promessa esse mercado JA ouviu, Schwartz):
1 = virgem: nunca foi abordado com isso, promessa simples ainda funciona
2 = ja ouviu alguma vez, ainda reage a promessa ampliada
3 = ja ouviu muita promessa, so reage a mecanismo especifico
4 = ceticismo alto, mecanismo tambem ja foi copiado, exige prova concreta
5 = saturado: "toda semana me oferecem site", so reage a identificacao e prova real
Se o lead cita que ja recebe muitas abordagens iguais, e 4 ou 5.

offer_clarity (a oferta ficou clara PRA ELE, julgado pela reacao dele, nao pela copy):
clara = demonstrou entender o que e ("quanto custa a pagina?", "manda o exemplo")
parcial = entendeu que e sobre site/marketing mas nao o que exatamente e entregue
confusa = perguntou "o que voce faz?", "voces vendem o que?", ou confundiu com outra coisa
nao_avaliavel = nao respondeu o suficiente pra dar pra julgar

conversation_depth (ate onde chegou):
0 = sem resposta nenhuma
1 = resposta reflexa ou bot/gatekeeper
2 = respondeu como gente, mas nao engajou no assunto
3 = engajou: aceitou ver o exemplo, ou perguntou sobre o servico
4 = discutiu o proprio negocio, abriu o link, pediu detalhe
5 = falou de preco, prazo, reuniao ou proposta

offer_demanded: o que ELE pediu. Um de: ${VALORES.offer_demanded.join(", ")}
blocker: por que travou. Um de: ${VALORES.blocker.join(", ")}

classification_evidence: UMA frase curta, copiada literalmente do que o LEAD
escreveu, que sustenta a classificacao. Se o lead nao escreveu nada aproveitavel,
devolva string vazia.

Formato exato:
{"awareness_level":3,"sophistication_level":4,"offer_clarity":"clara","conversation_depth":3,"offer_demanded":"pagina_nova","blocker":"preco","classification_evidence":"frase do lead"}`;

async function chamarGroq(thread) {
  let ultimoErro;
  for (const model of MODELOS) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.1, // classificacao quer consistencia, nao criatividade
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: RUBRICA },
            { role: "user", content: thread },
          ],
        }),
      });
      if (!r.ok) {
        ultimoErro = new Error(`${model}: ${r.status} ${(await r.text()).slice(0, 200)}`);
        continue;
      }
      const j = await r.json();
      return { dados: JSON.parse(j.choices[0].message.content), model };
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro || new Error("nenhum modelo respondeu");
}

const normalizar = (s) =>
  String(s || "").toLowerCase().replace(/[^\wàáâãéêíóôõúç ]/gi, " ").replace(/\s+/g, " ").trim();

/**
 * A evidencia tem que sair da boca do LEAD.
 *
 * Motivo concreto: na primeira rodada o modelo classificou a Eletrica GB citando
 * "Faz sentido pro momento de voces?" — que e frase do ERICK. Quando o modelo
 * troca quem falou o que, ele nao errou so a citacao: ele leu a conversa invertida,
 * e consciencia/sofisticacao derivadas dali nao valem nada. Por isso isso invalida
 * a classificacao inteira em vez de so limpar o campo.
 *
 * Comparacao por trecho normalizado porque o modelo quase sempre reescreve
 * pontuacao e acentuacao ao citar.
 */
function evidenciaVemDoLead(evidencia, msgsDoLead) {
  const e = normalizar(evidencia);
  if (!e) return true; // sem citacao e admissivel (lead so mandou audio, por ex.)
  if (e.length < 12) return true; // trecho curto demais pra casar com seguranca
  const corpus = msgsDoLead.map(normalizar).join(" | ");
  if (corpus.includes(e)) return true;
  // tolera reescrita: exige que uma janela longa da citacao apareca no corpus
  for (let i = 0; i + 25 <= e.length; i += 5) {
    if (corpus.includes(e.slice(i, i + 25))) return true;
  }
  return false;
}

/** Rejeita o que o modelo devolveu fora da rubrica em vez de gravar lixo. */
function validar(d) {
  const erros = [];
  const faixa = (campo, min, max) => {
    const v = Number(d[campo]);
    if (!Number.isInteger(v) || v < min || v > max) erros.push(`${campo}=${d[campo]}`);
  };
  faixa("awareness_level", 1, 5);
  faixa("sophistication_level", 1, 5);
  faixa("conversation_depth", 0, 5);
  for (const campo of ["offer_clarity", "offer_demanded", "blocker"]) {
    if (!VALORES[campo].includes(d[campo])) erros.push(`${campo}=${d[campo]}`);
  }
  return erros;
}

(async () => {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY ausente no .env");

  const [deals, msgs] = await Promise.all([
    db.get("deals?select=id,company,name,segment_norm,stage,copy_text,classified_at"),
    db.get("messages?deal_id=not.is.null&select=deal_id,direction,content,message_type,occurred_at,created_at&order=occurred_at.asc"),
  ]);

  const porDeal = new Map();
  for (const m of msgs) {
    if (!porDeal.has(m.deal_id)) porDeal.set(m.deal_id, []);
    porDeal.get(m.deal_id).push(m);
  }

  const D = Object.fromEntries(deals.map((d) => [d.id, d]));
  let fila = [...porDeal.entries()]
    .filter(([id, lista]) => {
      if (!D[id]) return false;
      // Cliente atual, contato pessoal e thread orfa nao sao prospeccao fria.
      // Classificar isso gastaria chamada de IA e depois inflaria a taxa.
      if (!ehProspect(D[id].company, D[id].name)) return false;
      if (D[id].classified_at && !REFAZER) return false;
      // Precisa de pelo menos uma resposta humana do lead. Sem inbound nao ha o
      // que classificar: consciencia e sofisticacao se leem no que ELE diz.
      return lista.some(
        (m) => m.direction === "received" && m.content && !AUTORESPONDER.test(m.content),
      );
    })
    .map(([id, lista]) => ({ deal: D[id], msgs: lista }));

  // Contado ANTES do --limite: senao o corte de teste vira "numero de leads que
  // nao responderam" no log e a leitura do dia sai errada.
  const elegiveis = fila.length;
  if (LIMITE) fila = fila.slice(0, LIMITE);

  console.log(`\nthreads com mensagem: ${porDeal.size}   |   com resposta humana: ${elegiveis}`);
  console.log(`(${porDeal.size - elegiveis} sem resposta aproveitavel — entram no relatorio como depth=0)`);
  if (LIMITE) console.log(`--limite=${LIMITE}: classificando so ${fila.length} de ${elegiveis}.`);
  console.log("");

  const resultados = [];
  const rejeitados = []; // classificacao invalida nesta rodada
  for (const { deal, msgs: lista } of fila) {
    const audios = lista.filter((m) => m.direction === "received" && /audio/i.test(m.message_type || ""));
    const thread = lista
      .map((m) => {
        const quem = m.direction === "received" ? "LEAD" : "ERICK";
        if (/audio/i.test(m.message_type || "") && !m.content)
          return `${quem}: [audio nao transcrito]`;
        return `${quem}: ${(m.content || "").slice(0, 600)}`;
      })
      .join("\n");

    try {
      const { dados, model } = await chamarGroq(
        `EMPRESA: ${deal.company || deal.name}\nSEGMENTO: ${deal.segment_norm || "nao classificado"}\n\nCONVERSA:\n${thread}`,
      );
      const erros = validar(dados);
      if (erros.length) {
        console.log(`  !! ${deal.company}: fora da rubrica (${erros.join(", ")}) — pulado`);
        rejeitados.push(deal);
        continue;
      }
      const falasDoLead = lista
        .filter((m) => m.direction === "received" && m.content)
        .map((m) => m.content);
      if (!evidenciaVemDoLead(dados.classification_evidence, falasDoLead)) {
        console.log(
          `  !! ${deal.company}: evidencia nao e fala do lead ` +
            `("${String(dados.classification_evidence).slice(0, 50)}") — pulado`,
        );
        rejeitados.push(deal);
        continue;
      }
      // Audio sem transcricao e limite conhecido, nao conclusao. Marcar e honesto:
      // o Jota Y responde so por audio e sumiria do relatorio sem isso.
      if (audios.length && !lista.some((m) => m.direction === "received" && m.content?.trim())) {
        dados.blocker = "audio_nao_transcrito";
      }
      resultados.push({ deal, dados, model });
      console.log(
        `  ${String(deal.company || deal.name).slice(0, 34).padEnd(34)} ` +
          `cons=${dados.awareness_level} sof=${dados.sophistication_level} ` +
          `prof=${dados.conversation_depth} ${dados.offer_clarity.padEnd(12)} ${dados.blocker}`,
      );
    } catch (e) {
      console.log(`  !! ${deal.company}: ${e.message}`);
    }
  }

  if (!GO) {
    console.log(`\nDRY-RUN. ${resultados.length} classificacoes prontas, nada gravado. Rode com --go.\n`);
    return;
  }

  for (const { deal, dados, model } of resultados) {
    await db.patch(`deals?id=eq.${deal.id}`, {
      awareness_level: dados.awareness_level,
      sophistication_level: dados.sophistication_level,
      offer_clarity: dados.offer_clarity,
      offer_demanded: dados.offer_demanded,
      conversation_depth: dados.conversation_depth,
      blocker: dados.blocker,
      classification_evidence: (dados.classification_evidence || "").slice(0, 500),
      classified_at: new Date().toISOString(),
      classified_by: "ia",
      classification_model: model,
    });
  }
  // Rejeitar so pular a gravacao deixaria a classificacao ANTERIOR (invalida) de pe
  // no banco, e o relatorio seguiria mostrando a citacao que acabou de ser reprovada.
  // Quem foi rejeitado agora tem que voltar a ficar SEM classificacao.
  let limpos = 0;
  for (const deal of rejeitados) {
    if (!deal.classified_at) continue;
    await db.patch(`deals?id=eq.${deal.id}`, {
      awareness_level: null, sophistication_level: null, offer_clarity: null,
      offer_demanded: null, conversation_depth: null, blocker: null,
      classification_evidence: null, classified_at: null, classified_by: null,
      classification_model: null,
    });
    limpos++;
  }

  console.log(`\nOK: ${resultados.length} conversas classificadas. Audite em /achados.`);
  if (limpos) console.log(`${limpos} classificacoes anteriores invalidadas e apagadas.`);
  if (rejeitados.length) {
    console.log(`${rejeitados.length} conversas ficaram SEM classificacao (a IA nao passou nos freios).`);
    console.log("Essas sao pra voce classificar na mao — sao justamente as ambiguas.");
  }
  console.log("");
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});