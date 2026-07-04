/* =============================================================================
   instagram-live.js  —  Substitui os dados MOCK da página Instagram por
   métricas REAIS do Meta Graph API, com auto-atualização por intervalo.

   Requer: js/config.js (window.IG_CONFIG) carregado antes deste arquivo.
   Degrada com elegância: sem token/erro de API => mantém o mock e mostra badge.
   ============================================================================= */
(function () {
  'use strict';

  var cfg = window.IG_CONFIG;
  if (!cfg || !cfg.ACCESS_TOKEN || cfg.ACCESS_TOKEN.indexOf('COLE') === 0) {
    console.warn('[IG] config.js ausente ou sem token — mantendo dados mock.');
    return;
  }

  var BASE = 'https://graph.facebook.com/' + (cfg.API_VERSION || 'v21.0');
  var IG = cfg.IG_BUSINESS_ACCOUNT_ID;
  var TOKEN = cfg.ACCESS_TOKEN;

  /* ---------- helpers ---------- */
  function api(path, params) {
    var q = new URLSearchParams(Object.assign({ access_token: TOKEN }, params || {}));
    return fetch(BASE + '/' + path + '?' + q.toString()).then(function (r) {
      return r.json().then(function (b) {
        if (!r.ok || (b && b.error)) {
          var m = (b && b.error && b.error.message) || ('HTTP ' + r.status);
          throw new Error(m);
        }
        return b;
      });
    });
  }
  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function totalValue(resp, name) {
    var d = (resp.data || []).find(function (x) { return x.name === name; });
    return d && d.total_value ? Number(d.total_value.value) || 0 : 0;
  }
  function sumDaily(resp, name) {
    var d = (resp.data || []).find(function (x) { return x.name === name; });
    if (!d || !d.values) return 0;
    return d.values.reduce(function (s, v) { return s + (Number(v.value) || 0); }, 0);
  }
  function firstLine(cap) {
    if (!cap) return 'Post sem legenda';
    var t = cap.split('\n')[0].trim();
    return t.length > 64 ? t.slice(0, 61) + '…' : (t || 'Post sem legenda');
  }
  function mediaTag(m) {
    var pt = m.media_product_type, mt = m.media_type;
    if (pt === 'REELS' || mt === 'VIDEO') return { type: 'video', label: 'reel' };
    if (mt === 'CAROUSEL_ALBUM') return { type: 'carousel', label: 'carrossel' };
    return { type: 'image', label: 'imagem' };
  }
  function mediaInsight(m, key) {
    if (!m.insights || !m.insights.data) return 0;
    var d = m.insights.data.find(function (x) { return x.name === key; });
    return d && d.values && d.values[0] ? Number(d.values[0].value) || 0 : 0;
  }
  function mapMedia(m) {
    var tag = mediaTag(m);
    var reach = mediaInsight(m, 'reach');
    var saves = mediaInsight(m, 'saved');
    var likes = Number(m.like_count) || 0;
    var comments = Number(m.comments_count) || 0;
    return {
      ts: m.timestamp ? Math.floor(new Date(m.timestamp).getTime() / 1000) : 0,
      type: tag.type, productLabel: tag.label,
      title: firstLine(m.caption),
      likes: likes, comments: comments, saves: saves, reach: reach,
      insight: (reach ? fmt(reach) + ' de alcance · ' : '') + saves + ' salvamentos · ' + likes + ' curtidas'
    };
  }

  /* ---------- status badge ---------- */
  function badge(state, msg) {
    var el = document.getElementById('igLiveBadge');
    if (!el) {
      var header = document.querySelector('.page-header .page-header-left') || document.querySelector('.page-header');
      if (!header) return;
      el = document.createElement('div');
      el.id = 'igLiveBadge';
      el.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-top:8px;font:500 11px/1 var(--font-inter);padding:4px 10px;border-radius:999px;';
      header.appendChild(el);
    }
    var map = {
      loading: ['rgba(100,100,100,0.1)', '#646464', '⏳ Atualizando dados ao vivo…'],
      live: ['rgba(46,125,50,0.1)', '#2e7d32', '● Dados reais do Instagram · ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })],
      error: ['rgba(211,47,47,0.1)', '#d32f2f', '⚠ Falha ao atualizar — usando último dado. ' + (msg || '')]
    };
    var m = map[state] || map.loading;
    el.style.background = m[0]; el.style.color = m[1]; el.textContent = m[2];
  }

  /* ---------- engagement doughnut (real) ---------- */
  function updateChart(posts) {
    var canvas = document.getElementById('engagementChart');
    if (!canvas || typeof Chart === 'undefined') return;
    var likes = 0, comments = 0, saves = 0;
    posts.forEach(function (p) { likes += p.likes; comments += p.comments; saves += p.saves; });
    if (likes + comments + saves === 0) return;
    var existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    var total = likes + comments + saves;
    new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Curtidas', 'Salvamentos', 'Comentários'],
        datasets: [{ data: [likes, saves, comments], backgroundColor: ['#7b68ee', '#2e7d32', '#0091ff'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10, boxHeight: 10, padding: 14, usePointStyle: true,
              font: { family: "'Inter', sans-serif", size: 11 }, color: '#292d34',
              generateLabels: function (chart) {
                return chart.data.labels.map(function (label, i) {
                  var v = chart.data.datasets[0].data[i];
                  return { text: label + '  ' + Math.round(v / total * 100) + '%', fillStyle: chart.data.datasets[0].backgroundColor[i], index: i, pointStyle: 'circle' };
                });
              }
            }
          },
          tooltip: {
            backgroundColor: '#fff', padding: 10, borderColor: '#e8e8e8', borderWidth: 1, cornerRadius: 9,
            titleColor: '#090c1d', bodyColor: '#292d34',
            callbacks: { label: function (ctx) { return ctx.label.replace(/  \d+%/, '') + ': ' + ctx.parsed.toLocaleString('pt-BR') + ' (' + Math.round(ctx.parsed / total * 100) + '%)'; } }
          }
        }
      }
    });
  }

  /* ---------- main refresh ---------- */
  async function fetchMedia() {
    // tenta com insights (reach/saved); se falhar, cai pra media sem insights
    try {
      return await api(IG + '/media', {
        fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,insights.metric(reach,saved)',
        limit: 25
      });
    } catch (e) {
      console.warn('[IG] media com insights falhou (' + e.message + '), tentando sem insights.');
      return await api(IG + '/media', {
        fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
        limit: 25
      });
    }
  }

  async function refresh() {
    try {
      badge('loading');
      var now = Math.floor(Date.now() / 1000);
      var since = now - 30 * 86400;

      var acc = await api(IG, { fields: 'username,name,biography,followers_count,media_count,profile_picture_url' });

      var reach30 = 0, interactions30 = 0, followerDelta = null;
      try {
        var reach = await api(IG + '/insights', { metric: 'reach', period: 'day', metric_type: 'total_value', since: since, until: now });
        reach30 = totalValue(reach, 'reach');
      } catch (e) { console.warn('[IG] reach:', e.message); }
      try {
        var act = await api(IG + '/insights', { metric: 'total_interactions', period: 'day', metric_type: 'total_value', since: since, until: now });
        interactions30 = totalValue(act, 'total_interactions');
      } catch (e) { console.warn('[IG] interactions:', e.message); }
      try {
        var fc = await api(IG + '/insights', { metric: 'follower_count', period: 'day', since: since, until: now });
        followerDelta = sumDaily(fc, 'follower_count');
      } catch (e) { /* conta pequena/sem dados */ }

      var media = await fetchMedia();
      var posts = (media.data || []).map(mapMedia);
      var posts30 = posts.filter(function (p) { return p.ts >= since; });
      var engRate = reach30 > 0 ? (interactions30 / reach30 * 100) : 0;

      /* --- perfil --- */
      setText('igProfileName', acc.name || acc.username);
      setText('igProfileHandle', '@' + acc.username);
      if (acc.biography) setText('igProfileBio', acc.biography);
      var av = document.getElementById('igAvatarInner');
      if (av && acc.profile_picture_url) {
        av.style.backgroundImage = 'url("' + acc.profile_picture_url + '")';
        av.style.backgroundSize = 'cover'; av.style.backgroundPosition = 'center';
        av.textContent = '';
      }

      /* --- métricas do header --- */
      setText('igFollowers', fmt(acc.followers_count));
      setText('igPosts30', String(posts30.length || acc.media_count || 0));
      setText('igReach30', fmt(reach30));
      setText('igEngagement', engRate.toFixed(1).replace('.', ',') + '%');

      var ft = document.getElementById('igFollowersTrend');
      if (ft) {
        if (followerDelta != null && followerDelta !== 0) {
          ft.textContent = (followerDelta >= 0 ? '▲ ' : '▼ ') + Math.abs(followerDelta) + ' (30d)';
          ft.className = 'profile-metric-trend ' + (followerDelta >= 0 ? 'up' : 'down');
          ft.style.display = '';
        } else { ft.style.display = 'none'; }
      }
      var et = document.getElementById('igEngagementTrend'); if (et) et.style.display = 'none';

      /* --- ranking de posts (top 4 por alcance) --- */
      var ranked = posts.slice().sort(function (a, b) { return b.reach - a.reach; });
      if (!ranked.some(function (p) { return p.reach > 0; })) {
        // sem reach por post (fallback) → ordena por interações
        ranked = posts.slice().sort(function (a, b) { return (b.likes + b.comments + b.saves) - (a.likes + a.comments + a.saves); });
      }
      var top = ranked.slice(0, 4);
      if (window.IG_DATA && typeof window.renderPostRanking === 'function' && top.length) {
        window.IG_DATA.topPosts = top.map(function (p, i) {
          var inter = p.likes + p.comments + p.saves;
          return {
            rank: i + 1, type: p.type, pillar: p.productLabel, title: p.title,
            likes: p.likes, comments: p.comments, saves: p.saves, reach: p.reach,
            engagementRate: p.reach > 0 ? +((inter / p.reach) * 100).toFixed(1) : 0,
            insight: p.insight
          };
        });
        window.renderPostRanking();
      }

      /* --- doughnut de engajamento (real) --- */
      updateChart(posts30.length ? posts30 : posts);

      badge('live');
      console.log('[IG] métricas atualizadas:', { followers: acc.followers_count, reach30: reach30, interactions30: interactions30, posts30: posts30.length });
    } catch (e) {
      console.error('[IG] falha ao buscar métricas:', e.message);
      badge('error', e.message);
    }
  }

  function start() {
    refresh();
    if (cfg.REFRESH_INTERVAL_MS > 0) setInterval(refresh, cfg.REFRESH_INTERVAL_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
