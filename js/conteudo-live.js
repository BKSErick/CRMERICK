(function () {
  'use strict';

  var cfg = window.IG_CONFIG;
  var statusEl = document.getElementById('contentDataStatus');
  var bodyEl = document.getElementById('contentPerformanceBody');
  var funnelTopEl = document.getElementById('contentFunnelTop');
  var funnelMiddleEl = document.getElementById('contentFunnelMiddle');
  var funnelBottomEl = document.getElementById('contentFunnelBottom');
  var topInsightsEl = document.getElementById('contentTopInsights');
  var topInsightNoteEl = document.getElementById('contentTopInsightNote');
  var worstInsightsEl = document.getElementById('contentWorstInsights');
  var worstInsightNoteEl = document.getElementById('contentWorstInsightNote');
  var recommendationsEl = document.getElementById('contentRecommendations');

  function setStatus(text, tone) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'card-badge ' + (tone || '');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function fmtCompact(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }

  function fmtPtInt(n) {
    return (Number(n) || 0).toLocaleString('pt-BR');
  }

  function fmtPercent(n) {
    return (Number(n) || 0).toFixed(1).replace('.', ',') + '%';
  }

  function api(path, params) {
    var q = new URLSearchParams(Object.assign({ access_token: cfg.ACCESS_TOKEN }, params || {}));
    return fetch('https://graph.facebook.com/' + (cfg.API_VERSION || 'v21.0') + '/' + path + '?' + q.toString())
      .then(function (r) {
        return r.json().then(function (b) {
          if (!r.ok || (b && b.error)) {
            var msg = (b && b.error && b.error.message) || ('HTTP ' + r.status);
            throw new Error(msg);
          }
          return b;
        });
      });
  }

  function firstLine(cap) {
    if (!cap) return 'Post sem legenda';
    var t = cap.split('\n')[0].trim();
    return t.length > 72 ? t.slice(0, 69) + '...' : (t || 'Post sem legenda');
  }

  function normalize(text) {
    return String(text || '').toLowerCase();
  }

  function mediaMeta(media) {
    if (media.media_product_type === 'REELS' || media.media_type === 'VIDEO') {
      return { klass: 'reels', label: 'Reels' };
    }
    if (media.media_type === 'CAROUSEL_ALBUM') {
      return { klass: 'carrossel', label: 'Carrossel' };
    }
    return { klass: 'estatico', label: 'Estatico' };
  }

  function mediaInsight(media, key) {
    if (!media.insights || !media.insights.data) return 0;
    var d = media.insights.data.find(function (item) { return item.name === key; });
    return d && d.values && d.values[0] ? Number(d.values[0].value) || 0 : 0;
  }

  function mapMedia(media) {
    var meta = mediaMeta(media);
    var reach = mediaInsight(media, 'reach');
    var saves = mediaInsight(media, 'saved');
    var likes = Number(media.like_count) || 0;
    var comments = Number(media.comments_count) || 0;
    var interactions = likes + comments + saves;
    var engagement = reach > 0 ? (interactions / reach) * 100 : 0;
    return {
      title: firstLine(media.caption),
      permalink: media.permalink || '#',
      format: meta,
      reach: reach,
      saves: saves,
      likes: likes,
      comments: comments,
      interactions: interactions,
      engagement: engagement,
      timestamp: media.timestamp || ''
    };
  }

  function classifyStage(item) {
    var t = normalize(item.title);
    if (t.indexOf('diagnostico') >= 0 || t.indexOf('maquina') >= 0 || t.indexOf('review') >= 0 || t.indexOf('garimpo') >= 0) {
      return 'bottom';
    }
    if (t.indexOf('checklist') >= 0 || t.indexOf('antes e depois') >= 0 || t.indexOf('roi') >= 0 || t.indexOf('como') >= 0 || t.indexOf('guia') >= 0) {
      return 'middle';
    }
    return 'top';
  }

  function renderTable(items) {
    if (!bodyEl) return;
    bodyEl.innerHTML = items.map(function (item) {
      var date = item.timestamp ? new Date(item.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '--';
      return '' +
        '<tr>' +
          '<td><a href="' + item.permalink + '" target="_blank" rel="noreferrer" style="color:inherit;text-decoration:none">' + item.title + '</a></td>' +
          '<td><span class="format-pill ' + item.format.klass + '">' + item.format.label + '</span></td>' +
          '<td>' + fmtCompact(item.reach) + '</td>' +
          '<td>' + fmtPercent(item.engagement) + '</td>' +
          '<td>' + fmtPtInt(item.interactions) + '</td>' +
          '<td>' + fmtPtInt(item.saves) + '</td>' +
          '<td>' + date + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderKpis(items) {
    var totals = items.reduce(function (acc, item) {
      acc.reach += item.reach;
      acc.saves += item.saves;
      acc.interactions += item.interactions;
      return acc;
    }, { reach: 0, saves: 0, interactions: 0 });
    var engagement = totals.reach > 0 ? (totals.interactions / totals.reach) * 100 : 0;
    setText('contentKpiPublished', fmtPtInt(items.length));
    setText('contentKpiReach', fmtCompact(totals.reach));
    setText('contentKpiEngagement', fmtPercent(engagement));
    setText('contentKpiSaves', fmtPtInt(totals.saves));
  }

  function renderFunnelColumn(el, items) {
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<div class="funnel-link-attr">Sem dados suficientes</div>';
      return;
    }
    el.innerHTML = items.slice(0, 3).map(function (item, index) {
      var separator = index > 0 ? ' style="margin-top:8px;padding-top:8px;border-top:1px solid var(--color-linen)"' : '';
      return '' +
        '<div' + separator + '>' +
          '<div class="funnel-link-content">' + item.title + '</div>' +
          '<div class="funnel-link-attr"><strong>' + fmtCompact(item.reach) + '</strong> alcance - <strong>' + fmtPtInt(item.interactions) + '</strong> interacoes - <strong>' + fmtPtInt(item.saves) + '</strong> salvamentos</div>' +
        '</div>';
    }).join('');
  }

  function renderInsightList(el, items) {
    if (!el) return;
    el.innerHTML = items.map(function (item) {
      return '<div class="insight-item"><span class="insight-item-name">' + item.title + '</span><span class="insight-item-value">' + fmtCompact(item.reach) + ' - ' + fmtPercent(item.engagement) + '</span></div>';
    }).join('');
  }

  function renderRecommendations(items) {
    if (!recommendationsEl) return;
    var reels = items.filter(function (item) { return item.format.klass === 'reels'; });
    var staticPosts = items.filter(function (item) { return item.format.klass === 'estatico'; });
    var carousels = items.filter(function (item) { return item.format.klass === 'carrossel'; });

    var recommendations = [];
    if (reels.length) {
      var reelsAvg = reels.reduce(function (sum, item) { return sum + item.engagement; }, 0) / reels.length;
      recommendations.push('Aumentar o peso de Reels de contraste e bastidor. Eles estao sustentando media de ' + fmtPercent(reelsAvg) + ' de engajamento.');
    }
    if (staticPosts.length) {
      var staticAvg = staticPosts.reduce(function (sum, item) { return sum + item.engagement; }, 0) / staticPosts.length;
      recommendations.push('Revisar posts estaticos com copy densa. A media atual deles esta em ' + fmtPercent(staticAvg) + ' e tende a perder retencao contra formatos mais visuais.');
    }
    if (carousels.length) {
      var bestCarousel = carousels.slice().sort(function (a, b) { return b.saves - a.saves; })[0];
      recommendations.push('Usar ' + bestCarousel.title + ' como base para nova sequencia de nurture. Ele concentra mais salvamentos dentro dos carrosseis recentes.');
    }
    var best = items[0];
    if (best) {
      recommendations.push('Replicar o angulo de ' + best.title + ' em novos testes de criativo, porque ele lidera a combinacao de alcance e engajamento neste recorte.');
    }

    recommendationsEl.innerHTML = recommendations.slice(0, 4).map(function (text, index) {
      var border = index === recommendations.length - 1 ? ' style="border-bottom:none"' : '';
      return '<div class="recommend-item"' + border + '><span>' + text + '</span></div>';
    }).join('');
  }

  function renderAnalysis(items) {
    var sortedByEngagement = items.slice().sort(function (a, b) { return b.engagement - a.engagement; });
    var sortedByReachAsc = items.slice().sort(function (a, b) { return a.reach - b.reach; });

    var top = sortedByEngagement.slice(0, 3);
    var worst = sortedByReachAsc.slice(0, 3);
    renderInsightList(topInsightsEl, top);
    renderInsightList(worstInsightsEl, worst);

    if (topInsightNoteEl) {
      var reels = items.filter(function (item) { return item.format.klass === 'reels'; });
      var other = items.filter(function (item) { return item.format.klass !== 'reels'; });
      if (reels.length && other.length) {
        var reelsAvgReach = reels.reduce(function (sum, item) { return sum + item.reach; }, 0) / reels.length;
        var otherAvgReach = other.reduce(function (sum, item) { return sum + item.reach; }, 0) / other.length;
        topInsightNoteEl.textContent = 'Reels estao com alcance medio ' + (otherAvgReach > 0 ? (reelsAvgReach / otherAvgReach).toFixed(1).replace('.', ',') + 'x' : '--') + ' acima dos demais formatos neste recorte.';
      } else {
        topInsightNoteEl.textContent = 'Os melhores posts concentram mais interacoes por alcance e devem virar referencia de criativo.';
      }
    }
    if (worstInsightNoteEl) {
      worstInsightNoteEl.textContent = 'Os posts de menor performance pedem ajuste de gancho, densidade de copy ou troca de formato.';
    }

    var grouped = { top: [], middle: [], bottom: [] };
    items.forEach(function (item) {
      grouped[classifyStage(item)].push(item);
    });
    Object.keys(grouped).forEach(function (key) {
      grouped[key].sort(function (a, b) { return b.interactions - a.interactions; });
    });
    renderFunnelColumn(funnelTopEl, grouped.top);
    renderFunnelColumn(funnelMiddleEl, grouped.middle);
    renderFunnelColumn(funnelBottomEl, grouped.bottom);
    renderRecommendations(sortedByEngagement);
  }

  function start() {
    if (!cfg || !cfg.ACCESS_TOKEN || cfg.ACCESS_TOKEN.indexOf('COLE') === 0) {
      setStatus('API sem token', '');
      return;
    }

    setStatus('Carregando dados reais', '');
    api(cfg.IG_BUSINESS_ACCOUNT_ID + '/media', {
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,insights.metric(reach,saved)',
      limit: 12
    }).then(function (resp) {
      var items = (resp.data || []).slice().sort(function (a, b) {
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      }).map(mapMedia);
      renderKpis(items);
      renderTable(items.slice(0, 8));
      renderAnalysis(items);
      setStatus('Meta Graph ao vivo', '');
    }).catch(function (err) {
      console.error('[Conteudo] falha ao carregar Meta Graph:', err.message);
      setStatus('Falha na API: ' + err.message, '');
      if (bodyEl) {
        bodyEl.innerHTML = '<tr><td colspan="7">Nao foi possivel carregar os dados reais do Instagram agora.</td></tr>';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
