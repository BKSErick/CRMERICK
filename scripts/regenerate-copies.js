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
  return m ? m[1].trim() : null;
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
 * - Fecha com pergunta de baixo custo ("posso te mandar?")
 */
function gerarCopy({ empresa, temSite, mapsInfo, cidade }) {
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
    return `Oi, tudo bem? Erick aqui.\n\n${prova}\n\n${pontos[seed % pontos.length]}\n\nPosso te mandar um exemplo rápido de como uma página simples muda esse cenário? Sem compromisso.`;
  }

  // Template D - site_auditar: valida a decisao do dono, aponta UM ponto,
  // sempre em termos do que o comprador encontra (nunca design/plataforma)
  const problemas = [
    'quem abre o site precisa encontrar prova da capacidade de vocês nos primeiros segundos, e esse é o ponto que eu reforçaria',
    'o comprador que já quer orçamento precisa de um caminho direto pra pedir, sem ter que procurar contato pela página',
    'a reputação que vocês têm no mercado ainda não aparece ali como prova comercial pra quem nunca ouviu falar de vocês',
  ];
  return `Oi, tudo bem? Erick aqui.\n\nDei uma olhada no site da ${empresa}, do jeito que um comprador industrial olha antes de pedir orçamento. O site cobre o básico. O ponto de atenção é um só: ${problemas[seed % problemas.length]}.\n\nEm industrial, o comprador decide em poucos segundos se liga ou segue pro próximo resultado.\n\nPosso te mandar um diagnóstico visual rápido do que eu ajustaria? Leitura de 2 minutos.`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
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
