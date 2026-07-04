/* =============================================================================
   config.example.js  —  TEMPLATE (este é commitado; o real vai em config.js)
   -----------------------------------------------------------------------------
   1. Copie este arquivo para  js/config.js
   2. Preencha IG_ACCESS_TOKEN com um token long-lived do Meta Graph
   3. config.js está no .gitignore — NUNCA é commitado (contém segredo)
   ============================================================================= */
window.IG_CONFIG = {
  // Token de acesso do Meta Graph (long-lived / page token de preferência)
  ACCESS_TOKEN: 'COLE_SEU_TOKEN_AQUI',

  // ID numérico da conta Instagram Business (NÃO é o @usuario)
  IG_BUSINESS_ACCOUNT_ID: '17841444737911156', // @euericksena

  // Versão da Graph API
  API_VERSION: 'v21.0',

  // Intervalo de auto-atualização (ms). 10 min = 600000
  REFRESH_INTERVAL_MS: 600000,
};
