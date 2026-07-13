const fs = require('fs');
const path = require('path');

// =============================================================================
// build.js — Story 009: legado aposentado em 2026-07-07
//
// O stack legado (index.html + modules/*.html + js/supabase-client.js) foi
// movido para /legacy. Este script não gera mais esses artefatos.
// O único CRM ativo é o Next.js em /src, com rotas server-side para o Supabase.
// =============================================================================

// 1. Copiar paginas de diagnostico para public/ e injetar tracking de Pixel/CAPI.
const diagnosticsSourceDir = path.join(__dirname, '../huberick-temp');
const diagnosticsTargetDir = path.join(__dirname, '../public/huberick-temp');
const ostrackDefaultSalesUrl = 'https://o-strackpagina.vercel.app/';
const ostrackSalesUrl = process.env.OSTRACK_SALES_URL || ostrackDefaultSalesUrl;
const ostrackUtm = 'utm_source=diagnostico&utm_medium=cta&utm_campaign=crm-erick';
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.FACEBOOK_PIXEL_ID || process.env.META_DATASET_ID || '1175331711422463';
const metaPixelSnippet = metaPixelId
  ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');</script>`
  : '';
const trackingSnippet = `${metaPixelSnippet}<script src="/diagnostico-pixel.js" defer></script>`;

function buildOstrackCtaUrl() {
  const separator = ostrackSalesUrl.includes('?') ? '&' : '?';
  return `${ostrackSalesUrl}${separator}${ostrackUtm}`;
}

function createOstrackCtaBlock() {
  const href = buildOstrackCtaUrl();
  return `
<section class="diagnostico-ostrack-cta" aria-label="Conheca o OStrack" style="margin:2rem 0 0;padding:1.35rem;border:1px solid rgba(16,185,129,.28);border-radius:18px;background:linear-gradient(135deg,rgba(16,185,129,.12),rgba(59,130,246,.1));box-shadow:0 12px 32px rgba(0,0,0,.25)">
  <p style="margin:0 0 .35rem;color:#34D399;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em">Conhece o OStrack?</p>
  <h3 style="margin:0 0 .5rem;color:#fff;font-size:1.18rem;line-height:1.25">O sistema de OS que roda na industria.</h3>
  <p style="margin:0 0 1rem;color:var(--tx2,#8F8FA3);font-size:.94rem;line-height:1.55">Organize ordens de servico, prazos e historico tecnico sem planilha solta.</p>
  <a href="${href}" target="_blank" rel="noopener noreferrer" data-diagnostico-event="DiagnosticoOStrackClick" class="diagnostico-ostrack-cta__button" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.82rem 1.15rem;border-radius:12px;background:#10B981;color:#04110c;text-decoration:none;font-weight:800;box-shadow:0 10px 24px rgba(16,185,129,.28)">Ver pagina do OStrack</a>
</section>`;
}

function injectOstrackCta(html) {
  if (html.includes('diagnostico-ostrack-cta')) return html;

  const ctaBlock = createOstrackCtaBlock();
  const beforeFloatingWhatsapp = '\n</div>\n<a class="wa-float"';
  if (html.includes(beforeFloatingWhatsapp)) {
    return html.replace(beforeFloatingWhatsapp, `${ctaBlock}${beforeFloatingWhatsapp}`);
  }

  return html.includes('</body>')
    ? html.replace('</body>', `${ctaBlock}\n</body>`)
    : `${html}\n${ctaBlock}`;
}

function copyDiagnosticsWithTracking() {
  if (!fs.existsSync(diagnosticsSourceDir)) return;
  fs.mkdirSync(diagnosticsTargetDir, { recursive: true });
  const files = fs.readdirSync(diagnosticsSourceDir).filter((file) => file.endsWith('.html'));

  for (const file of files) {
    const source = path.join(diagnosticsSourceDir, file);
    const target = path.join(diagnosticsTargetDir, file);
    let html = fs.readFileSync(source, 'utf8');

    if (!html.includes('/diagnostico-pixel.js')) {
      html = html.includes('</head>')
        ? html.replace('</head>', `${trackingSnippet}</head>`)
        : `${trackingSnippet}\n${html}`;
    }

    html = injectOstrackCta(html);

    fs.writeFileSync(target, html, 'utf8');
  }

  console.log(`[Build] ${files.length} paginas de diagnostico copiadas para public/huberick-temp com tracking.`);

  // Copia assets (foto de autoridade etc.) — sem isso a foto do Erick da 404 e cai no
  // fallback do anel gradiente. As paginas referenciam ./assets/erick.png (relativo).
  const assetsSource = path.join(diagnosticsSourceDir, 'assets');
  if (fs.existsSync(assetsSource)) {
    fs.cpSync(assetsSource, path.join(diagnosticsTargetDir, 'assets'), { recursive: true });
    console.log('[Build] pasta assets/ copiada para public/huberick-temp/assets.');
  }
}

copyDiagnosticsWithTracking();
