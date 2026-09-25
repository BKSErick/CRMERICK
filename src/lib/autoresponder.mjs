/**
 * Resposta automatica de WhatsApp Business: UMA lista para o CRM inteiro.
 *
 * Story 067 (25/09/2026). Antes havia duas listas que diziam se espelhar e nao se
 * espelhavam: `classifyInboundResponse` em src/lib/followup.ts (webhook, grava
 * deals.response_type) e o regex AUTORESPONDER de scripts/uazapi-followup-batch.mjs
 * (cadencia). Em 24/09 o gate do Finch contou 52 "respostas qualificadas paradas";
 * 15 eram saudacao automatica gravada como "humana" porque o webhook nao conhecia a
 * frase ("Voce esta sendo atendido(a) por...", "Ja conectei voce a nossa equipe",
 * "Para solicitar uma cotacao...") ou porque o deal foi classificado antes da frase
 * entrar na lista. Resposta automatica lida como humana trava volume novo (gate) e
 * tira o lead da cadencia esperando resposta a mao que nunca vem.
 *
 * Os padroes sao substrings do texto dobrado (sem acento, minusculo, espaco unico).
 * Cada um veio de mensagem real da base; o deal esta no comentario. Frase que um humano
 * escreveria ("como posso te ajudar", "te retorno em breve") fica de fora de proposito:
 * resposta humana classificada como bot some da fila do Erick, e esse erro custa mais
 * que o contrario.
 */

export function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const PADROES_RESPOSTA_AUTOMATICA = Object.freeze([
  "mensagem automatica",
  "resposta automatica",
  "atendimento automatico",
  "assistente virtual",
  "assistente digital",
  "horario de atendimento",
  "horario de funcionamento",
  "selecione uma opcao",
  "selecione a opcao",
  "escolha uma opcao",
  "escolha a opcao",
  "digite uma opcao",
  "menu de atendimento",
  "nao responda esta mensagem",
  "aguarde que em breve",
  "em breve nossos consultores",
  "responderemos",
  "retornaremos",
  "um de nossos atendentes",
  "faca seu cadastro",
  "agradecemos seu contato",
  "agradecemos o seu contato",
  "agradece seu contato",
  "agradece o seu contato",
  "agradeco o contato",
  "agradeco seu contato",
  "agradeco o seu contato", // #479 MA Manutencao
  "agradeco pelo contato",
  "agradecemos pelo seu contato", // #1039 Aquavolts
  "como podemos te ajudar",
  "como podemos ajudar",
  "como podemos lhe ajudar",
  "em que podemos",
  "seja bem vindo",
  "seja bem-vindo",
  "seja bem vinda",
  "seja bem-vinda",
  "bem-vind",
  "bem vind",
  // 14/08: frase de bot que casava com a lista de encaminhamento (RDL, Blukit).
  "obrigado por entrar em contato",
  "obrigada por entrar em contato",
  "obrigado pelo contato",
  "obrigada pelo contato",
  "canal e exclusivo",
  "canal exclusivo",
  "exclusivo para televendas",
  "somente para televendas",
  // 18/08: medicao das 388 respostas da base.
  "aguardando atendimento", // #78 Blukit
  "que legal ter voce aqui", // #672 Proeng
  "nao consigo ajudar com isso", // #1008 JP, #1021 F&T (IA da Meta)
  "somos o rh", // #1227 Tesla
  "informe seu nome", // #857 Union
  "somos a empresa", // #1183 CASALTEC
  "estou aqui para oferecer", // #1079 Automacao Monlevade
  "nao estamos disponiveis no momento", // #1216 DM Refrigeracao
  "esta a sua disposicao", // #1203 TOHRU (terceira pessoa: a empresa falando de si)
  "protocolo de chamado", // #78 Blukit
  "buttonsmessage", // menu interativo do WhatsApp Business
  "listmessage",
  // 25/09: triagem das 52 paradas do gate Finch.
  "para solicitar uma cotacao", // #664 Power Test
  "voce esta sendo atendido", // #1039 Aquavolts
  "vou dar continuidade no seu atendimento", // #1186 Metropolitana
  "me diga seu nome", // #1186 Metropolitana
  "vou encerrar o atendimento", // #1414 Cimento Nacional
  "respondera sua mensagem", // #732 Sa Metalurgica
  "voce ja sera atendido", // #292 Garcia Automacao
  "ja conectei voce", // #750 Sene Fresa, #634, #1214 (IA da Meta)
  "alguem vai analisar sua mensagem", // #750 Sene Fresa
  "fique a vontade para conhecer", // #1319 Maqtec
  "para apresentacoes ou assuntos", // #795 Steel Usinagem
  "vou te transferir para", // #1297 Bufalo (a pessoa que assumiu depois e humana)
  "aguarde so um momento", // #1297 Bufalo
  "conheca um pouco do nosso trabalho", // #1192
  "obrigado pelo seu contato", // #982 MF Climatronica
  "obrigada pelo seu contato",
  "entraremos em contato", // #1324
]);

const DIGITE_NUMERO = /\bdigite \d/;

// Recusa escrita e sempre humana, mesmo embrulhada em cortesia de atendimento:
// "Agradecemos pelo seu contato!! No momento nao temos interesse!!" (#1060 EMC) e
// "obrigada pelo contato, mas ja temos uma empresa que cuida para nos" (#829).
const RECUSA = [
  "ja temos uma empresa",
  "ja temos empresa",
  "ja temos quem",
  "ja temos um parceiro",
  "ja temos fornecedor",
  "nao temos interesse",
  "nao tenho interesse",
  "nao ha interesse",
  "sem interesse",
  "nao precisamos",
  "nao preciso",
];

/** true quando o texto e resposta automatica (e nao recusa escrita por gente). */
export function ehRespostaAutomatica(content) {
  const text = foldText(content);
  if (!text) return false;
  if (RECUSA.some((frase) => text.includes(frase))) return false;
  return DIGITE_NUMERO.test(text) || PADROES_RESPOSTA_AUTOMATICA.some((padrao) => text.includes(padrao));
}
