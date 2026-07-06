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
 * Gera o texto de copy personalizado para a empresa.
 */
function gerarCopy({ empresa, siteUrl, sabotadores, score, linkAnalise, mapsInfo }) {
  // Se tem sabotadores, significa que tem site (Caminho A - Site Ruim)
  if (sabotadores.length > 0) {
    const aberturas = [
      `Erick aqui — dei uma olhada no site da ${empresa}.`,
      `Fala! Analisei o site da ${empresa} essa semana.`,
      `Erick aqui. Passei pelo site da ${empresa} e vi alguns gargalos.`,
    ];
    const seed = empresa.charCodeAt(0) % aberturas.length;
    const abertura = aberturas[seed];

    const pontos = sabotadores.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const blocoSabotadores = `\nOs pontos que estao custando contrato pra voces hoje:\n${pontos}\n`;

    let scoreContext = '';
    if (score !== null && score !== undefined) {
      if (score === 0) {
        scoreContext = 'O site zerou no indice de conversao — significa que o comprador sai sem confiar.\n';
      } else {
        scoreContext = `O site marcou ${score}/10 no indice de conversao.\n`;
      }
    }

    const cta = `Montei um relatorio visual com o que eu faria pra transformar isso:\n${linkAnalise}\n\nSe quiser resolver, falo em 15 minutos o que muda.`;
    return `${abertura}\n${blocoSabotadores}\n${scoreContext}${cta}`;
  } else {
    // Não tem site (Caminho B - Sem Site)
    const aberturas = [
      `Erick aqui. Dei uma olhada na presenca digital da ${empresa}.`,
      `Fala! Analisei a presenca online da ${empresa} esta semana.`,
      `Erick aqui. Passei pela presenca digital da ${empresa} e anotei um ponto importante.`,
    ];
    const seed = empresa.charCodeAt(0) % aberturas.length;
    const abertura = aberturas[seed];

    const mapsContext = mapsInfo 
      ? `Voces tem uma reputacao forte no Google Maps (${mapsInfo}), mas nao tem um site ativo.\n`
      : `Voces tem uma reputacao fisica forte, mas nao tem um site ativo hoje.\n`;

    const problema = `Isso significa que quando um comprador te procura no Google ou quer validar o contrato de voces, ele nao encontra nada e voces acabam perdendo a venda para concorrentes menores.\n`;
    const cta = `Desenhei um prototipo visual de como seria o site ideal de voces:\n${linkAnalise}\n\nSe quiser estruturar isso em poucos dias, me avisa.`;
    
    return `${abertura}\n\n${mapsContext}${problema}\n${cta}`;
  }
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
    const siteUrl     = extrairSiteUrl(html);
    const sabotadores = extrairSabotadores(html);
    const score       = extrairScore(html);
    const mapsInfo    = extrairMapsInfo(html);
    const linkAnalise = `${BASE_URL}${encodeURIComponent(arquivo)}`;

    const copy = gerarCopy({ empresa, siteUrl, sabotadores, score, linkAnalise, mapsInfo });

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
