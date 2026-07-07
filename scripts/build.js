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
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.FACEBOOK_PIXEL_ID || process.env.META_DATASET_ID || '1175331711422463';
const metaPixelSnippet = metaPixelId
  ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');</script>`
  : '';
const trackingSnippet = `${metaPixelSnippet}<script src="/diagnostico-pixel.js" defer></script>`;

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

    fs.writeFileSync(target, html, 'utf8');
  }

  console.log(`[Build] ${files.length} paginas de diagnostico copiadas para public/huberick-temp com tracking.`);
}

copyDiagnosticsWithTracking();
