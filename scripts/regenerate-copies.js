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

/**
 * Extrai informações do Google Maps (nota e número de avaliações)
 */
function extrairMapsInfo(html) {
  const m = html.match(/Google Maps \(([^)]+)\)/i);
  // A pagina de auditoria grava "avaliacoes" sem acento; na mensagem sai com acento
  // e no singular quando for uma so ("com 1 avaliações" denuncia texto automatico).
  if (!m) return null;
  return m[1].trim()
    .replace(/avaliacoes/gi, 'avaliações')
    .replace(/\b1 avaliações\b/, '1 avaliação');
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
 * - Fecha SEMPRE com o CTA canonico (CTA_FINAL): nomeia o que chega na msg 2
 *   (o exemplo de cliente real) e pede so um "quer ver?" — nunca "pode ser?"
 */
// CTA canonico da mensagem 1 (decidido por Erick 2026-07-30). Nomeia o que chega
// depois do "sim" (exemplo de cliente real, ex.: sitejotta.vercel.app) e pede um
// sim barato. NAO usar "pode ser?" — soa hesitante e nao diz o que o lead recebe.
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

function ctaLocal(seg) {
  return `Fiz ${CASE_LOCAL[seg.nome] || CASE_LOCAL.geral}. Quer ver como ficou?`;
}

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
function aberturaLocal(variante) {
  return SALES_PLAYBOOK.experiment.localOpenings[variante === 'B' ? 'B' : 'A'];
}

// Teste A/B da abertura (31/07). A = saudacao atual, ja com 1 resposta em 7 disparos.
// B = sem "tudo bem?", mais direto, mas mantendo o nome: numero desconhecido sem
// identificacao aumenta denuncia. Alterna por empresa para dar leitura comparavel.
// A declaracao de papel entra nas DUAS variantes, para nao contaminar o teste.
function abertura(variante) {
  return SALES_PLAYBOOK.experiment.openings[variante === 'B' ? 'B' : 'A'];
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
];

function detectarSegmento(empresa) {
  return SEGMENTOS.find((s) => s.re.test(empresa)) || { nome: 'geral', b2b: true, prova: 'o serviço de vocês' };
}

// Promessa calibrada. B2B industrial fala de processo comercial; local fala de contato.
function promessa(seg) {
  return seg.b2b
    ? 'o pedido chega com o escopo já definido, em vez de virar troca de mensagem'
    : 'o cliente chama no WhatsApp já dizendo o que precisa';
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

function gerarCopy({ empresa, temSite, mapsInfo, cidade, variante }) {
  const seed = [...empresa].reduce((a, c) => a + c.charCodeAt(0), 0);
  const seg = detectarSegmento(empresa);
  const ab = variante || (seed % 2 === 0 ? 'A' : 'B');
  // Lead da mesma cidade recebe a versao com nome e cidade do case. Prova local
  // e mais forte que prova generica, e nao custa nada: os dois cases sao daqui.
  const local = ehLocal(cidade);
  const OI = local ? aberturaLocal(ab) : abertura(ab);
  const CTA = local ? ctaLocal(seg) : ctaDoSegmento(seg);
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
  const emProva = seg.nome === 'geral' ? '' : ` em ${seg.prova}`;

  // FORMATO CANONICO (decidido 30/07): 4 blocos curtos.
  // 1) elogio ancorado em fato verificavel  2) o que da pra somar, sempre positivo
  // 3) promessa calibrada pelo porte        4) CTA que nomeia o que chega depois do sim
  // PROIBIDO: apontar o que falta no site do lead. Isso pega o ego do dono na hora.
  if (!temSite) {
    const prova = mapsInfo
      ? `Vi a ${nomeCurto} no Google${ondeLocal}. ${mapsInfo} no Maps é operação de verdade, com cliente que volta.`
      : `Vi a ${nomeCurto} no Google${ondeLocal}, e dá pra ver que é operação de verdade.`;
    // Mesma armadilha do emProva acima, do outro lado do gerador: 'geral' nao tem
    // substantivo que encaixe depois de "precisa de", sairia "quem precisa de o
    // servico de voces". Sem segmento nomeavel, vai a ponte que nao nomeia nada.
    const ponte = seg.nome === 'geral'
      ? `Hoje o comprador pesquisa antes de ligar. Uma página simples põe vocês na frente dele nessa hora.`
      : [
          `Hoje quem precisa de ${seg.prova} pesquisa antes de ligar, e quem aparece nessa hora entra na cotação.`,
          `Hoje o comprador pesquisa antes de ligar. Uma página simples põe vocês na frente dele nessa hora.`,
        ][seed % 2];
    return `${OI}\n\n${prova}\n\n${ponte} E ${promessa(seg)}.\n\n${CTA}`;
  }

  return `${OI}\n\nPassei pelo site da ${nomeCurto}${ondeLocal}${fechaAposto} e dá pra ver o tamanho do trabalho de vocês${emProva}.\n\nA prova que vocês já têm está espalhada. Reunida numa página, ela trabalha na hora em que o comprador decide, e ${promessa(seg)}.\n\n${CTA}`;
}

function gerarCopyAntiga({ empresa, temSite, mapsInfo, cidade }) {
  const seed = [...empresa].reduce((a, c) => a + c.charCodeAt(0), 0);

  if (!temSite) {
    // Template A - sem_site_ativo: eixo = comportamento do comprador
    const prova = mapsInfo
      ? `Vi a ${empresa} no Google${cidade ? `, em ${cidade}` : ''}. ${mapsInfo} no Maps é prova de operação real.`
      : `Vi a ${empresa} no Google${cidade ? `, em ${cidade}` : ''}, e parece uma operação de verdade.`;
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
module.exports = { gerarCopy, detectarSegmento, ehLocal, ehSiteProprio, SEGMENTOS, MINIMO_AVALIACOES };

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
