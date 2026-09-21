/**
 * copy-sequencia2.mjs
 * Segundo e-mail da sequencia fria da Mydrion: vai SO pra quem abriu ou clicou no e-mail 1
 * e nao respondeu em canal nenhum. Aprovado pelo Erick em 18/09/2026 depois do roundtable
 * Willian Celso + Thiago Finch + Alex Hormozi (caso registrado em content/sales-playbook-casos.json).
 *
 * O que muda em relacao ao e-mail 1 (copy-institucional.mjs):
 * - Arquetipo: o e-mail 1 e Mago (revela o intervalo invisivel). Este e Governante: prova
 *   (case), preco e vaga de producao. Um arquetipo por peca.
 * - Um CTA so, e e o WhatsApp com texto pronto. O e-mail 1 sai pelo site; aqui a pessoa ja
 *   leu duas vezes e o destino e a conversa, nao mais leitura.
 * - Preco entra escrito (R$1.000 + R$150/mes por ESTADO, nunca por trabalho), igual a msg 2
 *   do WhatsApp: em ticket baixo o preco e o filtro.
 * - Fecho pela vaga de producao ("Coloco a {Empresa} nela?"), nunca permissao.
 * - Case por segmento, mesma regra da msg 2 do WhatsApp: Metalthec pra usinagem/caldeiraria,
 *   Jotta pro resto.
 * - Quem clicou recebe versao curta e direta, SEM dizer que a gente sabe do clique.
 * - Caixa generica (contato@, sac@...) abre sem nome, mesmo que o decisor seja conhecido.
 *
 * Termos mortos que o e-mail 1 ainda carregava e aqui nao entram: "Faz sentido pra voces?",
 * dois botoes, "site", "presenca digital".
 */
import { nomeCurto, primeiroNome, violacoes as violacoesBase } from "./copy-institucional.mjs";

const WHATSAPP = "553191072407";

const CASES = {
  metalthec: { nome: "Metalthec", url: "https://site-metalthec.vercel.app/" },
  jotta: { nome: "Jotta Manutenções", url: "https://sitejotta.vercel.app/" },
};

/** Mesma regra da msg 2 do WhatsApp: usinagem e caldeiraria veem a Metalthec, o resto ve a Jotta. */
export function caseDoSegmento(segment) {
  const s = String(segment || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /usinag|caldeir|torne|ferramentaria|metalurg/.test(s) ? CASES.metalthec : CASES.jotta;
}

/** contato@, sac@, comercial@... e caixa de departamento: abre sem nome, o decisor pode nem ler. */
export function caixaGenerica(email) {
  return /^(contato|comercial|vendas|sac|atendimento|financeiro|adm|administrativo|compras|rh|nfe|faturamento|info|marketing\d*|engenharia|laboratorio|contas|controladoria|suporte|orcamento|orcamentos)@/i.test(
    String(email || "").trim(),
  );
}

function botaoWhatsApp(empresa) {
  const texto = `Oi Erick, vi seu e-mail sobre o Pedido Pronto. Aqui é da ${empresa}.`;
  const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
  const base = "display:inline-block;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px";
  return {
    html: `<p style="margin:30px 0 26px">
<a href="${url}" style="${base};background:#111111;color:#ffffff">Falar com o Erick no WhatsApp</a>
</p>`,
    text: `Falar com o Erick no WhatsApp: ${url}`,
  };
}

/**
 * @param {{empresa:string, decisorNome?:string, segment?:string, email:string, clicou?:boolean, variante?:"A"|"B"}} lead
 * @returns {{subject:string, html:string, text:string, variante:string, caseNome:string}}
 */
export function montarEmail2({ empresa, decisorNome, segment, email, clicou = false, variante = "A" }) {
  const nome = nomeCurto(empresa);
  const pessoa = caixaGenerica(email) ? null : primeiroNome(decisorNome);
  const saudacao = pessoa ? `${pessoa},` : "Olá, tudo bem?";
  const c = caseDoSegmento(segment);

  let subject;
  let paragrafos;
  if (clicou) {
    // Ja viu o mecanismo no endereco da Mydrion. Vai direto ao preco e a vaga, sem
    // "vi que voce entrou": dono de metalurgica le isso como vigilancia, nao como Governante.
    subject = pessoa ? `${pessoa}, o Pedido Pronto na ${nome}` : `O Pedido Pronto na ${nome}`;
    paragrafos = [
      saudacao,
      `Direto ao ponto. O que eu faço é o Pedido Pronto: o cliente informa serviço, equipamento e urgência antes de chegar em você, e o orçamento sai sem ida e volta. Ficou de pé na ${c.nome}: ${c.url}`,
      `Pra ${nome}: R$1.000 a página, mais R$150/mês pra manter ela no ar e atualizada.`,
      `Minha próxima entrada de produção é quinta. Coloco a ${nome} nela?`,
    ];
  } else {
    // Teste A/B de assunto, medido por RESPOSTA (nao por abertura nem clique).
    subject =
      variante === "B"
        ? "A indicação chegou. O orçamento saiu?"
        : `Como a ${c.nome} resolveu o orçamento sem ida e volta`;
    paragrafos = [
      saudacao,
      `Outro dia eu perguntei quantas indicações chegam até o orçamento. Fica a resposta que eu tenho: a ${c.nome} fechou esse intervalo com o Pedido Pronto. O cliente informa serviço, equipamento e urgência antes de chegar no dono, e o orçamento sai na primeira resposta, sem ida e volta: ${c.url}`,
      `Pra ${nome} eu faço igual, com os serviços de vocês. R$1.000 a página, mais R$150/mês pra manter ela no ar e atualizada.`,
      `Minha próxima entrada de produção é quinta. Coloco a ${nome} nela?`,
    ];
  }

  const b = botaoWhatsApp(nome);
  const text = `${paragrafos.join("\n\n")}\n\n${b.text}\n\nErick Sena\nMydrion`;
  const html = `${paragrafos.map((p) => `<p>${p}</p>`).join("\n")}
${b.html}
<p>Erick Sena<br>Mydrion</p>`;

  return { subject, html, text, variante: clicou ? "clicou" : variante, caseNome: c.nome };
}

// Alem das regras do e-mail 1, os termos mortos do playbook que um follow-up tende a puxar.
export const REGRAS_PROIBIDAS_SEQ2 = [
  /faz sentido/i,
  /posso te mostrar/i,
  /quer ver\?/i,
  /15 min/i,
  /\bcall\b/i,
  /reuni[ãa]o/i,
  /agend/i,
  /manuten[çc][ãa]o (mensal|inclusa|do site)/i,
  /landing page/i,
  /p[áa]gina de vendas/i,
  /—/, // travessao
];

/** Guarda de regressao: URLs saem antes da checagem, senao "site-metalthec" acusa "site". */
export function violacoes2(texto) {
  const semUrl = String(texto || "").replace(/https?:\/\/\S+/g, "");
  return [...violacoesBase(semUrl), ...REGRAS_PROIBIDAS_SEQ2.filter((re) => re.test(semUrl)).map((re) => re.source)];
}
