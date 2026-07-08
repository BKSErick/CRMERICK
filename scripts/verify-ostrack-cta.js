const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIAGNOSTICS_DIR = path.join(ROOT, 'public', 'huberick-temp');
const BUILD_SCRIPT = path.join(ROOT, 'scripts', 'build.js');
const PIXEL_SCRIPT = path.join(ROOT, 'public', 'diagnostico-pixel.js');
const REQUIRED_UTM = 'utm_source=diagnostico&utm_medium=cta&utm_campaign=crm-erick';

function fail(message) {
  console.error(`[verify-ostrack-cta] ${message}`);
  process.exit(1);
}

function assertContains(haystack, needle, context) {
  if (!haystack.includes(needle)) fail(`${context} não contém: ${needle}`);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

if (!fs.existsSync(PUBLIC_DIAGNOSTICS_DIR)) {
  fail('public/huberick-temp não existe; rode npm run build antes da verificação.');
}

const samples = fs
  .readdirSync(PUBLIC_DIAGNOSTICS_DIR)
  .filter((file) => file.endsWith('.html'))
  .slice(0, 3);

if (samples.length < 3) fail('menos de 3 páginas HTML geradas para amostragem.');

const buildSource = read(BUILD_SCRIPT);
assertContains(buildSource, 'OSTRACK_SALES_URL', 'scripts/build.js');
assertContains(buildSource, 'DiagnosticoOStrackClick', 'scripts/build.js');
assertContains(buildSource, REQUIRED_UTM, 'scripts/build.js');

const pixelSource = read(PIXEL_SCRIPT);
assertContains(pixelSource, 'DiagnosticoOStrackClick', 'public/diagnostico-pixel.js');
assertContains(pixelSource, 'data-diagnostico-event', 'public/diagnostico-pixel.js');

for (const sample of samples) {
  const html = read(path.join(PUBLIC_DIAGNOSTICS_DIR, sample));
  assertContains(html, 'diagnostico-ostrack-cta', sample);
  assertContains(html, 'Conhece o OStrack?', sample);
  assertContains(html, 'DiagnosticoOStrackClick', sample);
  assertContains(html, REQUIRED_UTM, sample);
}

console.log(`[verify-ostrack-cta] OK: CTA OStrack validado em ${samples.join(', ')}`);
