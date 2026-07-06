const fs = require('fs');
const path = require('path');

// 1. Gerar js/supabase-client.js
const supabaseUrl = process.env.SUPABASE_URL || 'https://rezgkabwxxltpprpvdua.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_xGIK0X5KEuzmIBftq4DJJA_gfxJmgik';

const supabaseClientContent = `/* =============================================================================
   supabase-client.js  —  Gerado dinamicamente no Build.
   ============================================================================= */

window.SUPABASE_URL = '${supabaseUrl}';
window.SUPABASE_KEY = '${supabaseKey}';

// Inicializa o client global
window.sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

// Helpers
window.sbGetDeals = async function(stage = null) {
  let query = window.sb.from('deals').select('*').order('created_at', { ascending: false });
  if (stage) query = query.eq('stage', stage);
  const { data, error } = await query;
  if (error) { console.error('[sb] deals error:', error.message); return []; }
  return data;
};

window.sbUpdateDealStage = async function(id, stage) {
  const { error } = await window.sb.from('deals').update({ stage }).eq('id', id);
  if (error) console.error('[sb] update stage error:', error.message);
  return !error;
};

window.sbGetContacts = async function(status = null) {
  let query = window.sb.from('contacts').select('*').order('name');
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) { console.error('[sb] contacts error:', error.message); return []; }
  return data;
};

window.sbLogMessage = async function(msg) {
  const { data, error } = await window.sb.from('messages').insert({
    ...msg,
    sent_at: msg.status === 'sent' ? new Date().toISOString() : null,
  });
  if (error) console.error('[sb] log message error:', error.message);
  return data;
};

window.sbGetCopyText = async function(dealId) {
  const { data, error } = await window.sb.from('deals').select('copy_text, analysis_url, company').eq('id', dealId).single();
  if (error) return null;
  return data;
};

window.sbCreateDeal = async function(deal) {
  const { data, error } = await window.sb.from('deals').insert(deal).select().single();
  if (error) { console.error('[sb] create deal error:', error.message); return null; }
  return data;
};

window.sbDeleteDeal = async function(id) {
  const { error } = await window.sb.from('deals').delete().eq('id', id);
  if (error) console.error('[sb] delete deal error:', error.message);
  return !error;
};

window.sbUpdateDeal = async function(id, updates) {
  const { error } = await window.sb.from('deals').update(updates).eq('id', id);
  if (error) console.error('[sb] update deal error:', error.message);
  return !error;
};

window.sbCreateContact = async function(contact) {
  const { data, error } = await window.sb.from('contacts').insert(contact).select().single();
  if (error) { console.error('[sb] create contact error:', error.message); return null; }
  return data;
};

window.sbUpdateContact = async function(id, updates) {
  const { error } = await window.sb.from('contacts').update(updates).eq('id', id);
  if (error) console.error('[sb] update contact error:', error.message);
  return !error;
};

window.sbDeleteContact = async function(id) {
  const { error } = await window.sb.from('contacts').delete().eq('id', id);
  if (error) console.error('[sb] delete contact error:', error.message);
  return !error;
};
`;

fs.writeFileSync(path.join(__dirname, '../js/supabase-client.js'), supabaseClientContent);
console.log('[Build] js/supabase-client.js gerado com sucesso.');

// 2. Gerar js/config.js para o legado sem embutir token real no bundle publico.
const igToken = process.env.IG_ACCESS_TOKEN || '';
const igAccountId = process.env.IG_BUSINESS_ACCOUNT_ID || '17841444737911156';

const configContent = `/* =============================================================================
   config.js  —  Gerado dinamicamente no Build.
   ============================================================================= */
window.IG_CONFIG = {
  ACCESS_TOKEN: '${igToken}',
  IG_BUSINESS_ACCOUNT_ID: '${igAccountId}',
  API_VERSION: 'v21.0',
  REFRESH_INTERVAL_MS: 600000,
};
`;

fs.writeFileSync(path.join(__dirname, '../js/config.js'), configContent);
console.log('[Build] js/config.js gerado com sucesso.');

// 3. Copiar paginas de diagnostico para public/ e injetar tracking de Pixel/CAPI.
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
