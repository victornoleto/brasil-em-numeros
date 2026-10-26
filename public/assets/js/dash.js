/*
 * dash.js — pequeno runtime de dados do painel "Brasil em números".
 *
 * Carrega os CSVs da pasta data/ sob demanda, entrega as linhas para o
 * código da página e redesenha tudo quando um arquivo termina de carregar
 * ou a largura da tela muda.
 *
 * API usada por app.js:
 *   dash.data(id)        -> { status: 'loading'|'ok'|'error', data: [...], columns: [...], message }
 *   dash.onData(fn)      -> registra fn; roda agora e a cada mudança de dados/largura
 *   dash.calc(id, {...}) -> valor derivado de outros conjuntos (ex.: agrupamento por governo)
 *   dash.colors          -> cores das séries (variáveis CSS, seguem o tema claro/escuro)
 */
(function () {
  'use strict';

  var DATA_DIR = 'data/';
  var store = {};   // id -> { status, data, columns, message }
  var calcs = {};   // id -> { inputs, fn }
  var subs = [];
  var scheduled = false;

  function notify() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      subs.forEach(function (fn) {
        try { fn(); } catch (e) { console.error('[dash] erro ao desenhar:', e); }
      });
    });
  }

  function load(id) {
    store[id] = { status: 'loading', data: [], columns: [] };
    fetch(DATA_DIR + encodeURIComponent(id) + '.csv', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ao buscar ' + id + '.csv');
        return r.text();
      })
      .then(function (text) {
        // csvParseRows (e não csvParse) para não depender de eval: o nginx
        // serve o site com Content-Security-Policy sem 'unsafe-eval'.
        var all = d3.csvParseRows(text.replace(/^﻿/, ''));
        var columns = all.shift() || [];
        var rows = all.filter(function (r) { return r.length && r.join('') !== ''; }).map(function (r) {
          var o = {};
          columns.forEach(function (c, i) { o[c] = r[i] != null ? r[i] : ''; });
          return o;
        });
        store[id] = { status: 'ok', data: rows, columns: columns };
      })
      .catch(function (err) {
        console.error('[dash]', err);
        store[id] = { status: 'error', data: [], columns: [], message: String(err.message || err) };
      })
      .then(notify);
  }

  function data(id) {
    if (calcs[id]) return runCalc(id);
    if (!store[id]) load(id);
    return store[id];
  }

  function runCalc(id) {
    var c = calcs[id];
    var parts = c.inputs.map(data);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].status !== 'ok') return { status: parts[i].status, data: [], columns: [] };
    }
    try {
      var out = c.fn.apply(null, parts.map(function (p) { return p.data; }));
      return { status: 'ok', data: out, columns: Array.isArray(out) && out[0] ? Object.keys(out[0]) : [] };
    } catch (e) {
      console.error('[dash] cálculo "' + id + '" falhou:', e);
      return { status: 'error', data: [], columns: [], message: String(e.message || e) };
    }
  }

  function calc(id, spec) {
    calcs[id] = { inputs: spec.inputs || [], fn: spec.fn };
  }

  function onData(fn) {
    subs.push(fn);
    try { fn(); } catch (e) { console.error('[dash] erro ao desenhar:', e); }
  }

  // Redesenha quando a largura do conteúdo muda (gráficos são medidos em clientWidth).
  var lastWidth = 0;
  function watchWidth() {
    var root = document.getElementById('dash-root');
    if (!root || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', notify);
      return;
    }
    new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w !== lastWidth) { lastWidth = w; notify(); }
    }).observe(root);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchWidth);
  else watchWidth();

  window.dash = {
    data: data,
    onData: onData,
    calc: calc,
    refresh: function (id) { delete store[id]; load(id); },
    colors: [
      'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
      'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'
    ]
  };
})();
