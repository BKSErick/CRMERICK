/**
 * regenerate-copies.js
 * Regenera todos os _copy.txt da pasta huberick-temp
 * com copy personalizada por empresa (injetando sabotadores reais do HTML)
 *
 * USO:
 *   node scripts/regenerate-copies.js
 *   node scripts/regenerate-copies.js --dry-run   (só mostra sem salvar)
 *   node scripts/regenerate-copies.js --limit=10  (só os 10 primeiros, pra testar)
 */

const fs   = require('fs');
const path = require('path');
const { nomeCurto: nomeDaEmpresa } = require('./lib/nomeEmpresa.js');
const SALES_PLAYBOOK = require('../content/sales-playbook.json');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const LEADS_DIR  = path.join(__dirname, '..', 'huberick-temp');
const BASE_URL   = 'https://crmerick.vercel.app/huberick-temp/';  // ← URL Vercel
const DRY_RUN    = process.argv.includes('--dry-run');
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='));
const LIMIT      = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrai até 3 sabotadores do HTML (texto dos card-title).
 * Retorna array de strings limpas.
 */
function extrairSabotadores(html) {
  const sabotadores = [];
  // Pega card-titles que contenham ⚠️
  const regex = /class="card-title"[^>]*>[\s]*⚠️[\s]*([^<]+)<\/div>/gi;
  let match;
  while ((match = regex.exec(html)) !== null && sabotadores.length < 3) {
    const texto = match[1]
      .replace(/\s+/g, ' ')
      .trim();
    if (texto.length > 5) sabotadores.push(texto);
  }
  return sabotadores;
}

// Nota abaixo disso nao sustenta "e operacao de verdade, com cliente que volta": a
// frase vira o contrario do que promete. Achado em 03/09/2026 — deal #1402 saiu com
// "3,1 estrelas com 9 avaliações no Maps e operacao de verdade, com cliente que
// volta", que soa como o oposto da propria nota. So o TAMANHO da amostra (MINIMO_
// AVALIACOES, abaixo) era filtrado; a NOTA em si nunca foi. Compartilhado com
// mapsInfoDe() de scripts/generate-copies-db.mjs -- mudar aqui obriga mudar la.
const NOTA_MINIMA = 4;

/**
 * Extrai informações do Google Maps (nota e número de avaliações)
 */
function extrairMapsInfo(html) {
  const m = html.match(/Google Maps \(([^)]+)\)/i);
  // A pagina de auditoria grava "avaliacoes" sem acento; na mensagem sai com acento
  // e no singular quando for uma so ("com 1 avaliações" denuncia texto automatico).
  if (!m) return null;
  const texto = m[1].trim()
    .replace(/avaliacoes/gi, 'avaliações')
    .replace(/\b1 avaliações\b/, '1 avaliação');
  const nota = texto.match(/^(\d[.,]\d)/);
  if (nota && parseFloat(nota[1].replace(',', '.')) < NOTA_MINIMA) return null;
  return texto;
}

/**
 * Extrai o score do site (número dentro do círculo de conversão).
 */
function extrairScore(html) {
  const m = html.match(/font-weight:800;background:radial-gradient[^>]*>(\d+)<\/div>/i)
         || html.match(/font-size:1\.25rem;font-weight:800[^>]*>(\d+)<\/div>/i);
  return m ? parseInt(m[1]) : null;
}

/**
 * Extrai a URL do site avaliado.
 */
