import os

path = r'C:\Users\User\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\0aca71f8-e120-4e50-9a7a-1e33d7289d37\north-star.html'

content = r'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>North Star — Hub Operacional</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Sometype+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="hub.css" />
<style>
:root {
  --shadow-subtle: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06);
  --shadow-card: 0 1px 4px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
:focus-visible { outline: 2px solid var(--color-brand-violet); outline-offset: 2px; border-radius: 4px; }
::selection { background: rgba(123,104,238,0.15); color: var(--color-midnight-ink); }
.sec { margin-bottom: 44px; }
.sec-header { margin-bottom: 20px; }
.sec-title { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.sec-subtitle { font-size: 13px; font-family: var(--font-inter); color: var(--color-slate); margin-top: 3px; line-height: 1.5; }
.focus-block { background: var(--color-pure-white); border: 1px solid var(--color-cloud); border-radius: 14px; padding: 32px 36px; transition: box-shadow var(--duration-fast) var(--ease-out); }
.focus-block:hover { box-shadow: var(--shadow-card); }
.focus-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-family: var(--font-inter); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; padding: 4px 12px; border-radius: 999px; background: rgba(123,104,238,0.1); color: var(--color-brand-violet); margin-bottom: 18px; }
.focus-tag svg { width: 12px; height: 12px; }
.focus-primary { display: grid; grid-template-columns: 1fr 1fr; gap: 24px 40px; margin-bottom: 24px; }
.focus-main { grid-column: 1 / -1; }
.focus-label { font-size: 10px; font-family: var(--font-inter); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-slate); font-weight: 500; margin-bottom: 6px; }
.focus-headline { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.3; max-width: 640px; }
.focus-detail { font-size: 14px; font-family: var(--font-inter); color: var(--color-charcoal); line-height: 1.6; }
.focus-item-value { font-size: 15px; font-weight: 600; color: var(--color-midnight-ink); line-height: 1.4; margin-top: 4px; }
.focus-item-desc { font-size: 12px; font-family: var(--font-inter); color: var(--color-slate); margin-top: 2px; line-height: 1.5; }
.focus-divider { border: none; border-top: 1px solid var(--color-cloud); margin: 20px 0; }
.focus-move { display: flex; align-items: center; gap: 10px; padding: 14px 18px; background: var(--color-paper); border-radius: var(--radius-sm); border-left: 3px solid var(--color-brand-violet); }
.focus-move-label { font-size: 10px; font-family: var(--font-inter); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-slate); font-weight: 500; white-space: nowrap; flex-shrink: 0; }
.focus-move-text { font-size: 13px; font-weight: 500; color: var(--color-midnight-ink); font-family: var(--font-inter); }
.obj-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.obj-card { background: var(--color-pure-white); border: 1px solid var(--color-cloud); border-radius: var(--radius-card); padding: 22px 24px; transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out); cursor: default; }
.obj-card:hover { border-color: var(--color-brand-violet); box-shadow: var(--shadow-card); }
.obj-horizon { font-size: 10px; font-family: var(--font-inter); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 10px; }
.obj-horizon.short { color: var(--color-brand-violet); }
.obj-horizon.medium { color: var(--color-signal-blue); }
.obj-horizon.long { color: var(--color-success); }
.obj-card-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 8px; line-height: 1.4; }
.obj-card-desc { font-size: 13px; font-family: var(--font-inter); color: var(--color-charcoal); line-height: 1.5; margin-bottom: 14px; }
.obj-meta { display: flex; flex-direction: column; gap: 5px; padding-top: 12px; border-top: 1px solid var(--color-linen); }
.obj-meta-row { display: flex; align-items: center; gap: 8px; font-size: 11px; font-family: var(--font-inter); color: var(--color-slate); }
.obj-meta-row strong { color: var(--color-charcoal); font-weight: 600; }
.obj-impact { font-size: 13px; font-weight: 600; font-family: var(--font-mono); margin-top: 10px; padding: 6px 10px; background: var(--color-paper); border-radius: var(--radius-sm); }
.obj-impact.high { color: var(--color-brand-violet); }
.obj-impact.medium { color: var(--color-signal-blue); }
.obj-impact.positive { color: var(--color-success); }
.anti-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.anti-card { background: var(--color-paper); border: 1px solid var(--color-cloud); border-radius: var(--radius-card); padding: 20px 22px; transition: border-color var(--duration-fast) var(--ease-out); cursor: default; }
.anti-card:hover { border-color: var(--color-brand-violet); }
.anti-icon { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; margin-bottom: 10px; }
.anti-icon svg { width: 13px; height: 13px; }
.anti-label { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 6px; }
.anti-desc { font-size: 12px; font-family: var(--font-inter); color: var(--color-charcoal); line-height: 1.5; }
.anti-reason { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-linen); font-size: 11px; font-family: var(--font-inter); color: var(--color-slate); }
.anti-reason strong { color: var(--color-charcoal); font-weight: 600; }
.bet-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.bet-card { background: var(--color-pure-white); border: 1px solid var(--color-cloud); border-radius: var(--radius-card); padding: 24px 26px; transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out); cursor: default; }
.bet-card:hover { border-color: var(--color-brand-violet); box-shadow: var(--shadow-card); }
.bet-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.bet-name { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.bet-tag { font-size: 10px; font-weight: 600; font-family: var(--font-mono); padding: 2px 10px; border-radius: 999px; white-space: nowrap; flex-shrink: 0; }
.bet-tag.high { background: rgba(46,125,50,0.1); color: var(--color-success); }
.bet-tag.medium { background: rgba(123,104,238,0.1); color: var(--color-brand-violet); }
.bet-tag.exploratory { background: rgba(0,145,255,0.1); color: var(--color-signal-blue); }
.bet-hypothesis { font-size: 13px; font-family: var(--font-inter); color: var(--color-charcoal); line-height: 1.6; margin-bottom: 16px; padding: 12px 14px; background: var(--color-paper); border-radius: var(--radius-sm); border-left: 3px solid var(--color-brand-violet); }
.bet-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.bet-metric-label { font-size: 10px; font-family: var(--font-inter); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-slate); font-weight: 500; margin-bottom: 3px; }
.bet-metric-value { font-size: 14px; font-weight: 600; color: var(--color-midnight-ink); }
.bet-metric-context { font-size: 11px; font-family: var(--font-inter); color: var(--color-slate); margin-top: 1px; }
.conf-bar { display: flex; align-items: center; gap: 6px; }
.conf-track { width: 48px; height: 4px; background: var(--color-cloud); border-radius: 999px; overflow: hidden; }
.conf-fill { height: 100%; border-radius: 999px; transition: width var(--duration-fast) var(--ease-out); }
.conf-fill.high { background: var(--color-success); }
.conf-fill.medium { background: var(--color-warning); }
.conf-fill.low { background: var(--color-slate); }
.conf-value { font-size: 11px; font-weight: 600; font-family: var(--font-mono); }
.risk-strat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.risk-strat-card { background: var(--color-pure-white); border: 1px solid var(--color-cloud); border-radius: var(--radius-card); padding: 20px 22px; transition: border-color var(--duration-fast) var(--ease-out); cursor: default; }
.risk-strat-card:hover { border-color: var(--color-brand-violet); }
.risk-strat-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.risk-strat-icon { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; flex-shrink: 0; }
.risk-strat-icon svg { width: 12px; height: 12px; }
.risk-strat-name { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
.risk-strat-desc { font-size: 12px; font-family: var(--font-inter); color: var(--color-charcoal); line-height: 1.5; margin-bottom: 12px; }
.risk-strat-severity { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; font-family: var(--font-mono); padding: 2px 10px; border-radius: 999px; }
.risk-strat-severity.critical { background: rgba(211,47,47,0.1); color: var(--color-danger); }
.risk-strat-severity.high { background: rgba(237,108,2,0.1); color: var(--color-warning); }
.risk-strat-severity.medium { background: rgba(0,145,255,0.1); color: var(--color-signal-blue); }
.risk-strat-severity.low { background: rgba(100,100,100,0.1); color: var(--color-slate); }
.risk-strat-mitigation { font-size: 11px; font-family: var(--font-inter); color: var(--color-slate); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--color-linen); line-height: 1.4; }
.move-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.move-card { background: var(--color-paper); border: 1px solid var(--color-cloud); border-radius: var(--radius-card); padding: 20px 22px; transition: border-color var(--duration-fast) var(--ease-out); cursor: default; }
.move-card:hover { border-color: var(--color-brand-violet); }
.move-number { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; color: var(--color-brand-violet); font-family: var(--font-plus-jakarta); line-height: 1; margin-bottom: 10px; }
.move-card-label { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 6px; }
.move-card-desc { font-size: 12px; font-family: var(--font-inter); color: var(--color-charcoal); line-height: 1.5; margin-bottom: 10px; }
.move-deps { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 8px; border-top: 1px solid var(--color-linen); }
.move-dep { font-size: 10px; font-weight: 500; padding: 2px 8px; border-radius: 999px; background: var(--color-cloud); color: var(--color-slate); }
.move-dep.blocker { background: rgba(211,47,47,0.08); color: var(--color-danger); }
.move-dep.pending { background: rgba(237,108,2,0.08); color: var(--color-warning); }
.move-dep.clear { background: rgba(46,125,50,0.08); color: var(--color-success); }
.sec-divider { height: 1px; background: var(--color-cloud); margin: 32px 0; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.sec { animation: fadeUp 0.45s var(--ease-out) both; }
.sec:nth-child(2) { animation-delay: 0.04s; }
.sec:nth-child(3) { animation-delay: 0.08s; }
.sec:nth-child(4) { animation-delay: 0.12s; }
.sec:nth-child(5) { animation-delay: 0.16s; }
.sec:nth-child(6) { animation-delay: 0.2s; }
.sec:nth-child(7) { animation-delay: 0.24s; }
@media (max-width: 1200px) { .obj-grid { grid-template-columns: 1fr; } .anti-grid { grid-template-columns: 1fr; } .risk-strat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 1024px) { .focus-primary { grid-template-columns: 1fr; } .bet-grid { grid-template-columns: 1fr; } .move-grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) { .risk-strat-grid { grid-template-columns: 1fr; } .bet-metrics { grid-template-columns: 1fr; } .move-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>

<!-- Sidebar -->
<aside class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <div class="sidebar-logo">H</div>
    <div>
      <div class="sidebar-brand-text">Hub</div>
      <div class="sidebar-brand-sub">Operacional</div>
    </div>
  </div>
  <nav class="sidebar-nav">
    <div class="sidebar-group-label">Navegação</div>
    <a class="nav-item" href="index.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v9a1 1 0 0 0 1 1h3v-5h6v5h3a1 1 0 0 0 1-1v-9"/></svg>
      Início
    </a>
    <a class="nav-item active" href="north-star.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9 9 9 12 2"/></svg>
      North Star
    </a>
    <a class="nav-item" href="comando.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      Sala de Comando
    </a>
    <a class="nav-item" href="lab.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      Lab
    </a>
    <a class="nav-item" href="brain.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V19a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-4.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z"/><path d="M9 12h6"/><path d="M9 8h6"/><path d="M9 16h4"/></svg>
      Brain
    </a>
    <a class="nav-item" href="funil.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
      Funis
    </a>
    <a class="nav-item" href="pipeline.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      Pipeline
    </a>
    <a class="nav-item" href="conteudo.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      Conteúdo
    </a>
    <a class="nav-item" href="brandbook.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      Brandbook
    </a>
    <a class="nav-item" href="agentes.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M22 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="5" r="1" fill="currentColor"/></svg>
      Agentes
    </a>
    <a class="nav-item" href="sinais.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      Sinais
    </a>
    <a class="nav-item" href="instagram.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
      Instagram
    </a>
    <div class="sidebar-group-label">Gestão</div>
    <a class="nav-item" href="carteira.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
      Carteira
    </a>
    <a class="nav-item" href="calendar.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Calendário
    </a>
    <a class="nav-item" href="reunioes.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Reuniões
    </a>
    <a class="nav-item" href="configuracoes.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      Configurações
    </a>
  </nav>
  <div class="sidebar-footer">
    <div class="sidebar-avatar">ES</div>
    <div>
      <div class="sidebar-user">Erick Sena</div>
      <div class="sidebar-user-role">Admin</div>
    </div>
  </div>
</aside>

<!-- Topbar -->
<header class="topbar">
  <button class="mobile-menu-btn" onclick="document.getElementById('sidebar').classList.toggle('open')" aria-label="Menu">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
  <span class="topbar-breadcrumb">Hub Operacional / <span>North Star</span></span>
  <div class="topbar-spacer"></div>
</header>

<!-- Main -->
<main class="main">

  <!-- 1. Page header -->
  <div class="page-header">
    <div class="page-header-left">
      <h1>North Star</h1>
      <div class="subtitle">Fonte de direção e foco do sistema. Esta não é uma página de métricas — é o campo magnético que orienta cada decisão, aposta e movimento do Hub.</div>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="filterbar">
    <div class="filter-group">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <select><option>Horizonte atual (Q3 2026)</option><option>Q2 2026</option><option>Q1 2026</option><option>Anual 2026</option><option>Personalizado</option></select>
    </div>
    <div class="filter-group">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>
      <select><option>Todas as frentes</option><option>Conteúdo</option><option>Funil</option><option>Produto</option><option>Operação</option><option>Comercial</option></select>
    </div>
    <div class="filter-group">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      <select><option>Todas as prioridades</option><option>Crítica</option><option>Alta</option><option>Média</option><option>Baixa</option></select>
    </div>
    <div class="filter-group">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <select><option>Todos os owners</option><option>Erick Sena</option><option>Camila Costa</option><option>Rafael Torres</option></select>
    </div>
  </div>
</main>
</body>
</html>
'''

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Base file written successfully')
