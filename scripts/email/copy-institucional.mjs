/**
 * copy-institucional.mjs
 * Copy de cold email da Mydrion, escrita em cima do playbook `mydrion-objecao-institucional.md`
 * (origem: conversa presencial na Imagem X, 08/09/2026).
 *
 * A copy anterior (`build_email_queue.mjs`, julho/2026) quebrava as regras do playbook:
 * abria dizendo que havia "um ponto custando orçamentos", avaliava o material do lead
 * ("o site de vocês já cobre o básico"), comparava com concorrente e prometia um diagnóstico
 * sob medida. Isso ativa o Herói defendendo o cercadinho e fecha a porta.
 *
 * REGRAS QUE ESTA COPY OBEDECE (todas do playbook):
 * 1. Nunca apontar falha no material do lead. Enquadramento só positivo.
 * 2. Nunca comparar com concorrente. Nunca dizer "você precisa de".
 * 3. Léxico: nada de "site", "marketing", "presença digital", "lead", "conversão".
 *    Usa: endereço próprio, território, indicação, indicação que chegou.
 * 4. Movimento de 3 tempos: CONCORDA com o símbolo que ele defende (indicação),
 *    ESTENDE (tem uma etapa que ninguém mede), PERGUNTA um número que ele não sabe.
 * 5. Fecho sem pedir permissão: "Faz sentido pra vocês?" virou termo morto do playbook em
 *    02/09/2026 e saiu daqui em 18/09/2026. Nunca pedir call em lead frio.
 * 6. Um único link, e é o da própria Mydrion (prova), nunca um diagnóstico sob medida.
 *    O segundo e-mail da sequência (copy-sequencia2.mjs) é outra peça: Governante, WhatsApp.
 *
 * Tratamento: usamos só o PRIMEIRO NOME do decisor. Nada de Dr./Dra. deduzido do nome,
 * porque o nome não diz o tratamento que a pessoa usa e errar isso queima a abertura.
 */

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "ERNANI TADEU DE SOUZA" -> "Ernani" */
export function primeiroNome(nomeCompleto) {
  const bruto = String(nomeCompleto || "").trim();
  if (!bruto) return null;
  const token = bruto.split(/\s+/)[0];
  if (!token || PARTICULAS.has(token.toLowerCase())) return null;
  if (/\d/.test(token)) return null; // sobra de razão social de empresário individual
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Corta sufixo de SEO que veio do Maps: "ClinBelo | Clínica odontológica" -> "ClinBelo" */
export function nomeCurto(empresa) {
  return String(empresa || "")
    .split(/\s[|–—-]\s/)[0]
    .replace(/\s+(LTDA|ME|EPP|EIRELI|S\/?A)\.?$/i, "")
    .trim();
}

// O vocabulário muda com o setor porque quem procura muda: paciente x comprador.
const VOCABULARIO = {
  saude: {
    quemProcura: "paciente",
    verboFinal: "virou paciente",
    acao: "ligar",
    ninguemSabe: "quase nenhuma clínica sabe responder",
    chegouAte: "chegaram até o telefone",
  },
  industria: {
    quemProcura: "comprador",
    verboFinal: "virou cotação",
    acao: "pedir orçamento",
    ninguemSabe: "quase nenhuma indústria sabe responder",
    chegouAte: "chegaram até o orçamento",
  },
  padrao: {
    quemProcura: "cliente",
    verboFinal: "virou cliente",
    acao: "entrar em contato",
    ninguemSabe: "quase ninguém sabe responder",
    chegouAte: "chegaram até o contato",
  },
};

const SITE = "https://www.mydrion.com.br/";

/** Só faz sentido dizer "aqui de João Monlevade" para quem é de João Monlevade. */
function trechoCidade(cidade) {
  const c = String(cidade || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return c.includes("monlevade") ? ", aqui de João Monlevade" : "";
}

// utm_content=d<dealId> e o que liga o clique ao card: o site manda o beacon com a URL
// inteira pro /api/facebook-pixel do CRM, que resolve o deal e grava signal_view /
// signal_whatsapp na timeline. Sem isso o Brevo diz QUEM clicou e o site diz O QUE fez,
// mas ninguem junta os dois (21/09/2026).
function botaoSite(dealId) {
  const ref = Number.isInteger(dealId) && dealId > 0 ? `&utm_content=d${dealId}` : "";
  const site = `${SITE}?utm_source=email&utm_medium=cold&utm_campaign=institucional${ref}`;
  const siteHtml = site.replace(/&/g, "&amp;");
  // Botao em e-mail e <a> com estilo inline: nada de flex, grid ou classe, que cliente
  // de e-mail descarta. display:inline-block com padding e o que funciona em todos.
  const base = "display:inline-block;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px";
  return {
    html: `<p style="margin:30px 0 26px">
<a href="${siteHtml}" style="${base};background:#111111;color:#ffffff">Conhecer a Mydrion</a>
</p>`,
    text: `Conhecer a Mydrion: ${site}`,
  };
}

/**
 * Monta o e-mail de primeiro contato.
 * @param {{empresa:string, decisorNome?:string, setor?:string, cidade?:string, dealId?:number}} lead
 * @returns {{subject:string, html:string, text:string, tratamento:string}}
 */
export function montarEmail({ empresa, decisorNome, setor, cidade, dealId }) {
  const nome = nomeCurto(empresa);
  const pessoa = primeiroNome(decisorNome);
  const v = VOCABULARIO[setor] || VOCABULARIO.padrao;

  // Sem nome do decisor a saudação fica neutra, nunca "Prezados" nem "A quem interessar".
  const saudacao = pessoa ? `Olá, ${pessoa}.` : "Olá, tudo bem?";

  const paragrafos = [
    saudacao,
    `Erick Sena${trechoCidade(cidade)}. Eu construo o endereço próprio de quem vive de indicação.`,
    `Antes de qualquer coisa, eu concordo com uma coisa que provavelmente você já sabe: indicação é o melhor canal que existe no mercado de vocês. Quem chega indicado já chega decidido, e nenhuma outra origem entrega isso.`,
    `Só que existe uma etapa invisível dentro dela. Entre alguém ouvir o nome da ${nome} e ${v.acao}, essa pessoa procura vocês. O que ela encontra nesse intervalo decide se a indicação ${v.verboFinal} ou virou nada.`,
    `Daí a pergunta que ${v.ninguemSabe}: quantas indicações vocês recebem por mês, e quantas dessas você sabe que ${v.chegouAte}?`,
    `Não é sobre aparecer. É sobre estar de pé quando alguém já decidiu te procurar. É isso que eu faço: dar forma visível à reputação que vocês já construíram.`,
    // Fecho do Mago: nomeia a entrada que ele organiza e para. Ate 18/09/2026 aqui havia
    // "Faz sentido pra voces?", termo morto do playbook (pede permissao; o roundtable
    // Celso/Finch/Hormozi apontou que era a linha em que o e-mail perdia a pessoa).
    `Se essa conta não fecha aí hoje, é essa entrada que eu organizo.`,
  ];

  const b = botaoSite(dealId);
  const text = `${paragrafos.join("\n\n")}\n\n${b.text}\n\nErick Sena\nMydrion`;
  const html = `${paragrafos.map((p) => `<p>${p}</p>`).join("\n")}
${b.html}
<p>Erick Sena<br>Mydrion</p>`;

  return {
    // Assunto é uma pergunta sobre o negócio dele, não uma promessa nem um benefício.
    subject: `Uma pergunta sobre as indicações da ${nome}`,
    html,
    text,
    tratamento: pessoa || "(sem nome do decisor)",
  };
}

export const REGRAS_PROIBIDAS = [
  /\bsites?\b/i,
  /\bmarketing\b/i,
  /presen[çc]a digital/i,
  /\bleads?\b/i,
  /convers[ãa]o/i,
  /redes sociais/i,
  /\bpode ser\?/i,
  /sem gastar/i,
  /concorrente/i,
  // Termos mortos do playbook (content/sales-playbook.json) que pedem permissao.
  /faz sentido/i,
  /posso te mostrar/i,
  /quer ver\?/i,
];

/** Guarda de regressão: devolve as regras do playbook que a copy violou. */
export function violacoes(texto) {
  return REGRAS_PROIBIDAS.filter((re) => re.test(texto)).map((re) => re.source);
}
