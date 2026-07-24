/*
 * Výpočtové jadro kalkulačky záhradných domčekov.
 *
 * Verná replika logiky z KALKULACKA_FINAL.xlsx — smerodajná je spodná sekcia
 * „bez DPH" na hárku `kalkulacka` (riadky 44–51):
 *   predajná cena BEZ DPH = (materiál×maržaMat + výroba + doprava + montáž + príplatok) × finálnyKoef
 *   predaj s DPH          = predajná cena BEZ DPH × (1 + DPH)
 *
 * Množstvá materiálu sa počítajú podľa hárkov domček / terasa / podlaha v domceku /
 * podlaha terasa / zateplenie domčeka / žľab + zvod; jednotkové ceny podľa hárku matros.
 *
 * Plain script (žiadne moduly) — funguje aj cez file:// aj v Node
 * (globalThis.KalkEngine).
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Cenník materiálov (hárok matros). `price` = cena bez DPH.
  // `packQty` = veľkosť balenia — jednotková cena položky = price / packQty.
  // `vatPayer` = dodávateľ je platca DPH → nákupná cena s DPH = price × (1+DPH),
  //              inak sa DPH nepripočítava (cena s DPH = cena bez DPH).
  // ---------------------------------------------------------------------------
  var DEFAULT_MATERIALS = [
    { key: 'kvh4060',        name: 'KVH 40/60',            unit: 'm3',    price: 520,    vatPayer: true, supplier: '' },
    { key: 'fosna45120',     name: 'Fošňa 45/120',         unit: 'm3',    price: 452.79, vatPayer: true, supplier: '' },
    { key: 'kvh120120',      name: 'KVH 120/120',          unit: 'm3',    price: 619.65, vatPayer: true, supplier: '' },
    { key: 'latecky1895',    name: 'Latečky 18/95',        unit: 'm3',    price: 627.6,  vatPayer: true, supplier: '' },
    { key: 'stresnaFolia',   name: 'Strešná fólia',        unit: 'm2',    price: 0.64,   vatPayer: true, supplier: 'KJG' },
    { key: 'plechTrapez',    name: 'Plech trapéz',         unit: 'm2',    price: 8.02,   vatPayer: true, supplier: 'KJG' },
    { key: 'osb22',          name: 'OSB doska 22 mm',      unit: 'm2',    price: 5.89,   vatPayer: true, supplier: 'Sezam' },
    { key: 'osb12',          name: 'OSB doska 12 mm',      unit: 'm2',    price: 3.21,   vatPayer: true, supplier: 'Sezam' },
    { key: 'fasadnaFolia',   name: 'Fasádna fólia',        unit: 'm2',    price: 2.88,   vatPayer: true, supplier: 'Jutadach shop' },
    { key: 'nozicky',        name: 'Nožičky na domček',    unit: 'ks',    price: 0.2,    vatPayer: true, supplier: 'Allegro' },
    { key: 'plechZaveterky', name: 'Plech záveterky',      unit: 'bm',    price: 3.2,    vatPayer: true, supplier: 'KJG' },
    { key: 'okno',           name: 'Okno',                 unit: 'ks',    price: 83.33,  vatPayer: true, supplier: 'OBI' },
    { key: 'dvere',          name: 'Dvere',                unit: 'ks',    price: 270,    vatPayer: true, supplier: 'OBI' },
    { key: 'klucka',         name: 'Kľučka',               unit: 'ks',    price: 0,      vatPayer: true, supplier: 'OBI' },
    { key: 'zamok',          name: 'Zámok',                unit: 'ks',    price: 0,      vatPayer: true, supplier: 'OBI' },
    { key: 'kluckaOkno',     name: 'Kľučka okno + krytka', unit: 'ks',    price: 0,      vatPayer: true, supplier: 'OBI' },
    { key: 'klince50',       name: 'Klince 50 mm',         unit: 'ks',    price: 8.05,   packQty: 6000, vatPayer: true, supplier: 'Extol' },
    { key: 'sroby5x50',      name: 'Šróby 5×50',           unit: 'ks',    price: 6.26,   packQty: 300,  vatPayer: true, supplier: 'TK Progres' },
    { key: 'sroby5x90',      name: 'Šróby 5×90',           unit: 'ks',    price: 6.84,   packQty: 200,  vatPayer: true, supplier: 'TK Progres' },
    { key: 'sroby6x160',     name: 'Šróby 6×160',          unit: 'ks',    price: 11.2,   packQty: 100,  vatPayer: true, supplier: 'TK Progres' },
    { key: 'sroby6x140',     name: 'Šróby 6×140',          unit: 'ks',    price: 8.57,   packQty: 100,  vatPayer: true, supplier: 'TK Progres' },
    { key: 'farba',          name: 'Farba',                unit: 'liter', price: 8.93,   vatPayer: true, supplier: 'U maliara' },
    { key: 'tatranProfil',   name: 'Tatranský profil',     unit: 'm2',    price: 10,     vatPayer: true, supplier: '' },
    { key: 'kotvenieStlpov', name: 'Kotvenie stĺpov',      unit: 'ks',    price: 6.25,   vatPayer: true, supplier: 'TK Progres' },
    { key: 'zlab',           name: 'Žľab',                 unit: 'm',     price: 4.24,   vatPayer: true, supplier: 'KJG' },
    { key: 'zlabovyHak',     name: 'Žľabový hák',          unit: 'ks',    price: 2.38,   vatPayer: true, supplier: 'KJG' },
    { key: 'zlaboveCelo',    name: 'Žľabové čelo',         unit: 'ks',    price: 1.86,   vatPayer: true, supplier: 'KJG' },
    { key: 'zlabovyKotlik',  name: 'Žľabový kotlík',       unit: 'ks',    price: 4.62,   vatPayer: true, supplier: 'KJG' },
    { key: 'zvod80',         name: 'Zvod 80 mm',           unit: 'm',     price: 5.04,   vatPayer: true, supplier: 'KJG' },
    { key: 'zvodKolienko90', name: 'Zvod kolienko 90°',    unit: 'ks',    price: 3.85,   vatPayer: true, supplier: 'KJG' },
    { key: 'vata50',         name: 'Vata 50 mm',           unit: 'm2',    price: 2.5,    vatPayer: true, supplier: 'Profistavebniny' },
    { key: 'vata120',        name: 'Vata 120 mm',          unit: 'm2',    price: 5,      vatPayer: true, supplier: 'Profistavebniny' },
    { key: 'rohovaLista',    name: 'Rohová lišta',         unit: 'bm',    price: 1.25,   vatPayer: true, supplier: 'Merkury' },
  ];

  var DEFAULT_SETTINGS = {
    dph: 0.23,               // sadzba DPH (matros N2 = 1,23)
    sadzbaPraceM2: 13.84,    // kalkulacka I4 — výroba € / m²
    doprava: 200,            // kalkulacka E45–E49
    // montáž = základ podľa variantu + príplatky podľa plochy (šírka × hĺbka)
    montazZaklad: { v1: 300, v2: 400, v3: 400, v4: 450, v5: 350 },
    montazPriplatokNad10m2: 100,
    montazPriplatokNad5m2: 50,
    // veľkostný príplatok v predajnej cene, keď šírka aj hĺbka ≥ limit.
    // (V Exceli sekcia „s DPH" používa B2≥4 ∧ B3≥4; sekcia „bez DPH" má chybný
    //  odkaz B17/B18, ktorý bol vždy pravdivý — tu je zámer: rozmerová podmienka.)
    priplatokVelkost: { v1: 150, v2: 200, v3: 300, v4: 300, v5: 200 },
    priplatokMinSirka: 4,
    priplatokMinHlbka: 4,
    marzaMaterial: 1.5,      // materiál × 1,5 v predajnej cene
    finalnyKoef: 1.12,       // celá predajná cena × 1,12
    odkvapKoef: 3,           // odkvap: materiál × 3
    odkvapFinalnyKoef: 1.12, // … × 1,12  (kalkulacka I51)
    zateplenieKoef: 2,       // poznámka v Exceli: „rátať x2 do ceny domčeka"
    // Doplnky terasy — predajné ceny bez DPH podľa poznámok v Exceli
    // (kalkulacka!G11–G13): „zabradlie 75e za meter", „plna stena … 90€ m2",
    // „lamelova stena 100€/bm". Pripočítavajú sa k predajnej cene priamo
    // (bez marže ×1,5 a koeficientu ×1,12 — sú to už predajné sadzby).
    terasaZabradlieBm: 75,
    terasaPlnaStenaM2: 90,
    terasaLamelovaBm: 100,
  };

  var DEFAULT_INPUTS = {
    sirka: 4,          // m (kalkulacka B2)
    hlbka: 2.5,        // m (kalkulacka B3)
    vyskaZadu: 2.1,    // m (kalkulacka B5); výška vpredu = vzadu + hĺbka×5 %
    plochaOkna: 0.6,   // m² (kalkulacka B6)
    plochaDveri: 2,    // m² (kalkulacka B7)
    sirkaAltanku: 0,   // m (kalkulacka B8) — šírka terasy/prístrešku
    odkvap: true,
    zateplenie: 'none', // 'none' | 'osb' | 'tatran'
  };

  var VARIANTS = [
    { key: 'v1', label: 'Domček' },
    { key: 'v2', label: 'Domček + terasa' },
    { key: 'v3', label: 'Domček + terasa + podlaha domček' },
    { key: 'v4', label: 'Domček + terasa + podlaha domček aj terasa' },
    { key: 'v5', label: 'Domček + podlaha domček' },
  ];

  function defaultConfig() {
    return JSON.parse(JSON.stringify({ settings: DEFAULT_SETTINGS, materials: DEFAULT_MATERIALS }));
  }

  // ---------------------------------------------------------------------------
  // Pomocné funkcie
  // ---------------------------------------------------------------------------

  // konečné číslo alebo 0 (chráni pred NaN aj Infinity vo vstupoch a configu)
  function fin(x) {
    var n = Number(x);
    return isFinite(n) ? n : 0;
  }
  function max0(x) { return x > 0 ? x : 0; }

  // náhrada za materiál, ktorý v cenníku chýba — výpočet nespadne, položka je za 0
  var MISSING_MAT = { key: 'chyba', name: 'Materiál chýba v cenníku', unit: '', price: 0, vatPayer: false };

  function matMap(config) {
    var m = {};
    (config.materials || []).forEach(function (it) { if (it && it.key) m[it.key] = it; });
    return m;
  }

  // Jednotková cena bez DPH (pri baleniach cena za kus z balenia).
  function unitPrice(mat) {
    mat = mat || MISSING_MAT;
    var q = fin(mat.packQty) > 0 ? fin(mat.packQty) : 1;
    return fin(mat.price) / q;
  }

  function vatFactor(mat, dph) {
    return mat.vatPayer ? 1 + fin(dph) : 1;
  }

  // Položka rozpisu: množstvo × jednotková cena (bez DPH aj s DPH nákupnou).
  function line(mat, qty, dph, noteOrOpts) {
    mat = mat || MISSING_MAT;
    var opts = typeof noteOrOpts === 'string' ? { note: noteOrOpts } : (noteOrOpts || {});
    var up = opts.unitPriceOverride != null ? opts.unitPriceOverride : unitPrice(mat);
    var totalNoVat = qty * up * (opts.priceKoef != null ? opts.priceKoef : 1);
    return {
      key: mat.key,
      name: opts.label || mat.name,
      qty: qty,
      unit: opts.unit || mat.unit,
      unitPrice: up,
      totalNoVat: totalNoVat,
      totalWithVat: totalNoVat * vatFactor(mat, dph),
      note: opts.note || '',
    };
  }

  function sumNoVat(lines) {
    return lines.reduce(function (s, l) { return s + l.totalNoVat; }, 0);
  }
  function sumWithVat(lines) {
    return lines.reduce(function (s, l) { return s + l.totalWithVat; }, 0);
  }

  // ---------------------------------------------------------------------------
  // Odvodené rozmery (kalkulacka B4, B11–B15)
  // ---------------------------------------------------------------------------
  function derive(inputs) {
    inputs = inputs || {};
    var s = fin(inputs.sirka);
    var h = fin(inputs.hlbka);
    var vz = fin(inputs.vyskaZadu);
    var vp = vz + (h * 5) / 100; // spád strechy 5 cm na meter hĺbky
    var okno = fin(inputs.plochaOkna);
    var dvere = fin(inputs.plochaDveri);
    var alt = fin(inputs.sirkaAltanku);
    return {
      sirka: s, hlbka: h, vyskaZadu: vz, vyskaPredu: vp,
      plochaOkna: okno, plochaDveri: dvere, sirkaAltanku: alt,
      prednaStena: s * vp - (okno + dvere),
      bocneSteny: ((vp + vz) / 2) * h * 2,
      zadnaStena: s * vz,
      strecha: s * h,
      pristresok: alt * h,
    };
  }

  // ---------------------------------------------------------------------------
  // Rozpisy materiálu (BOM) — vzorce 1:1 z hárkov Excelu, stĺpec „cena bez dph".
  // `clampNegativeQty` (default true) ošetruje degenerované záporné množstvá
  // (v Exceli terasa!C3 pri šírke altánku < 0,5 m vychádza záporne).
  // ---------------------------------------------------------------------------

  function bomDomcek(d, config, opt) {
    var m = matMap(config);
    var dph = fin((config.settings || {}).dph);
    var steny = d.prednaStena + d.bocneSteny + d.zadnaStena;
    var stenyStrecha = steny + d.strecha;
    var lateckyKs = ((d.sirka * 2 + d.hlbka * 2) * 15 + 25);
    var lines = [
      line(m.kvh4060, ((d.hlbka * 14) + (7 * d.sirka) + (8.667 * d.sirka)) * 0.04 * 0.06 * 1.1, dph),
      // v Exceli ocenené sadzbou fošne 45/120 (domček!D3 → matros!C3)
      line(m.fosna45120, 3.2 * ((d.sirka + 0.12) * (d.hlbka + 0.12)) * 0.05 * 0.12 * 1.1, dph,
        { label: 'KVH 120/120', note: 'cena sadzbou fošňa 45/120' }),
      line(m.stresnaFolia, ((d.sirka + 0.2) * (d.hlbka + 0.2)) * 1.1, dph),
      line(m.plechTrapez, (d.sirka * d.hlbka) * 1.1, dph),
      line(m.plechZaveterky, d.vyskaPredu * 2 + d.vyskaZadu * 2, dph, { label: 'Plech rohy', unit: 'bm' }),
      line(m.osb12, stenyStrecha * 1.25, dph),
      line(m.fasadnaFolia, stenyStrecha * 1.1, dph),
      line(m.nozicky, 8, dph),
      line(m.plechZaveterky, (d.sirka + 0.12) * 2 + (d.hlbka + 0.12) * 2, dph),
      line(m.okno, 1, dph),
      line(m.dvere, 1, dph),
      // latečky: kusy → objem dreva (2,5 m × 18 mm × 95 mm na kus) × cena za m³
      line(m.latecky1895, lateckyKs, dph, {
        unit: 'ks', unitPriceOverride: 2.5 * 0.018 * 0.095 * unitPrice(m.latecky1895),
        note: (2.5 * 0.018 * 0.095 * lateckyKs).toFixed(3).replace('.', ',') + ' m3 dreva',
      }),
      line(m.klince50, lateckyKs * 15, dph),
      line(m.sroby5x90, (16 * d.hlbka) + (8 * d.sirka) + (14 * d.sirka) + 32, dph),
      line(m.farba,
        (((d.sirka * d.vyskaZadu * 2) / 6) + ((d.hlbka * d.vyskaPredu * 4) / 6)
          + (((d.sirka * d.vyskaPredu * 2) / 6) - (d.plochaDveri + d.plochaOkna))) * 0.7,
        dph),
    ];
    return clampLines(lines, opt);
  }

  function bomTerasa(d, config, opt) {
    var m = matMap(config);
    var dph = fin((config.settings || {}).dph);
    var alt = d.sirkaAltanku;
    // KVH 45/120: hranoly po 0,5 m mínus jeden + 2 pozdĺžne — v bm, potom na m³
    var kvh45bm = ((((alt / 0.5) - 1) * d.hlbka) + (alt * 2)) * 1.1;
    var lines = [
      line(m.kvh120120, ((d.hlbka + d.vyskaPredu + d.vyskaZadu) * 1.1) * 0.12 * 0.12 * 1.1, dph,
        { label: 'KVH 120/120 (stĺpy + väznica)' }),
      line(m.fosna45120, kvh45bm * 0.045 * 0.12 * 1.1, dph, { label: 'KVH 45/120 (krokvy)' }),
      line(m.tatranProfil, d.hlbka * alt, dph),
      line(m.stresnaFolia, (d.hlbka + 0.2) * (alt + 0.2) * 1.1, dph),
      line(m.plechTrapez, d.hlbka * alt, dph, { priceKoef: 1.1, note: 'cena ×1,1 (prirezanie)' }),
      line(m.plechZaveterky, alt * 2, dph),
      line(m.kotvenieStlpov, 2, dph),
      line(m.farba, ((alt * d.hlbka) * 2) / 6, dph),
      line(m.sroby5x90, alt * 8, dph),
      line(m.sroby6x160, alt * 4 + 4, dph),
    ];
    return clampLines(lines, opt);
  }

  function bomPodlahaDomcek(d, config, opt) {
    var m = matMap(config);
    var dph = fin((config.settings || {}).dph);
    var plocha = (d.sirka + 0.12) * (d.hlbka + 0.12);
    var osbM2 = plocha * 1.2;
    var lines = [
      line(m.fosna45120, 3.2 * plocha * 0.045 * 0.12 * 1.15, dph),
      line(m.osb22, osbM2, dph),
      line(m.sroby5x50, 5.2 * osbM2, dph),
      line(m.sroby5x90, plocha * 4.84, dph),
      line(m.sroby6x160, plocha * 1.82, dph),
      line(m.plechZaveterky, (d.sirka + 0.12) * 2 + (d.hlbka + 0.12) * 2, dph,
        { label: 'Oplechovanie podlahy zvonku' }),
    ];
    return clampLines(lines, opt);
  }

  function bomPodlahaTerasa(d, config, opt) {
    var m = matMap(config);
    var dph = fin((config.settings || {}).dph);
    var alt = d.sirkaAltanku;
    var zaklad = alt * (d.hlbka + 0.12);
    var lines = [
      line(m.fosna45120, zaklad * 3.35 * 0.045 * 0.12, dph),
      // dosky 2,5/100 — v Exceli ocenené sadzbou za m³ ako latečky 18/95
      line(m.latecky1895, zaklad * 0.025 * 1.1, dph, { label: 'Dosky 2,5/100', unit: 'm3' }),
      line(m.sroby5x50, zaklad * 41.55, dph),
      line(m.sroby5x90, zaklad * 5.7, dph),
      line(m.sroby6x160, zaklad * 1.9, dph),
    ];
    return clampLines(lines, opt);
  }

  // Zateplenie: dve varianty záklopu (OSB / tatranský obklad); spoločný základ.
  function bomZateplenie(d, config, variant, opt) {
    var m = matMap(config);
    var dph = fin((config.settings || {}).dph);
    var steny = d.prednaStena + d.bocneSteny + d.zadnaStena;
    var zaklopM2 = steny + d.strecha + d.strecha * 1.1;
    var lines = [
      line(m.vata120, d.strecha * 1.1, dph, { label: 'Vata 120 mm — podlaha' }),
      line(m.vata120, d.strecha * 1.1, dph, { label: 'Vata 120 mm — strecha' }),
      line(m.vata50, steny * 1.1, dph, { label: 'Vata 50 mm — steny' }),
      variant === 'tatran'
        ? line(m.tatranProfil, zaklopM2, dph, { label: 'Záklop tatranským obkladom' })
        : line(m.osb12, zaklopM2, dph, { label: 'Záklop OSB doskou' }),
      line(m.rohovaLista, ((d.sirka * 4) + (4 * d.hlbka)) * 1.1, dph, { label: 'Olištovanie' }),
      line(m.osb12, d.strecha * 1.1, dph, { label: 'OSB doska pod podlahu' }),
    ];
    return clampLines(lines, opt);
  }

  // Odkvapový systém (hárok „žľab + zvod"). Žľab vedie po šírke domčeka
  // + šírke terasy (ak je terasa).
  function bomOdkvap(d, config, maTerasu, opt) {
    var m = matMap(config);
    var dph = fin((config.settings || {}).dph);
    var zlabM = maTerasu ? d.sirka + d.sirkaAltanku : d.sirka;
    var lines = [
      line(m.zlab, zlabM, dph),
      line(m.zvod80, d.vyskaZadu, dph, { label: 'Zvod' }),
      line(m.zlabovyKotlik, 1, dph),
      line(m.zlabovyHak, zlabM, dph),
      line(m.zlaboveCelo, 2, dph),
      line(m.zvodKolienko90, 1, dph),
    ];
    return clampLines(lines, opt);
  }

  function clampLines(lines, opt) {
    var clamp = !opt || opt.clampNegativeQty !== false;
    if (!clamp) return lines;
    return lines.map(function (l) {
      if (l.qty < 0) {
        return Object.assign({}, l, { qty: 0, totalNoVat: 0, totalWithVat: 0, note: (l.note ? l.note + '; ' : '') + 'záporné množstvo → 0' });
      }
      return l;
    });
  }

  // ---------------------------------------------------------------------------
  // Cenotvorba variantov — sekcia „bez DPH" (kalkulacka riadky 44–49)
  // ---------------------------------------------------------------------------

  function priceVariant(variantKey, d, config, boms, opt) {
    var st = config.settings || {};
    var withTerasa = variantKey === 'v2' || variantKey === 'v3' || variantKey === 'v4';
    var withPodlahaD = variantKey === 'v3' || variantKey === 'v4' || variantKey === 'v5';
    var withPodlahaT = variantKey === 'v4';

    var matNoVat = sumNoVat(boms.domcek)
      + (withTerasa ? sumNoVat(boms.terasa) : 0)
      + (withPodlahaD ? sumNoVat(boms.podlahaDomcek) : 0)
      + (withPodlahaT ? sumNoVat(boms.podlahaTerasa) : 0);

    // Zateplenie: poznámka v Exceli „rátať x2 do ceny domčeka" —
    // 2× materiál zateplenia sa pripočíta k materiálu domčeka pred prirážkami.
    var zateplenieNoVat = 0;
    if (opt && opt.zateplenie && opt.zateplenie !== 'none') {
      zateplenieNoVat = sumNoVat(boms.zateplenie) * fin(st.zateplenieKoef);
      matNoVat += zateplenieNoVat;
    }

    // výroba: plocha stien + strecha (+ prístrešok pri terase,
    // + strecha/2 pri podlahe domčeka, + prístrešok znova pri podlahe terasy).
    // Záporné plochy (okno+dvere väčšie než predná stena) sa do práce nerátajú —
    // mimo Excel režimu (opt.clampNegativeQty === false necháva surové hodnoty).
    var rawAreas = !opt || opt.clampNegativeQty !== false ? max0 : function (x) { return x; };
    var vyrobaPlocha = rawAreas(d.prednaStena) + rawAreas(d.bocneSteny) + rawAreas(d.zadnaStena) + rawAreas(d.strecha)
      + (withTerasa ? rawAreas(d.pristresok) : 0)
      + (withPodlahaD ? rawAreas(d.strecha) / 2 : 0)
      + (withPodlahaT ? rawAreas(d.pristresok) : 0);
    var vyroba = vyrobaPlocha * fin(st.sadzbaPraceM2);

    var plocha = d.sirka * d.hlbka;
    var montaz = fin((st.montazZaklad || {})[variantKey])
      + (plocha > 10 ? fin(st.montazPriplatokNad10m2) : 0)
      + (plocha > 5 ? fin(st.montazPriplatokNad5m2) : 0);

    var doprava = fin(st.doprava);

    var bonusApplies = opt && opt.bonusAlways
      ? true
      : (d.sirka >= fin(st.priplatokMinSirka) && d.hlbka >= fin(st.priplatokMinHlbka));
    var priplatok = bonusApplies ? fin((st.priplatokVelkost || {})[variantKey]) : 0;

    var nakladySpolu = matNoVat + vyroba + doprava + montaz; // „cena final bez dph bez marže"
    var predajnaBezDph = (matNoVat * fin(st.marzaMaterial) + vyroba + doprava + montaz + priplatok) * fin(st.finalnyKoef);
    var predajSDph = predajnaBezDph * (1 + fin(st.dph));
    var zisk = predajnaBezDph - nakladySpolu;

    return {
      key: variantKey,
      label: VARIANTS.filter(function (v) { return v.key === variantKey; })[0].label,
      withTerasa: withTerasa,
      withPodlahaDomcek: withPodlahaD,
      withPodlahaTerasa: withPodlahaT,
      materialNoVat: matNoVat,
      zateplenieNoVat: zateplenieNoVat,
      vyrobaPlocha: vyrobaPlocha,
      vyroba: vyroba,
      doprava: doprava,
      montaz: montaz,
      priplatokVelkost: priplatok,
      nakladySpolu: nakladySpolu,
      predajnaBezDph: predajnaBezDph,
      predajSDph: predajSDph,
      zisk: zisk,
      // null = marža nedáva zmysel (nulová/záporná či nečíselná predajná cena)
      marza: isFinite(zisk) && isFinite(predajnaBezDph) && predajnaBezDph > 0 ? zisk / predajnaBezDph : null,
    };
  }

  // Odkvap (kalkulacka B51/I51/J51): materiál × 3 × 1,12 = predajná bez DPH.
  function priceOdkvap(bom, config) {
    var st = config.settings || {};
    var matNoVat = sumNoVat(bom);
    var predajnaBezDph = matNoVat * fin(st.odkvapKoef) * fin(st.odkvapFinalnyKoef);
    return {
      materialNoVat: matNoVat,
      materialWithVat: sumWithVat(bom),
      predajnaBezDph: predajnaBezDph,
      predajSDph: predajnaBezDph * (1 + fin(st.dph)),
    };
  }

  // ---------------------------------------------------------------------------
  // Hlavný výpočet
  // ---------------------------------------------------------------------------
  // opt: { bonusAlways?: bool, clampNegativeQty?: bool }  (na testy / porovnanie s Excelom)
  function compute(inputs, config, opt) {
    opt = opt || {};
    inputs = inputs || {};
    config = config || defaultConfig();
    var d = derive(inputs);
    var boms = {
      domcek: bomDomcek(d, config, opt),
      terasa: bomTerasa(d, config, opt),
      podlahaDomcek: bomPodlahaDomcek(d, config, opt),
      podlahaTerasa: bomPodlahaTerasa(d, config, opt),
      zateplenie: bomZateplenie(d, config, inputs.zateplenie === 'tatran' ? 'tatran' : 'osb', opt),
      // odkvap v oboch režimoch — dĺžka žľabu závisí od toho, či variant má terasu
      odkvapBezTerasy: bomOdkvap(d, config, false, opt),
      odkvapSTerasou: bomOdkvap(d, config, true, opt),
    };
    var variants = {};
    VARIANTS.forEach(function (v) {
      variants[v.key] = priceVariant(v.key, d, config, boms,
        { zateplenie: inputs.zateplenie, bonusAlways: opt.bonusAlways });
    });
    var odkvap = {
      bezTerasy: priceOdkvap(boms.odkvapBezTerasy, config),
      sTerasou: priceOdkvap(boms.odkvapSTerasou, config),
    };

    var componentTotals = {};
    Object.keys(boms).forEach(function (k) {
      componentTotals[k] = { noVat: sumNoVat(boms[k]), withVat: sumWithVat(boms[k]) };
    });

    return {
      derived: d,
      boms: boms,
      componentTotals: componentTotals,
      variants: variants,
      odkvap: odkvap,
    };
  }

  // Doplnky terasy — uzatvorenie strán (zábradlie / priehľadná lamelová /
  // plná stena). `strany` = { predna, zadna, vonkajsia } s hodnotami
  // 'none' | 'zabradlie' | 'lamelova' | 'plna'.
  // Výšky stien: fasáda = svetlá výška (vyskaZadu + 15 cm konštrukcia),
  // mínus lemovanie 18 cm (podľa návrhára).
  function terasaDoplnky(inputs, config, strany) {
    config = config || defaultConfig();
    var st = config.settings || {};
    var d = derive(inputs);
    strany = strany || {};
    var FASC = 0.18;
    var hloF = d.vyskaZadu + 0.15 - FASC;                 // svetlá stena vzadu
    var hhiF = d.vyskaZadu + 0.15 + d.hlbka * 0.05 - FASC; // vpredu
    var items = [];
    function side(key, label, len, hWall) {
      var t = strany[key];
      if (!t || t === 'none' || !(len > 0)) return;
      if (t === 'zabradlie') {
        items.push({ key: key, label: 'Zábradlie — ' + label, qty: len, unit: 'bm',
          rate: fin(st.terasaZabradlieBm), total: len * fin(st.terasaZabradlieBm) });
      } else if (t === 'lamelova') {
        items.push({ key: key, label: 'Priehľadná (lamelová) stena — ' + label, qty: len, unit: 'bm',
          rate: fin(st.terasaLamelovaBm), total: len * fin(st.terasaLamelovaBm) });
      } else if (t === 'plna') {
        var m2 = len * max0(hWall);
        items.push({ key: key, label: 'Plná stena — ' + label, qty: m2, unit: 'm2',
          rate: fin(st.terasaPlnaStenaM2), total: m2 * fin(st.terasaPlnaStenaM2) });
      }
    }
    side('predna', 'predná strana', d.sirkaAltanku, hhiF);
    side('zadna', 'zadná strana', d.sirkaAltanku, hloF);
    side('vonkajsia', 'vonkajšia strana', d.hlbka, (hhiF + hloF) / 2);
    var bez = items.reduce(function (s, i) { return s + i.total; }, 0);
    return { items: items, predajnaBezDph: bez, predajSDph: bez * (1 + fin(st.dph)) };
  }

  // Výber variantu podľa volieb (logika KALKMAKE K2/L2 + rozšírenie o v4).
  function pickVariant(terasa, podlahaDomcek, podlahaTerasa) {
    if (terasa && podlahaDomcek && podlahaTerasa) return 'v4';
    if (terasa && podlahaDomcek) return 'v3';
    if (terasa) return 'v2';
    if (podlahaDomcek) return 'v5';
    return 'v1';
  }

  global.KalkEngine = {
    VARIANTS: VARIANTS,
    DEFAULT_MATERIALS: DEFAULT_MATERIALS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    defaultConfig: defaultConfig,
    derive: derive,
    compute: compute,
    pickVariant: pickVariant,
    terasaDoplnky: terasaDoplnky,
    unitPrice: unitPrice,
  };
})(typeof window !== 'undefined' ? window : globalThis);