function extrairSiteUrl(html) {
  const m = html.match(/Site avaliado:\s*(https?:\/\/[^\s<"'`,]+)/i);
  if (m) return m[1].replace(/\.$/, '');
  const m2 = html.match(/(https?:\/\/(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s<"'`,]*)/i);
  return m2 ? m2[1].replace(/\.$/, '') : null;
}

/**
 * Extrai o nome da empresa (h1 ou title).
 */
function extrairEmpresa(html) {
  const h1 = html.match(/<h1>([^<]+)<\/h1>/i);
  if (h1) return h1[1].trim().replace(/^Analise Digital - /i, '');
  const title = html.match(/<title>(?:Analise Digital - )?([^<]+)<\/title>/i);
  return title ? title[1].trim() : 'Empresa';
}

/**
 * Detecta se a pagina e de auditoria de site real ("Site avaliado:")
 * ou de presenca sem site. NAO usar sabotadores pra isso: paginas
 * sem-site tambem tem cards de alerta.
 */
function extrairTemSite(html) {
  return /Site avaliado:/i.test(html);
}

/**
 * Extrai a cidade citada na pagina ("...procura X em Ipatinga...").
 */
function extrairCidade(html) {
  const m = html.match(/(?:pesquis|busca|procur)[^<]{0,80}?em ((?:[A-ZÀ-Ú][a-zà-úçãõéíêôâ]+)(?:(?: (?:de|da|do|dos|das))? [A-ZÀ-Ú][a-zà-úçãõéíêôâ]+){0,3})/);
  if (!m) return null;
  const cidade = m[1].trim();
  return cidade.length <= 30 ? cidade : null;
}

/**
 * Gera o texto de copy personalizado para a empresa.
 *
 * Segue o Framework_Mensagem_Abordagem_Hormozi.md (vault, Posicionamento/):
 * - Culpa o mercado/comprador, nunca o dono (anti-ego)
 * - Prova antes de pitch (nome, cidade, reputacao Maps)
 * - UM problema, nunca lista
 * - Max ~80 palavras, SEM link na mensagem 1 (link vai apos resposta)
 * - Fecha SEMPRE com a PERGUNTA DE RECONHECIMENTO: a msg 1 nao pede mais o "quer
 *   ver?" (v3, 31/08). Ver o bloco PERGUNTA DE RECONHECIMENTO abaixo.
 */
// CTA canonico da mensagem 1 ATE a v2 (decidido por Erick 2026-07-30). Mantido aqui
// porque gerarCopyAntiga() ainda o usa como referencia do formato anterior. A msg 1
// viva NAO usa mais este CTA: ver perguntaDeReconhecimento().
const CTA_FINAL = 'Separei um exemplo de página que faz isso pra uma empresa do mesmo ramo. Quer ver?';

// Prova por segmento. REGRA ANTI-INVENCAO: o texto tem que descrever o case que sera
// REALMENTE enviado na msg 2, senao o lead abre o link e ve outra coisa.
//   Jotta     = manutencao industrial (sitejotta.vercel.app)
//   Metalthec = fabricacao e usinagem de precisao (site-metalthec.vercel.app)
const CASE_POR_SEGMENTO = {
  usinagem: 'pra uma metalúrgica de usinagem de precisão',
  caldeiraria: 'pra uma metalúrgica de fabricação e caldeiraria',
  manutencao: 'pra uma empresa de manutenção industrial',
  automacao: 'pra uma empresa de manutenção e automação industrial',
  climatizacao: 'pra uma empresa de manutenção industrial',
  geral: 'pra uma empresa do mesmo ramo',
};

function ctaDoSegmento(seg) {
  return `Separei um exemplo de página que faz isso ${CASE_POR_SEGMENTO[seg.nome] || CASE_POR_SEGMENTO.geral}. Quer ver?`;
}

// ─── VARIANTE LOCAL (mesma cidade que o Erick) ───────────────────────────────
// Jotta e Metalthec sao os DOIS cases reais e ficam em Joao Monlevade, a cidade do
// Erick. Prospectando na propria cidade da para nomear o cliente e a cidade, o que e
// prova muito mais forte que "uma empresa do mesmo ramo": o dono conhece a empresa
// citada, ou conhece alguem que conhece.
// ANTI-INVENCAO: so nomear case que existe e cuja pagina sera realmente enviada.
const MINHA_CIDADE = 'joao monlevade';
const CASE_LOCAL = {
  usinagem: 'a página da Metalthec, aqui de Monlevade',
  caldeiraria: 'a página da Metalthec, aqui de Monlevade',
  manutencao: 'a página da Jotta Manutenções, aqui de Monlevade',
  automacao: 'a página da Jotta Manutenções, aqui de Monlevade',
  climatizacao: 'a página da Jotta Manutenções, aqui de Monlevade',
  geral: 'a página da Jotta Manutenções, aqui de Monlevade',
};

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ehLocal = (cidade) => semAcento(cidade).includes(MINHA_CIDADE);

// ─── REGIAO (v4, 08/09) ──────────────────────────────────────────────────────
// Tres niveis de proximidade, do mais forte pro mais fraco:
//   local     Joao Monlevade          -> "de Monlevade mesmo"
//   regional  Vale do Aco / M. Piracicaba -> "do Vale do Aco mesmo"
//   nacional  o resto                 -> NENHUMA marca geografica
// A prospeccao virou nacional. Dizer "aqui do Vale do Aco" para uma metalurgica de
// Caxias do Sul nao aproxima nada: entrega que a mensagem e template com variavel
// trocada, que e exatamente o que o dono industrial procura antes de responder.
// So entra cidade cuja industria realmente orbita o eixo Monlevade-Ipatinga.
const CIDADES_REGIAO = [
  'ipatinga', 'coronel fabriciano', 'timoteo', 'santana do paraiso', 'nova era',
  'antonio dias', 'rio piracicaba', 'bela vista de minas', 'sao goncalo do rio abaixo',
  'barao de cocais', 'itabira', 'joao monlevade', 'alvinopolis', 'sao domingos do prata',
  'dionisio', 'jaguaracu', 'marlieria', 'catas altas', 'santa barbara', 'ipaba',
];
const ehRegional = (cidade) => {
  const c = semAcento(cidade);
  return Boolean(c) && CIDADES_REGIAO.some((nome) => c.includes(nome));
};

function ctaLocal(seg) {
  return `Fiz ${CASE_LOCAL[seg.nome] || CASE_LOCAL.geral}. Quer ver como ficou?`;
}

// ─── PERGUNTA DE RECONHECIMENTO (v3, 31/08) ──────────────────────────────────
// A msg 1 parou de pedir "quer ver?". Pedir o exemplo antes de o lead reconhecer o
// problema entrega a oferta para quem ainda nao admitiu ter a dor: o "manda ai" que
// volta e educacao, nao intencao, e ele suja a taxa de resposta e morre no M2.
// A pergunta abaixo e respondivel sem admitir incompetencia — o dono pode dizer
// "chega certinho" e sair inteiro —, e e ela que diz se existe dor antes de gastar
// o case. O convite para o exemplo migrou para o followup M1.
// PROIBIDO trocar por "faz sentido pra voce?": pergunta generica nao mede nada e
// convida o lead a encerrar por educacao.
const PERGUNTA_POR_SEGMENTO = {
  usinagem: 'Hoje o pedido chega assim aí, ou vocês precisam puxar medida e desenho por mensagem antes de orçar?',
  caldeiraria: 'Hoje o pedido chega assim aí, ou vocês precisam puxar medida e material por mensagem antes de orçar?',
  manutencao: 'Hoje o pedido chega assim aí, ou vocês precisam puxar equipamento e urgência por mensagem antes de orçar?',
  automacao: 'Hoje o pedido chega assim aí, ou vocês precisam puxar equipamento e urgência por mensagem antes de orçar?',
  climatizacao: 'Hoje o cliente já chama dizendo o que precisa, ou vocês descobrem isso no meio da conversa?',
  geral: 'Hoje o pedido chega com essas informações, ou vocês precisam puxar por mensagem antes de orçar?',
};

function perguntaDeReconhecimento(seg) {
  return PERGUNTA_POR_SEGMENTO[seg.nome] || PERGUNTA_POR_SEGMENTO.geral;
}

// Lead SEM site tem outra rachadura, e ela nao e o escopo do pedido: e nao existir um
// ponto proprio onde quem chega valide a empresa. Perguntar sobre escopo para quem nao
// tem site mistura duas dores na mesma mensagem, e a doutrina manda apontar UMA.
const PERGUNTA_SEM_SITE = 'Hoje quem recebe uma indicação de vocês consegue confirmar tudo num lugar só, ou acaba procurando em canal diferente antes de chamar?';

// ─── MECANISMO INDICACAO (v4, 08/09) ─────────────────────────────────────────
// Ate a v3 o lead COM site recebia a friccao de orcamento (mecanismo Pedido Pronto) e
// so o lead SEM site recebia o eixo da indicacao. Estava invertido: a indicacao e o
// eixo mais barato dos dois, e o publico com site e a maioria da base.
//
// Motivo (diagnostico Naval, 08/09): o publico industrial tem sofisticacao ALTA e
// consciencia do mecanismo BAIXA. Contra sofisticacao alta, argumento novo perde —
// a friccao de orcamento pede que o dono aceite um problema que ele ainda nao nomeou.
// A indicacao faz o contrario: ESTENDE uma crenca que ele ja tem e defende. Quanto
// mais ele acredita em indicacao, mais forte fica a ponte, e a objecao vira combustivel.
//
// ANTI-INVENCAO mantida: a ponte descreve o caminho de quem foi indicado e NUNCA
// afirma que o lead esta perdendo cliente nem que o site dele e ruim. O dono pode
// responder "encontra tudo certinho" e sair inteiro, que e a regra da v3.
const PONTE_INDICACAO = 'Uma coisa que quase ninguém mede: quem recebe uma indicação de vocês procura antes de ligar. O que essa pessoa encontra nessa hora decide se a indicação virou orçamento ou virou nada.';
const PERGUNTA_INDICACAO = 'Vocês têm ideia de quantas indicações chegam até o telefone?';

// DECLARACAO DE PAPEL (02/08) — a correcao mais cara que o funil pediu.
//
// Motivo concreto: a Alpina Torres respondeu "Qual seria sua demanda?" e depois
// "Aqui e vendas", e mandou o contato pro orcamentos@. Ela achou que o Erick era
// COMPRADOR pedindo cotacao. E o desfecho logico do formato antigo: a mensagem
// abria com "Vi a X no Google" (elogio ao que ELES fabricam) e so no terceiro
// bloco aparecia que isso e sobre pagina. No WhatsApp de industria, elogio ao
// produto do outro le como cliente entrando em contato.
//
// A correcao NAO e cortar o elogio: ele existe porque listar defeito do site pega
// o ego do dono e fecha a porta. E dizer QUEM FALA antes de dizer o que se viu.
// Vizinho fala com vizinho: a abertura diz de onde ele e antes de qualquer pedido.
// {{nicho}} vem de nichoDoSegmento(). Quando ele volta vazio sobra "presença digital ."
// com espaco antes do ponto, entao a limpeza tem que acontecer aqui e nao no template.
function aplicarNicho(template, seg) {
  return template.replaceAll('{{nicho}}', nichoDoSegmento(seg)).replace(/\s+\./g, '.');
}

function aberturaLocal(variante, seg) {
  return aplicarNicho(SALES_PLAYBOOK.experiment.localOpenings[variante === 'B' ? 'B' : 'A'], seg);
}

// Vizinho de regiao, nao de cidade. Usada so quando ehRegional() e verdadeiro: ver
// CIDADES_REGIAO acima para o motivo de nao aplicar isso em lead nacional.
function aberturaRegional(variante, seg) {
  return aplicarNicho(SALES_PLAYBOOK.experiment.regionalOpenings[variante === 'B' ? 'B' : 'A'], seg);
}

// Teste A/B da abertura (31/07). A = saudacao atual, ja com 1 resposta em 7 disparos.
// B = sem "tudo bem?", mais direto, mas mantendo o nome: numero desconhecido sem
// identificacao aumenta denuncia. Alterna por empresa para dar leitura comparavel.
// A declaracao de papel entra nas DUAS variantes, para nao contaminar o teste.
function abertura(variante, seg) {
  return aplicarNicho(SALES_PLAYBOOK.experiment.openings[variante === 'B' ? 'B' : 'A'], seg);
}

// Segmento pelo nome da empresa. Serve para elogiar com a palavra certa e para
// calibrar a promessa: industria de componente nao se convence com "mais cliente
// no WhatsApp", ela se convence com cotacao chegando pronta.
const SEGMENTOS = [
  { re: /usinagem|torno|ferramentaria|precis[aã]o|cnc/i, nome: 'usinagem', b2b: true,
    prova: 'peça usinada sob desenho' },
  { re: /caldeiraria|estrutura|solda|metal[uú]rgic|serralheria/i, nome: 'caldeiraria', b2b: true,
    prova: 'caldeiraria e estrutura' },
  // Radical curto de proposito: "manuten[cç][aã]o" casava "manutenção" e perdia
  // "manutenções", que e como boa parte das empresas se chama. Lead sem segmento
  // canonico entra no CRM mas fica invisivel para a fila de disparo.
  { re: /manuten|industrial|mec[aâ]nic/i, nome: 'manutencao', b2b: true,
    prova: 'manutenção industrial' },
  { re: /automa|el[eé]tric|painel|comando/i, nome: 'automacao', b2b: true,
    prova: 'automação e elétrica industrial' },
  { re: /refrigera|climatiza|ar.condicionado|exaust/i, nome: 'climatizacao', b2b: false,
    prova: 'climatização e refrigeração' },
  // Saude entrou na base em 09/2026 (odontologia e radiologia odontologica). Precisa
  // existir como segmento por um motivo so: a declaracao de papel. Clinica que recebe
  // "trabalho com presenca digital de industria" le disparo em massa e encerra ali.
  // semProva: o ramo nao tem substantivo que encaixe depois de "em" nem de "precisa de".
  // Sem essa marca sai "o tamanho do trabalho de voces em o atendimento de voces".
  { re: /odonto|dent[ií]st|cl[ií]nic|radiolog|consult[oó]rio|sa[uú]de|m[eé]dic/i, nome: 'saude', b2b: false,
    nicho: 'de clínica', prova: 'o atendimento de vocês', semProva: true },
];

// Declaracao de papel por nicho. Vazio cai em "trabalho com presenca digital." — sem
// qualificador e melhor que com o qualificador errado.
function nichoDoSegmento(seg) {
  if (seg.nicho) return seg.nicho;
  return seg.nome === 'geral' ? '' : 'de indústria';
}

function detectarSegmento(empresa) {
  return SEGMENTOS.find((s) => s.re.test(empresa))
    || { nome: 'geral', b2b: true, prova: 'o serviço de vocês', semProva: true };
}

// Friccao como HIPOTESE, nao como promessa (v3, 31/08). Ate a v2 esta frase afirmava o
// resultado ("o pedido chega com o escopo ja definido"), o que e vender antes de o lead
// reconhecer que tem o problema. Agora ela descreve o que costuma acontecer no ramo e
// deixa o dono confirmar ou corrigir na resposta.
// B2B industrial fala de processo comercial; local fala de contato.
function hipoteseDeFriccao(seg) {
  return seg.b2b
    ? 'boa parte do tempo do orçamento vai embora descobrindo o que o cliente precisa'
    : 'boa parte da conversa vai embora descobrindo o que o cliente precisa';
}

// O detalhe que torna a hipotese concreta. Separado por segmento porque "material,
// medida e prazo" e vocabulario de quem fabrica sob desenho: mandar isso para
// climatizacao entrega que a mensagem e template, e o dono le como disparo em massa.
function detalheDaFriccao(seg) {
  return seg.b2b
    ? 'Material, medida e prazo saem na conversa, não antes dela.'
    : 'O serviço, o local e a urgência saem na conversa, não antes dela.';
}

// wa.me, perfil de rede social e encurtador NAO sao site. Contar como site faz a
// copy abrir com "passei pelo site de voces" para quem nao tem site nenhum — o
// lead confere em dois segundos e a mensagem morre ali, junto com a credibilidade.
const NAO_E_SITE = /wa\.me|api\.whatsapp|instagram\.com|facebook\.com|fb\.me|linktr\.ee|linktree|bit\.ly|encurtador|maps\.google|goo\.gl|business\.site\/?$/i;
function ehSiteProprio(url) {
  const u = String(url || '').trim();
  return Boolean(u) && !NAO_E_SITE.test(u);
}

// Prova social do Maps so entra com amostra que sustenta a frase. "5 estrelas com
// 1 avaliação no Maps é operação de verdade, com cliente que volta" diz o contrario
// do que quer dizer: uma avaliacao nao mostra cliente que volta.
const MINIMO_AVALIACOES = 5;

function gerarCopy({ empresa, temSite, mapsInfo, cidade, variante, mecanismo = 'indicacao' }) {
  const seed = [...empresa].reduce((a, c) => a + c.charCodeAt(0), 0);
  const seg = detectarSegmento(empresa);
  const ab = variante || (seed % 2 === 0 ? 'A' : 'B');
  // Lead da mesma cidade recebe a versao com nome e cidade do case. Prova local
  // e mais forte que prova generica, e nao custa nada: os dois cases sao daqui.
  // v4: quem e da regiao mas nao da cidade fica no degrau do meio; nacional nao
  // recebe marca geografica nenhuma. Ver CIDADES_REGIAO.
  const local = ehLocal(cidade);
  const regional = !local && ehRegional(cidade);
  const OI = local ? aberturaLocal(ab, seg) : regional ? aberturaRegional(ab, seg) : abertura(ab, seg);
  // v3: o fecho e pergunta, nao CTA. O case (ctaLocal/ctaDoSegmento) so aparece no M1,
  // depois que o lead reconhece a friccao — ver followups no sales-playbook.json.
  // v4: com site, o eixo padrao passou a ser a indicacao. mecanismo:'friccao' volta
  // ao eixo de orcamento da v3 sem precisar editar o gerador.
  const usaIndicacao = mecanismo !== 'friccao';
  const PERGUNTA = !temSite
    ? PERGUNTA_SEM_SITE
    : usaIndicacao
      ? PERGUNTA_INDICACAO
      : perguntaDeReconhecimento(seg);
  // O bloco 2 ja nomeou o ramo ("...o tamanho do trabalho de voces em peca usinada sob
  // desenho"). Repetir a mesma expressao no bloco seguinte soa robotico e entrega o
  // template, entao aqui a referencia e por demonstrativo. Segmento 'geral' nao tem ramo
  // nomeavel — prova = "o servico de voces" —, entao descreve o comportamento.
  const comQuem = seg.nome === 'geral' ? 'quem atende pedido sob orçamento' : 'quem trabalha nesse ramo';
  // Nome comercial gigante repetido inteiro soa robotico. Regra em lib/nomeEmpresa.
  const nomeCurto = nomeDaEmpresa(empresa);
  // Se a abertura ja disse "de Monlevade mesmo", repetir a cidade no elogio soa robotico.
  const ondeLocal = cidade && !local ? `, em ${cidade}` : '';
  // Aposto tem que FECHAR com virgula: sem isso sai "site da X, em Joinville e da
  // pra ver", que le como frase truncada.
  const fechaAposto = ondeLocal ? ',' : '';
  // Segmento 'geral' tem prova = "o servico de voces", que nao encaixa depois de
  // "em": sairia "o tamanho do trabalho de voces em o servico de voces". Erro de
  // portugues indo pro lead, justamente vendendo pagina.
  const emProva = seg.semProva ? '' : ` em ${seg.prova}`;

  // FORMATO CANONICO v3 (31/08): 4 blocos curtos, um degrau de consciencia por vez.
  // 1) quem fala, papel declarado          2) sinal concreto, sempre positivo
  // 3) friccao como HIPOTESE, nao promessa 4) pergunta que o lead responde sem se expor
  // PROIBIDO: apontar o que falta no site do lead (pega o ego do dono na hora) e fechar
  // com oferta — o lead ainda nao disse que tem o problema.
  if (!temSite) {
    // P5 (24/09/2026): "operacao de verdade" e elogio generico, bloqueado pelo gate de texto.
    // Fica a observacao que da pra provar (o Maps), sem adjetivo.
    const prova = mapsInfo
      ? `Vi a ${nomeCurto} no Google${ondeLocal}: ${mapsInfo} no Maps, com cliente que volta.`
      : `Vi a ${nomeCurto} no Google${ondeLocal}.`;
    // Mesma armadilha do emProva acima, do outro lado do gerador: 'geral' nao tem
    // substantivo que encaixe depois de "precisa de", sairia "quem precisa de o
    // servico de voces". Sem segmento nomeavel, vai a ponte que nao nomeia nada.
    // ANTI-INVENCAO: a ponte descreve o caminho do comprador, nunca afirma que o lead
    // esta perdendo cliente. Perda sem prova e a acusacao que fecha a porta.
    const ponte = seg.semProva
      ? `Hoje quem procura vocês costuma pesquisar antes de ligar, e sem uma página própria essa pessoa junta a informação em outro canal.`
      : `Hoje quem precisa de ${seg.prova} costuma pesquisar antes de ligar, e sem uma página própria essa pessoa junta a informação em outro canal.`;
    return `${OI}\n\n${prova}\n\n${ponte}\n\n${PERGUNTA}`;
  }

  const ponteComSite = usaIndicacao
    ? PONTE_INDICACAO
    : `Uma coisa que escuto direto de ${comQuem}: ${hipoteseDeFriccao(seg)}. ${detalheDaFriccao(seg)}`;

  return `${OI}\n\nPassei pelo site da ${nomeCurto}${ondeLocal}${fechaAposto} e dá pra ver o tamanho do trabalho de vocês${emProva}.\n\n${ponteComSite}\n\n${PERGUNTA}`;
}

function gerarCopyAntiga({ empresa, temSite, mapsInfo, cidade }) {
  const seed = [...empresa].reduce((a, c) => a + c.charCodeAt(0), 0);

  if (!temSite) {
    // Template A - sem_site_ativo: eixo = comportamento do comprador
    const prova = mapsInfo
      ? `Vi a ${empresa} no Google${cidade ? `, em ${cidade}` : ''}. ${mapsInfo} no Maps é prova de operação real.`
      : `Vi a ${empresa} no Google${cidade ? `, em ${cidade}` : ''}.`;
    const pontos = [
      'O ponto é: hoje até quem chega por indicação pesquisa a empresa antes de ligar. Quando o comprador só encontra o Maps, a conversa esfria antes do primeiro contato.',
      'O ponto é: o comprador industrial valida a empresa no Google antes de pedir orçamento. Se ele não encontra nada além do Maps, ele segue pro próximo da lista.',
    ];
    return `Oi, tudo bem? Erick aqui.\n\n${prova}\n\n${pontos[seed % pontos.length]}\n\n${CTA_FINAL}`;
  }

  // Template D - site_auditar: valida a decisao do dono, aponta UM ponto,
  // sempre em termos do que o comprador encontra (nunca design/plataforma)
  const problemas = [
    'quem abre o site precisa encontrar prova da capacidade de vocês nos primeiros segundos, e esse é o ponto que eu reforçaria',
    'o comprador que já quer orçamento precisa de um caminho direto pra pedir, sem ter que procurar contato pela página',
    'a reputação que vocês têm no mercado ainda não aparece ali como prova comercial pra quem nunca ouviu falar de vocês',
  ];
  return `Oi, tudo bem? Erick aqui.\n\nDei uma olhada no site da ${empresa}, do jeito que um comprador industrial olha antes de pedir orçamento. O site cobre o básico. O ponto de atenção é um só: ${problemas[seed % problemas.length]}.\n\nEm industrial, o comprador decide em poucos segundos se liga ou segue pro próximo resultado.\n\n${CTA_FINAL}`;
}

// Reaproveitado por scripts/generate-copies-db.mjs, que gera copy para lead que entrou
// pela puxada por cidade e por isso NAO tem pagina de auditoria em huberick-temp.
module.exports = { gerarCopy, detectarSegmento, ehLocal, ehRegional, ehSiteProprio, SEGMENTOS, MINIMO_AVALIACOES, NOTA_MINIMA };

// ─── MAIN ─────────────────────────────────────────────────────────────────────
// So roda a varredura de arquivos quando chamado direto na linha de comando.
if (require.main !== module) return;

const arquivos = fs.readdirSync(LEADS_DIR)
  .filter(f => f.endsWith('.html') && f.toLowerCase() !== 'index.html')
  .slice(0, LIMIT);

console.log(`\n📋 Total de arquivos encontrados: ${arquivos.length}`);
console.log(`📍 Base URL: ${BASE_URL}`);
console.log(DRY_RUN ? '🔍 MODO DRY-RUN — nada sera salvo\n' : '✍️  Salvando copies...\n');

let gerados = 0;
let erros   = 0;

for (const arquivo of arquivos) {
  try {
    const htmlPath  = path.join(LEADS_DIR, arquivo);
    const copyPath  = path.join(LEADS_DIR, arquivo.replace('.html', '_copy.txt'));
    const html      = fs.readFileSync(htmlPath, 'utf8');

    const empresa     = extrairEmpresa(html);
    const temSite     = extrairTemSite(html);
    const mapsInfo    = extrairMapsInfo(html);
    const cidade      = extrairCidade(html);

    const copy = gerarCopy({ empresa, temSite, mapsInfo, cidade });

    if (DRY_RUN) {
      console.log(`\n── ${arquivo} ──`);
      console.log(copy);
    } else {
      fs.writeFileSync(copyPath, copy, 'utf8');
      process.stdout.write(`✅ ${arquivo.replace('.html', '')}\n`);
    }
    gerados++;
  } catch (err) {
    console.error(`❌ Erro em ${arquivo}: ${err.message}`);
    erros++;
  }
}

console.log(`\n🏁 Concluído: ${gerados} copies geradas, ${erros} erros.`);
