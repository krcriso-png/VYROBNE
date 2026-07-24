/*
 * UI kalkulačky — vanilla JS, žiadne závislosti.
 * Stav sa ukladá do localStorage; výpočty robí KalkEngine (engine.js).
 */
(function () {
  'use strict';

  var E = window.KalkEngine;
  var STORAGE_KEY = 'kalkulacka-vyrobne-v1';

  // ---------------------------------------------------------------------------
  // Stav
  // ---------------------------------------------------------------------------

  function freshState() {
    return {
      config: E.defaultConfig(),
      inputs: {
        sirka: 4, hlbka: 2.5, vyskaZadu: 2.1,
        plochaOkna: 0.6, plochaDveri: 2, sirkaAltanku: 2,
        terasa: false, podlahaDomcek: false, podlahaTerasa: false,
        odkvap: true, zateplenie: 'none',
      },
      firma: { nazov: '', adresa: '', ico: '', dic: '', tel: '', email: '' },
      zakaznik: {
        meno: '', email: '', mobil: '', adresa: '',
        osadenie: 'na zámkovú dlažbu (bez podlahy)',
        umiestnenie: 'dvere vľavo, okno vpravo',
        poznamka: '',
      },
      ui: { tab: 'kalk' },
    };
  }

  function loadState() {
    var st = freshState();
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* file:// bez localStorage */ }
    if (!raw) return st;
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { return st; }
    if (!saved || typeof saved !== 'object') return st;

    // len skutočné konečné číslo (isFinite by pustilo '' aj true aj [])
    function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

    if (saved.config && saved.config.settings) {
      Object.keys(st.config.settings).forEach(function (k) {
        var v = saved.config.settings[k];
        if (v == null) return;
        if (typeof st.config.settings[k] === 'object') {
          if (typeof v !== 'object') return;
          Object.keys(st.config.settings[k]).forEach(function (k2) {
            if (num(v[k2]) != null) st.config.settings[k][k2] = v[k2];
          });
        } else if (num(v) != null) {
          st.config.settings[k] = v;
        }
      });
    }
    if (saved.config && Array.isArray(saved.config.materials)) {
      var byKey = {};
      saved.config.materials.forEach(function (m) { if (m && m.key) byKey[m.key] = m; });
      st.config.materials.forEach(function (m) {
        var s = byKey[m.key];
        if (!s) return;
        if (num(s.price) != null) m.price = s.price;
        if (typeof s.vatPayer === 'boolean') m.vatPayer = s.vatPayer;
        if (typeof s.supplier === 'string') m.supplier = s.supplier;
        if (num(s.packQty) != null && s.packQty > 0) m.packQty = s.packQty;
      });
    }
    ['inputs', 'firma', 'zakaznik', 'ui'].forEach(function (sect) {
      if (!saved[sect] || typeof saved[sect] !== 'object') return;
      Object.keys(st[sect]).forEach(function (k) {
        var v = saved[sect][k];
        if (v == null || typeof v !== typeof st[sect][k]) return;
        if (typeof v === 'number' && !isFinite(v)) return;
        st[sect][k] = v;
      });
    });
    if (['kalk', 'cennik', 'nastavenia', 'ponuka'].indexOf(st.ui.tab) < 0) st.ui.tab = 'kalk';
    return st;
  }

  var state = loadState();

  var saveTimer = null;
  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 150);
  }
  // posledná zmena sa nesmie stratiť pri zatvorení stránky
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushSave();
  });

  // ---------------------------------------------------------------------------
  // Pomocníci
  // ---------------------------------------------------------------------------

  var eurFmt = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
  var numFmt = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 3 });
  var pctFmt = new Intl.NumberFormat('sk-SK', { style: 'percent', maximumFractionDigits: 1 });

  var eurSmallFmt = new Intl.NumberFormat('sk-SK', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4,
  });

  function eur(x) { return eurFmt.format(isFinite(x) ? x : 0); }
  // jednotkové ceny z balení (klince ~0,0013 €/ks) potrebujú viac desatín
  function eurUnit(x) {
    if (isFinite(x) && x !== 0 && Math.abs(x) < 0.1) return eurSmallFmt.format(x);
    return eur(x);
  }
  function qty(x) { return numFmt.format(isFinite(x) ? x : 0); }
  function pct(x) {
    if (x == null || !isFinite(Number(x))) return '—';
    return pctFmt.format(x);
  }
  // hodnota do editovateľného číselného poľa (slovenská desatinná čiarka)
  function fmtNum(x) {
    if (!isFinite(Number(x))) return '0';
    return String(Number(x)).replace('.', ',');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getPath(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, state);
  }
  function setPath(path, value) {
    var keys = path.split('.');
    var o = state;
    for (var i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
  }

  function engineInputs() {
    var i = state.inputs;
    return {
      sirka: i.sirka, hlbka: i.hlbka, vyskaZadu: i.vyskaZadu,
      plochaOkna: i.plochaOkna, plochaDveri: i.plochaDveri,
      sirkaAltanku: i.terasa ? i.sirkaAltanku : 0,
      odkvap: i.odkvap, zateplenie: i.zateplenie,
    };
  }

  function selectedVariantKey() {
    var i = state.inputs;
    return E.pickVariant(i.terasa, i.podlahaDomcek, i.terasa && i.podlahaDomcek && i.podlahaTerasa);
  }

  function compute() {
    return E.compute(engineInputs(), state.config);
  }

  // číselný input naviazaný na cestu v stave.
  // type="text" + inputmode="decimal": desatinná čiarka aj bodka fungujú na
  // každej klávesnici a locale (type="number" v Chromiu čiarku ticho zahodí).
  function numField(label, path, opts) {
    opts = opts || {};
    return '<div class="field"><label class="label" for="f-' + path + '">' + esc(label) + '</label>' +
      '<input id="f-' + path + '" type="text" inputmode="decimal" autocomplete="off"' +
      ' data-path="' + path + '" data-type="num"' +
      (opts.min != null ? ' data-min="' + opts.min + '"' : '') +
      ' value="' + fmtNum(getPath(path)) + '">' +
      (opts.hint ? '<span class="hint">' + esc(opts.hint) + '</span>' : '') +
      '</div>';
  }
  function textField(label, path, opts) {
    opts = opts || {};
    return '<div class="field"><label class="label" for="f-' + path + '">' + esc(label) + '</label>' +
      '<input id="f-' + path + '" type="' + (opts.type || 'text') + '" data-path="' + path + '" data-type="str"' +
      ' value="' + esc(getPath(path)) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>' +
      '</div>';
  }
  function checkField(label, path) {
    return '<label class="check"><input type="checkbox" data-path="' + path + '" data-type="bool"' +
      (getPath(path) ? ' checked' : '') + '> ' + esc(label) + '</label>';
  }

  // ---------------------------------------------------------------------------
  // Záložka: Kalkulácia
  // ---------------------------------------------------------------------------

  function renderKalk() {
    var el = document.getElementById('tab-kalk');
    el.innerHTML =
      '<div class="kalk-grid">' +
      '  <div class="sidebar" id="kalk-form"></div>' +
      '  <div class="results" id="kalk-out"></div>' +
      '</div>';
    renderKalkForm();
    renderKalkOut();
  }

  function renderKalkForm() {
    var i = state.inputs;
    var el = document.getElementById('kalk-form');
    if (!el) return;
    el.innerHTML =
      '<div class="card">' +
      '  <h3 class="section">Rozmery domčeka</h3>' +
      '  <div class="grid2">' +
      numField('Šírka (m)', 'inputs.sirka', { step: '0.1', min: 0 }) +
      numField('Hĺbka (m)', 'inputs.hlbka', { step: '0.1', min: 0 }) +
      numField('Výška vzadu (m)', 'inputs.vyskaZadu', { step: '0.05', min: 0 }) +
      '  <div class="field"><span class="label">Výška vpredu</span>' +
      '    <span id="out-vyskapredu" style="padding:7px 0; font-variant-numeric: tabular-nums;"></span>' +
      '    <span class="hint">vzadu + 5 cm na meter hĺbky</span></div>' +
      numField('Plocha okna (m²)', 'inputs.plochaOkna', { step: '0.1', min: 0 }) +
      numField('Plocha dverí (m²)', 'inputs.plochaDveri', { step: '0.1', min: 0 }) +
      '  </div>' +
      '</div>' +
      '<div class="card">' +
      '  <h3 class="section">Výbava</h3>' +
      checkField('Terasa (prístrešok)', 'inputs.terasa') +
      (i.terasa
        ? '<div style="padding-left:24px;">' + numField('Šírka terasy (m)', 'inputs.sirkaAltanku', { step: '0.1', min: 0 }) + '</div>'
        : '') +
      checkField('Podlaha v domčeku', 'inputs.podlahaDomcek') +
      (i.terasa && i.podlahaDomcek ? checkField('Podlaha aj na terase', 'inputs.podlahaTerasa') : '') +
      checkField('Odkvapový systém', 'inputs.odkvap') +
      '  <div class="field" style="margin-top:8px;"><label class="label" for="f-zat">Zateplenie</label>' +
      '  <select id="f-zat" data-path="inputs.zateplenie" data-type="str">' +
      '    <option value="none"' + (i.zateplenie === 'none' ? ' selected' : '') + '>bez zateplenia</option>' +
      '    <option value="osb"' + (i.zateplenie === 'osb' ? ' selected' : '') + '>zateplenie + záklop OSB</option>' +
      '    <option value="tatran"' + (i.zateplenie === 'tatran' ? ' selected' : '') + '>zateplenie + tatranský obklad</option>' +
      '  </select>' +
      '  <span class="hint">materiál zateplenia ×' + qty(state.config.settings.zateplenieKoef) +
      ' sa pripočíta k materiálu domčeka (pred maržou)</span></div>' +
      '</div>' +
      '<div class="card" id="kalk-derived"></div>';
    renderKalkDerived();
  }

  function renderKalkDerived() {
    var el = document.getElementById('kalk-derived');
    if (!el) return;
    var d = E.derive(engineInputs());
    el.innerHTML =
      '<h3 class="section">Vypočítané plochy</h3>' +
      '<div class="scroll-x"><table class="data">' +
      '<tr><td>Predná stena</td><td>' + qty(d.prednaStena) + ' m²</td></tr>' +
      '<tr><td>Bočné steny</td><td>' + qty(d.bocneSteny) + ' m²</td></tr>' +
      '<tr><td>Zadná stena</td><td>' + qty(d.zadnaStena) + ' m²</td></tr>' +
      '<tr><td>Strecha</td><td>' + qty(d.strecha) + ' m²</td></tr>' +
      (d.pristresok > 0 ? '<tr><td>Prístrešok (terasa)</td><td>' + qty(d.pristresok) + ' m²</td></tr>' : '') +
      '<tr><td>Zastavaná plocha</td><td>' + qty(d.sirka * d.hlbka) + ' m²</td></tr>' +
      '</table></div>';
    var vp = document.getElementById('out-vyskapredu');
    if (vp) vp.textContent = qty(d.vyskaPredu) + ' m';
  }

  function variantBoms(r, vKey) {
    var v = r.variants[vKey];
    var list = [{ label: 'Domček', bom: r.boms.domcek }];
    if (v.withTerasa) list.push({ label: 'Terasa', bom: r.boms.terasa });
    if (v.withPodlahaDomcek) list.push({ label: 'Podlaha v domčeku', bom: r.boms.podlahaDomcek });
    if (v.withPodlahaTerasa) list.push({ label: 'Podlaha terasy', bom: r.boms.podlahaTerasa });
    if (state.inputs.zateplenie !== 'none') {
      list.push({
        label: 'Zateplenie (' + (state.inputs.zateplenie === 'tatran' ? 'tatranský obklad' : 'OSB') + ')',
        bom: r.boms.zateplenie,
      });
    }
    if (state.inputs.odkvap) {
      list.push({ label: 'Odkvapový systém', bom: v.withTerasa ? r.boms.odkvapSTerasou : r.boms.odkvapBezTerasy });
    }
    return list;
  }

  function renderKalkOut() {
    var el = document.getElementById('kalk-out');
    if (!el) return;
    var r = compute();
    var sel = selectedVariantKey();
    var v = r.variants[sel];
    var odk = state.inputs.odkvap ? (v.withTerasa ? r.odkvap.sTerasou : r.odkvap.bezTerasy) : null;
    var spoluBez = v.predajnaBezDph + (odk ? odk.predajnaBezDph : 0);
    var spoluS = v.predajSDph + (odk ? odk.predajSDph : 0);
    var i = state.inputs;
    var warn = i.terasa && !(i.sirkaAltanku > 0);
    var warnOknoDvere = r.derived.prednaStena < 0;
    // porovnávacia tabuľka počíta varianty s terasou vždy so zadanou šírkou
    // terasy (aj keď je checkbox vypnutý) — inak by v2–v4 vychádzali bez nej
    var rT = r;
    if (!i.terasa && i.sirkaAltanku > 0) {
      var fullIn = engineInputs();
      fullIn.sirkaAltanku = Number(i.sirkaAltanku) || 0;
      rT = E.compute(fullIn, state.config);
    }

    var html =
      '<div class="card hero">' +
      '  <div>' +
      '    <h2>' + esc(v.label) + '</h2>' +
      '    <div>' +
      '      <span class="pill">' + qty(i.sirka) + ' × ' + qty(i.hlbka) + ' m</span> ' +
      (i.terasa ? '<span class="pill">terasa ' + qty(i.sirkaAltanku) + ' m</span> ' : '') +
      (odk ? '<span class="pill">odkvap</span> ' : '') +
      (i.zateplenie !== 'none' ? '<span class="pill">zateplenie ' + (i.zateplenie === 'tatran' ? 'tatran' : 'OSB') + '</span> ' : '') +
      (warn ? '<span class="pill warn">zadaj šírku terasy</span> ' : '') +
      (warnOknoDvere ? '<span class="pill warn">okno + dvere presahujú prednú stenu — skontroluj plochy</span>' : '') +
      '    </div>' +
      '    <div class="breakdown">' +
      '      <span class="item"><span>Materiál</span> <b>' + eur(v.materialNoVat) + '</b></span>' +
      '      <span class="item"><span>Výroba (' + qty(v.vyrobaPlocha) + ' m²)</span> <b>' + eur(v.vyroba) + '</b></span>' +
      '      <span class="item"><span>Doprava</span> <b>' + eur(v.doprava) + '</b></span>' +
      '      <span class="item"><span>Montáž</span> <b>' + eur(v.montaz) + '</b></span>' +
      (v.priplatokVelkost > 0 ? '<span class="item"><span>Príplatok veľkosť</span> <b>' + eur(v.priplatokVelkost) + '</b></span>' : '') +
      (odk ? '<span class="item"><span>Odkvap (predaj bez DPH)</span> <b>' + eur(odk.predajnaBezDph) + '</b></span>' : '') +
      '      <span class="item"><span>Zisk</span> <b>' + eur(v.zisk) + '</b></span>' +
      '      <span class="item"><span>Marža</span> <b>' + pct(v.marza) + '</b></span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="price-big">' +
      '    <div class="caption">Spolu pre zákazníka</div>' +
      '    <div class="withvat">' + eur(spoluS) + '</div>' +
      '    <div class="novat">' + eur(spoluBez) + ' bez DPH · DPH ' + pct(state.config.settings.dph) + '</div>' +
      '  </div>' +
      '</div>';

    // porovnanie variantov
    html += '<div class="card"><h3 class="section">Porovnanie variantov (klikni pre výber)</h3><div class="scroll-x">' +
      '<table class="data"><thead><tr>' +
      '<th>Variant</th><th>Materiál</th><th>Výroba</th><th>Doprava</th><th>Montáž</th>' +
      '<th>Náklady spolu</th><th>Predajná bez DPH</th><th>Predaj s DPH</th><th>Zisk</th><th>Marža</th>' +
      '</tr></thead><tbody>';
    E.VARIANTS.forEach(function (vd) {
      var x = rT.variants[vd.key];
      html += '<tr class="clickable' + (vd.key === sel ? ' selected' : '') + '" data-variant="' + vd.key + '"' +
        ' tabindex="0" role="button" aria-pressed="' + (vd.key === sel ? 'true' : 'false') + '">' +
        '<td>' + (vd.key === sel ? '● ' : '') + esc(x.label) + '</td>' +
        '<td>' + eur(x.materialNoVat) + '</td>' +
        '<td>' + eur(x.vyroba) + '</td>' +
        '<td>' + eur(x.doprava) + '</td>' +
        '<td>' + eur(x.montaz) + '</td>' +
        '<td>' + eur(x.nakladySpolu) + '</td>' +
        '<td><b>' + eur(x.predajnaBezDph) + '</b></td>' +
        '<td><b>' + eur(x.predajSDph) + '</b></td>' +
        '<td>' + eur(x.zisk) + '</td>' +
        '<td>' + pct(x.marza) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>' +
      '<p class="note">Predajná bez DPH = (materiál × ' + qty(state.config.settings.marzaMaterial) +
      ' + výroba + doprava + montáž + príplatok) × ' + qty(state.config.settings.finalnyKoef) +
      '. Odkvap sa pripočítava samostatne: materiál × ' + qty(state.config.settings.odkvapKoef) +
      ' × ' + qty(state.config.settings.odkvapFinalnyKoef) + '.' +
      (!i.terasa && i.sirkaAltanku > 0
        ? ' Varianty s terasou sú počítané so šírkou terasy ' + qty(i.sirkaAltanku) + ' m.'
        : '') +
      '</p></div>';

    // rozpis materiálu
    html += '<div><h3 class="section">Rozpis materiálu — nákup (' + esc(v.label) + ')</h3>';
    var totalNoVat = 0, totalWithVat = 0;
    variantBoms(r, sel).forEach(function (sec, idx) {
      var sBez = 0, sS = 0;
      var rows = sec.bom.map(function (l) {
        sBez += l.totalNoVat; sS += l.totalWithVat;
        return '<tr><td>' + esc(l.name) + (l.note ? ' <span class="note">(' + esc(l.note) + ')</span>' : '') + '</td>' +
          '<td>' + qty(l.qty) + '</td><td style="text-align:left">' + esc(l.unit) + '</td>' +
          '<td>' + eurUnit(l.unitPrice) + '</td>' +
          '<td>' + eur(l.totalNoVat) + '</td><td>' + eur(l.totalWithVat) + '</td></tr>';
      }).join('');
      totalNoVat += sBez; totalWithVat += sS;
      html += '<details class="bom"' + (idx === 0 ? ' open' : '') + '><summary><span>' + esc(sec.label) + '</span>' +
        '<span class="sum">' + eur(sBez) + ' bez DPH · ' + eur(sS) + ' s DPH</span></summary>' +
        '<div class="inner scroll-x"><table class="data"><thead><tr>' +
        '<th>Položka</th><th>Množstvo</th><th style="text-align:left">MJ</th><th>Jedn. cena bez DPH</th><th>Spolu bez DPH</th><th>Spolu s DPH</th>' +
        '</tr></thead><tbody>' + rows +
        '<tr class="total"><td>Spolu</td><td></td><td></td><td></td><td>' + eur(sBez) + '</td><td>' + eur(sS) + '</td></tr>' +
        '</tbody></table></div></details>';
    });
    html += '<p class="note" style="margin-top:10px;">Materiál spolu: <b>' + eur(totalNoVat) + '</b> bez DPH · <b>' +
      eur(totalWithVat) + '</b> s DPH (nákupné ceny' +
      (state.inputs.zateplenie !== 'none'
        ? '; zateplenie je v rozpise raz — k materiálu domčeka sa pred maržou pripočítava ×' +
          qty(state.config.settings.zateplenieKoef)
        : '') + ').</p></div>';

    el.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Záložka: Cenník materiálov
  // ---------------------------------------------------------------------------

  function renderCennik() {
    var el = document.getElementById('tab-cennik');
    var rows = state.config.materials.map(function (m, idx) {
      var vatCell = m.vatPayer ? m.price * (1 + state.config.settings.dph) : m.price;
      return '<tr>' +
        '<td>' + esc(m.name) + (m.packQty ? ' <span class="note">(balenie ' + qty(m.packQty) + ' ks)</span>' : '') + '</td>' +
        '<td style="text-align:left"><input type="text" data-mat="' + idx + '" data-field="supplier"' +
        ' aria-label="Dodávateľ — ' + esc(m.name) + '" value="' + esc(m.supplier || '') + '"></td>' +
        '<td class="center">' + esc(m.unit) + (m.packQty ? ' <span class="note">/ balenie</span>' : '') + '</td>' +
        '<td><input type="text" inputmode="decimal" autocomplete="off" data-min="0" data-mat="' + idx + '" data-field="price"' +
        ' aria-label="Cena bez DPH — ' + esc(m.name) + '" value="' + fmtNum(m.price) + '"></td>' +
        '<td class="center"><input type="checkbox" data-mat="' + idx + '" data-field="vatPayer"' +
        ' aria-label="Platca DPH — ' + esc(m.name) + '"' + (m.vatPayer ? ' checked' : '') + '></td>' +
        '<td id="mat-vat-' + idx + '">' + eur(vatCell) + '</td>' +
        '</tr>';
    }).join('');
    el.innerHTML =
      '<div class="card">' +
      '<h3 class="section">Cenník materiálov (vstupné ceny)</h3>' +
      '<p class="note">Ceny sa zadávajú <b>bez DPH</b> — presne ako v hárku „matros". Pri klincoch a šróbach je cena za celé balenie;' +
      ' kalkulačka si prepočíta cenu za kus. „Platca DPH" = dodávateľ účtuje DPH (ovplyvňuje nákupnú cenu s DPH, nie predaj).</p>' +
      '<div class="scroll-x"><table class="data"><thead><tr>' +
      '<th>Materiál</th><th style="text-align:left">Dodávateľ</th><th class="center">MJ</th>' +
      '<th>Cena bez DPH</th><th class="center">Platca DPH</th><th>Cena s DPH</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="btn-row" style="margin-top:12px;">' +
      '<button class="btn danger" id="btn-reset-cennik">Obnoviť cenník na hodnoty z Excelu</button>' +
      '</div></div>';

    document.getElementById('btn-reset-cennik').addEventListener('click', function () {
      if (!confirm('Naozaj obnoviť všetky ceny materiálov na pôvodné hodnoty z Excelu?')) return;
      state.config.materials = E.defaultConfig().materials;
      save(); renderCennik();
    });
  }

  function updateMatVatCell(idx) {
    var m = state.config.materials[idx];
    var cell = document.getElementById('mat-vat-' + idx);
    if (cell) cell.textContent = eur(m.vatPayer ? m.price * (1 + state.config.settings.dph) : m.price);
  }

  // ---------------------------------------------------------------------------
  // Záložka: Nastavenia
  // ---------------------------------------------------------------------------

  function renderNastavenia() {
    var el = document.getElementById('tab-nastavenia');
    var s = state.config.settings;
    el.innerHTML =
      '<div class="settings-grid">' +

      '<div class="card settings-block">' +
      '<h3 class="section">DPH a sadzby</h3>' +
      '<div class="field"><label class="label" for="f-dph">DPH (%)</label>' +
      '<input id="f-dph" type="text" inputmode="decimal" autocomplete="off" data-special="dph" data-min="0"' +
      ' value="' + fmtNum(Math.round(s.dph * 1000) / 10) + '"></div>' +
      numField('Výroba — sadzba práce (€/m²)', 'config.settings.sadzbaPraceM2', { min: 0 }) +
      numField('Doprava (€)', 'config.settings.doprava', { min: 0 }) +
      '</div>' +

      '<div class="card settings-block">' +
      '<h3 class="section">Montáž — základ podľa variantu (€)</h3>' +
      numField('Domček', 'config.settings.montazZaklad.v1', { min: 0 }) +
      numField('Domček + terasa', 'config.settings.montazZaklad.v2', { min: 0 }) +
      numField('Domček + terasa + podlaha', 'config.settings.montazZaklad.v3', { min: 0 }) +
      numField('Domček + terasa + podlaha domček aj terasa', 'config.settings.montazZaklad.v4', { min: 0 }) +
      numField('Domček + podlaha', 'config.settings.montazZaklad.v5', { min: 0 }) +
      numField('Príplatok pri ploche nad 5 m²', 'config.settings.montazPriplatokNad5m2', { min: 0 }) +
      numField('Príplatok pri ploche nad 10 m²', 'config.settings.montazPriplatokNad10m2', { min: 0 }) +
      '</div>' +

      '<div class="card settings-block">' +
      '<h3 class="section">Príplatok za veľkosť (€)</h3>' +
      '<p class="note">Pripočíta sa do predajnej ceny, keď šírka aj hĺbka dosiahnu limit.</p>' +
      numField('Limit — šírka od (m)', 'config.settings.priplatokMinSirka', { min: 0 }) +
      numField('Limit — hĺbka od (m)', 'config.settings.priplatokMinHlbka', { min: 0 }) +
      numField('Domček', 'config.settings.priplatokVelkost.v1', { min: 0 }) +
      numField('Domček + terasa', 'config.settings.priplatokVelkost.v2', { min: 0 }) +
      numField('Domček + terasa + podlaha', 'config.settings.priplatokVelkost.v3', { min: 0 }) +
      numField('Domček + terasa + podlaha domček aj terasa', 'config.settings.priplatokVelkost.v4', { min: 0 }) +
      numField('Domček + podlaha', 'config.settings.priplatokVelkost.v5', { min: 0 }) +
      '</div>' +

      '<div class="card settings-block">' +
      '<h3 class="section">Koeficienty predajnej ceny</h3>' +
      numField('Marža na materiál (×)', 'config.settings.marzaMaterial', { min: 0, hint: 'materiál × tento koeficient' }) +
      numField('Finálny koeficient (×)', 'config.settings.finalnyKoef', { min: 0, hint: 'celá predajná cena × tento koeficient' }) +
      numField('Odkvap — koeficient materiálu (×)', 'config.settings.odkvapKoef', { min: 0 }) +
      numField('Odkvap — finálny koeficient (×)', 'config.settings.odkvapFinalnyKoef', { min: 0 }) +
      numField('Zateplenie — koeficient k materiálu domčeka (×)', 'config.settings.zateplenieKoef',
        { min: 0, hint: 'poznámka z Excelu „rátať ×2 do ceny domčeka" — pripočíta sa k materiálu pred maržou' }) +
      '</div>' +

      '<div class="card settings-block">' +
      '<h3 class="section">Údaje firmy (na ponuke)</h3>' +
      textField('Názov firmy', 'firma.nazov') +
      textField('Adresa', 'firma.adresa') +
      textField('IČO', 'firma.ico') +
      textField('DIČ / IČ DPH', 'firma.dic') +
      textField('Telefón', 'firma.tel') +
      textField('E-mail', 'firma.email', { type: 'email' }) +
      '</div>' +

      '<div class="card settings-block">' +
      '<h3 class="section">Záloha nastavení</h3>' +
      '<p class="note">Všetko sa automaticky ukladá v tomto prehliadači. Súbor JSON použite na prenos na iný počítač' +
      ' — obsahuje ceny, nastavenia aj údaje firmy a zákazníka.</p>' +
      '<div class="btn-row">' +
      '<button class="btn" id="btn-export">Exportovať do súboru</button>' +
      '<button class="btn" id="btn-import">Importovať zo súboru</button>' +
      '<input type="file" id="file-import" accept=".json,application/json" hidden>' +
      '<button class="btn danger" id="btn-reset-all">Obnoviť všetko na predvolené</button>' +
      '</div></div>' +

      '</div>' +
      '<p class="note" style="margin-top:14px;">Vzorec predaja (podľa smerodajnej sekcie „bez DPH" v Exceli): ' +
      '<b>predajná bez DPH = (materiál × marža + výroba + doprava + montáž + príplatok) × finálny koeficient</b>; ' +
      '<b>predaj s DPH = predajná bez DPH × (1 + DPH)</b>.</p>';

    document.getElementById('btn-export').addEventListener('click', exportJson);
    document.getElementById('btn-import').addEventListener('click', function () {
      document.getElementById('file-import').click();
    });
    document.getElementById('file-import').addEventListener('change', importJson);
    document.getElementById('btn-reset-all').addEventListener('click', function () {
      if (!confirm('Naozaj zmazať všetky uložené ceny, nastavenia aj údaje a začať odznova?')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      state = freshState();
      state.ui.tab = 'nastavenia'; // ostaň na aktuálnej záložke
      renderActiveTab();
    });
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'kalkulacka-zaloha-' + d.toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importJson(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); } catch (e) { /* ignore */ }
        state = loadState();
        state.ui.tab = 'nastavenia';
        save();
        renderActiveTab();
        alert('Nastavenia boli načítané.');
      } catch (e) {
        alert('Súbor sa nepodarilo načítať — nie je to platná záloha kalkulačky.');
      }
    };
    reader.onerror = function () {
      alert('Súbor sa nepodarilo prečítať.');
    };
    reader.onloadend = function () {
      ev.target.value = '';
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Záložka: Cenová ponuka
  // ---------------------------------------------------------------------------

  function renderPonuka() {
    var el = document.getElementById('tab-ponuka');
    var z = state.zakaznik;
    el.innerHTML =
      '<div class="ponuka-grid">' +
      '<div class="ponuka-form">' +
      '<div class="card settings-block">' +
      '<h3 class="section">Zákazník</h3>' +
      textField('Meno a priezvisko', 'zakaznik.meno') +
      textField('E-mail', 'zakaznik.email', { type: 'email' }) +
      textField('Mobil', 'zakaznik.mobil', { type: 'tel' }) +
      textField('Adresa', 'zakaznik.adresa') +
      '<div class="field"><label class="label" for="f-osadenie">Osadenie</label>' +
      '<select id="f-osadenie" data-path="zakaznik.osadenie" data-type="str">' +
      ['na zámkovú dlažbu (bez podlahy)', 'na betónové pätky (s podlahou)', 'na zemné vruty (s podlahou)'].map(function (o) {
        return '<option' + (z.osadenie === o ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') +
      '</select><span class="hint">pätky a vruty sa dodávajú s podlahou — zaškrtni „Podlaha v domčeku" v Kalkulácii</span></div>' +
      textField('Umiestnenie okna a dverí', 'zakaznik.umiestnenie', { placeholder: 'napr. dvere vľavo, okno vpravo' }) +
      '<div class="field"><label class="label" for="f-pozn">Poznámka na ponuke</label>' +
      '<textarea id="f-pozn" rows="3" data-path="zakaznik.poznamka" data-type="str">' + esc(z.poznamka) + '</textarea></div>' +
      '<div class="btn-row no-print" style="margin-top:6px;">' +
      '<button class="btn primary" id="btn-print">Vytlačiť / uložiť ako PDF</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div id="ponuka-doc"></div>' +
      '</div>';
    renderPonukaDoc();
    document.getElementById('btn-print').addEventListener('click', function () {
      renderPonukaDoc();
      window.print();
    });
  }

  function renderPonukaDoc() {
    var el = document.getElementById('ponuka-doc');
    if (!el) return;
    var r = compute();
    var sel = selectedVariantKey();
    var v = r.variants[sel];
    var i = state.inputs;
    var odk = i.odkvap ? (v.withTerasa ? r.odkvap.sTerasou : r.odkvap.bezTerasy) : null;
    var spoluBez = v.predajnaBezDph + (odk ? odk.predajnaBezDph : 0);
    var spoluS = v.predajSDph + (odk ? odk.predajSDph : 0);
    var dph = state.config.settings.dph;
    var f = state.firma;
    var z = state.zakaznik;
    var d = E.derive(engineInputs());
    var dnes = new Date().toLocaleDateString('sk-SK');

    var specRows = [
      ['Rozmer (šírka × hĺbka)', qty(i.sirka) + ' × ' + qty(i.hlbka) + ' m (' + qty(i.sirka * i.hlbka) + ' m²)'],
      ['Výška vzadu / vpredu', qty(i.vyskaZadu) + ' / ' + qty(d.vyskaPredu) + ' m'],
      ['Okno / dvere', qty(i.plochaOkna) + ' m² / ' + qty(i.plochaDveri) + ' m²'],
      ['Umiestnenie okna a dverí', z.umiestnenie || '—'],
      ['Osadenie', z.osadenie],
      ['Terasa', v.withTerasa ? 'áno, šírka ' + qty(i.sirkaAltanku) + ' m' : 'nie'],
      ['Podlaha v domčeku', v.withPodlahaDomcek ? 'áno' : 'nie'],
    ];
    if (v.withTerasa) specRows.push(['Podlaha na terase', v.withPodlahaTerasa ? 'áno' : 'nie']);
    specRows.push(['Zateplenie', i.zateplenie === 'none' ? 'nie' : (i.zateplenie === 'tatran' ? 'áno — tatranský obklad' : 'áno — záklop OSB')]);
    specRows.push(['Odkvapový systém', odk ? 'áno' : 'nie']);

    var priceRows =
      '<tr><td>' + esc(v.label) + (i.zateplenie !== 'none' ? ' vrátane zateplenia' : '') + '</td>' +
      '<td>' + eur(v.predajnaBezDph) + '</td></tr>' +
      (odk ? '<tr><td>Odkvapový systém</td><td>' + eur(odk.predajnaBezDph) + '</td></tr>' : '') +
      '<tr><td>Spolu bez DPH</td><td>' + eur(spoluBez) + '</td></tr>' +
      '<tr><td>DPH ' + pct(dph) + '</td><td>' + eur(spoluS - spoluBez) + '</td></tr>' +
      '<tr class="total"><td>Cena spolu s DPH</td><td>' + eur(spoluS) + '</td></tr>';

    el.innerHTML =
      '<div class="quote-doc">' +
      '<div class="qhead">' +
      '  <div class="firm">' +
      (f.nazov ? '' : '<div class="note no-print">Údaje firmy doplníš v Nastaveniach</div>') +
      [f.nazov && '<b>' + esc(f.nazov) + '</b>']
        .concat([f.adresa, f.ico && 'IČO: ' + f.ico, f.dic && 'DIČ: ' + f.dic, f.tel, f.email].map(function (x) { return x && esc(x); }))
        .filter(Boolean).join('<br>') +
      '  </div>' +
      '  <div><h2>Cenová ponuka</h2><div class="qmeta">Záhradný domček na mieru<br>Dátum: ' + dnes + '</div></div>' +
      '</div>' +
      '<div class="qsection"><span class="label">Zákazník</span>' +
      '  <div>' + [z.meno && '<b>' + esc(z.meno) + '</b>', esc(z.adresa || ''), esc(z.mobil || ''), esc(z.email || '')]
        .filter(Boolean).join('<br>') + (z.meno || z.adresa || z.mobil || z.email ? '' : '—') + '</div>' +
      '</div>' +
      '<div class="qsection"><span class="label">Špecifikácia</span>' +
      '<div class="scroll-x"><table class="data">' +
      specRows.map(function (row) {
        return '<tr><td>' + esc(row[0]) + '</td><td>' + esc(row[1]) + '</td></tr>';
      }).join('') +
      '</table></div></div>' +
      '<div class="qsection"><span class="label">Cena</span>' +
      '<div class="scroll-x"><table class="data">' + priceRows + '</table></div></div>' +
      (z.poznamka ? '<div class="qsection"><span class="label">Poznámka</span><div>' + esc(z.poznamka).replace(/\n/g, '<br>') + '</div></div>' : '') +
      '<div class="qfoot">Ponuka je informatívna a platí 30 dní od dátumu vystavenia. Cena zahŕňa materiál, výrobu, dopravu a montáž.</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // Prepínanie záložiek + udalosti
  // ---------------------------------------------------------------------------

  var renderers = { kalk: renderKalk, cennik: renderCennik, nastavenia: renderNastavenia, ponuka: renderPonuka };

  function renderActiveTab() {
    var tab = state.ui.tab;
    if (!Object.prototype.hasOwnProperty.call(renderers, tab)) tab = 'kalk';
    document.querySelectorAll('nav.tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
      b.setAttribute('tabindex', b.dataset.tab === tab ? '0' : '-1');
    });
    document.querySelectorAll('main [role="tabpanel"]').forEach(function (p) {
      p.hidden = p.id !== 'tab-' + tab;
    });
    renderers[tab]();
  }

  var tablist = document.querySelector('nav.tabs');
  tablist.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-tab]');
    if (!btn) return;
    state.ui.tab = btn.dataset.tab;
    save();
    renderActiveTab();
  });
  // klávesová navigácia záložiek šípkami
  tablist.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    var btns = Array.prototype.slice.call(tablist.querySelectorAll('button[data-tab]'));
    var idx = btns.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
    if (idx < 0) return;
    var next = (idx + (ev.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
    state.ui.tab = btns[next].dataset.tab;
    save();
    renderActiveTab();
    btns[next].focus();
    ev.preventDefault();
  });

  // číslo z poľa s clampom na data-min
  function readNum(t) {
    var n = parseNum(t.value);
    if (t.dataset.min !== undefined) {
      var mn = Number(t.dataset.min);
      if (isFinite(mn) && n < mn) n = mn;
    }
    return n;
  }

  // re-render formulára bez straty fokusu (checkbox zobrazuje/skrýva závislé polia)
  function rerenderKalkFormKeepFocus() {
    var ae = document.activeElement;
    var key = ae && ae.dataset ? ae.dataset.path : null;
    renderKalkForm();
    if (key) {
      var el = document.querySelector('#kalk-form [data-path="' + key + '"]');
      if (el) el.focus();
    }
  }

  // spoločné spracovanie zmeny ovládacieho prvku (input aj change udalosti —
  // change je fallback pre selecty/checkboxy v starších prehliadačoch; ak je
  // hodnota už v stave, nič sa nedeje)
  function handleControl(t) {
    // cenník materiálov
    if (t.dataset.mat != null) {
      var m = state.config.materials[Number(t.dataset.mat)];
      if (!m) return;
      if (t.dataset.field === 'price') {
        var p = readNum(t);
        if (m.price === p) return;
        m.price = p;
      } else if (t.dataset.field === 'supplier') {
        if (m.supplier === t.value) return;
        m.supplier = t.value;
      } else if (t.dataset.field === 'vatPayer') {
        if (m.vatPayer === t.checked) return;
        m.vatPayer = t.checked;
      }
      updateMatVatCell(Number(t.dataset.mat));
      save();
      return;
    }

    // DPH v percentách
    if (t.dataset.special === 'dph') {
      var dph = readNum(t) / 100;
      if (state.config.settings.dph === dph) return;
      state.config.settings.dph = dph;
      save();
      return;
    }

    if (!t.dataset.path) return;
    var type = t.dataset.type;
    var val;
    if (type === 'num') val = readNum(t);
    else if (type === 'bool') val = t.checked;
    else val = t.value;
    if (getPath(t.dataset.path) === val) return;
    setPath(t.dataset.path, val);
    save();

    var tab = state.ui.tab;
    if (tab === 'kalk') {
      if (type === 'bool') rerenderKalkFormKeepFocus(); // zobraz/skry závislé polia
      else renderKalkDerived();
      renderKalkOut();
    } else if (tab === 'ponuka') {
      renderPonukaDoc();
    }
  }

  document.querySelector('main').addEventListener('input', function (ev) {
    handleControl(ev.target);
  });
  document.querySelector('main').addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'file') return handleControl(t);
  });

  // klik / Enter / medzerník na riadok variantu → nastav voľby podľa variantu
  function applyVariantRow(tr) {
    var k = tr.dataset.variant;
    var i = state.inputs;
    i.terasa = k === 'v2' || k === 'v3' || k === 'v4';
    i.podlahaDomcek = k === 'v3' || k === 'v4' || k === 'v5';
    i.podlahaTerasa = k === 'v4';
    save();
    renderKalkForm();
    renderKalkOut();
  }
  document.querySelector('main').addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-variant]');
    if (tr) applyVariantRow(tr);
  });
  document.querySelector('main').addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var tr = ev.target.closest && ev.target.closest('tr[data-variant]');
    if (!tr) return;
    ev.preventDefault();
    applyVariantRow(tr);
  });

  function parseNum(s) {
    var n = parseFloat(String(s).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  // tlač z inej záložky: dočasne prepni na Ponuku a po tlači sa vráť
  var printPrevTab = null;
  window.addEventListener('beforeprint', function () {
    if (state.ui.tab !== 'ponuka') {
      printPrevTab = state.ui.tab;
      state.ui.tab = 'ponuka';
      renderActiveTab();
    }
  });
  window.addEventListener('afterprint', function () {
    if (printPrevTab) {
      state.ui.tab = printPrevTab;
      printPrevTab = null;
      renderActiveTab();
    }
  });

  renderActiveTab();
})();
