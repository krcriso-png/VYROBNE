/*
 * Test parity s KALKULACKA_FINAL.xlsx.
 * Spustenie: node kalkulacka/test.js
 *
 * Očakávané hodnoty sú presné čísla vypočítané Excelom pri vstupoch
 * šírka 4, hĺbka 2,5, výška vzadu 2,1, okno 0,6 m², dvere 2 m², altánok 0 m.
 *
 * Režim porovnania s Excelom:
 *  - bonusAlways: true  → sekcia „bez DPH" v Exceli má chybný odkaz (B17/B18),
 *    takže veľkostný príplatok pripočítava VŽDY; replikujeme kvôli parite.
 *  - clampNegativeQty: false → Excel necháva záporné množstvo KVH 45/120
 *    na terase pri šírke altánku < 0,5 m; replikujeme kvôli parite.
 */
require('./engine.js');
const E = globalThis.KalkEngine;

let failures = 0;
function eq(name, actual, expected, tol = 1e-9) {
  const ok = Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}: actual=${actual} expected=${expected}`);
  } else {
    console.log(`ok   ${name} = ${actual}`);
  }
}

const config = E.defaultConfig();
const inputs = { ...E.DEFAULT_INPUTS };
const excelMode = { bonusAlways: true, clampNegativeQty: false };
const r = E.compute(inputs, config, excelMode);

// --- odvodené rozmery (kalkulacka B4, B11–B15) ---
eq('výška vpredu (B4)', r.derived.vyskaPredu, 2.225);
eq('predná stena (B11)', r.derived.prednaStena, 6.300000000000001);
eq('bočné steny (B12)', r.derived.bocneSteny, 10.8125);
eq('zadná stena (B13)', r.derived.zadnaStena, 8.4);
eq('strecha (B14)', r.derived.strecha, 10);

// --- súčty komponentov bez DPH ---
eq('domček materiál (B18)', r.componentTotals.domcek.noVat, 1657.3844571111201);
eq('terasa materiál (B19)', r.componentTotals.terasa.noVat, 79.61986977);
eq('podlaha domček (B20)', r.componentTotals.podlahaDomcek.noVat, 221.949757558272);
eq('podlaha terasa (B21)', r.componentTotals.podlahaTerasa.noVat, 0);
eq('odkvap materiál (B51)', r.componentTotals.odkvapBezTerasy.noVat, 49.254);

// --- zateplenie ---
{
  const rOsb = E.compute({ ...inputs, zateplenie: 'osb' }, config, excelMode);
  const rTat = E.compute({ ...inputs, zateplenie: 'tatran' }, config, excelMode);
  eq('zateplenie OSB (H2)', rOsb.componentTotals.zateplenie.noVat, 400.52450000000005);
  eq('zateplenie TATRAN (H5)', rTat.componentTotals.zateplenie.noVat, 716.3443749999999);
}

// --- varianty: sekcia „bez DPH" riadky 45–49 ---
const v = r.variants;
eq('v1 materiál (B45)', v.v1.materialNoVat, 1657.3844571111201);
eq('v1 výroba (D45)', v.v1.vyroba, 491.49300000000005);
eq('v1 montáž (F45)', v.v1.montaz, 350);
eq('v1 náklady (G45)', v.v1.nakladySpolu, 2698.8774571111203);
eq('v1 predajná bez DPH (I45)', v.v1.predajnaBezDph, 4118.878047946682);
eq('v1 predaj s DPH (J45)', v.v1.predajSDph, 5066.2199989744195);
eq('v1 zisk (K45)', v.v1.zisk, 1420.000590835562);
eq('v1 marža (L45)', v.v1.marza, 0.3447542205197);

eq('v2 materiál (B46)', v.v2.materialNoVat, 1737.00432688112);
eq('v2 výroba (D46)', v.v2.vyroba, 491.49300000000005);
eq('v2 montáž (F46)', v.v2.montaz, 450);
eq('v2 náklady (G46)', v.v2.nakladySpolu, 2878.49732688112);
eq('v2 predajná bez DPH (I46)', v.v2.predajnaBezDph, 4420.639429160282);
eq('v2 predaj s DPH (J46)', v.v2.predajSDph, 5437.386497867146);

eq('v3 materiál (B47)', v.v3.materialNoVat, 1958.954084439392);
eq('v3 výroba (D47)', v.v3.vyroba, 560.693);
eq('v3 náklady (G47)', v.v3.nakladySpolu, 3169.647084439392);
eq('v3 predajná bez DPH (I47)', v.v3.predajnaBezDph, 4983.019021858178);
eq('v3 predaj s DPH (J47)', v.v3.predajSDph, 6129.113396885559);

eq('v4 materiál (B48)', v.v4.materialNoVat, 1958.954084439392);
eq('v4 výroba (D48)', v.v4.vyroba, 560.693);
eq('v4 montáž (F48)', v.v4.montaz, 500);
eq('v4 predajná bez DPH (I48)', v.v4.predajnaBezDph, 5039.019021858178);
eq('v4 predaj s DPH (J48)', v.v4.predajSDph, 6197.993396885559);

eq('v5 materiál (B49)', v.v5.materialNoVat, 1879.3342146693922);
eq('v5 výroba (D49)', v.v5.vyroba, 560.693);
eq('v5 montáž (F49)', v.v5.montaz, 400);
eq('v5 predajná bez DPH (I49)', v.v5.predajnaBezDph, 4681.25764064458);
eq('v5 predaj s DPH (J49)', v.v5.predajSDph, 5757.946897992832);

// --- odkvap (I51/J51) ---
eq('odkvap predajná bez DPH (I51)', r.odkvap.bezTerasy.predajnaBezDph, 165.49344000000002);
eq('odkvap predaj s DPH (J51)', r.odkvap.bezTerasy.predajSDph, 203.55693120000004);

// --- vybrané položky rozpisu domčeka (stĺpec D hárku domček) ---
{
  const find = (bom, label) => bom.filter((l) => l.name === label)[0];
  const b = r.boms.domcek;
  eq('KVH 40/60 (D2)', find(b, 'KVH 40/60').totalNoVat, 134.07863040000004);
  eq('KVH 120/120 (D3)', find(b, 'KVH 120/120').totalNoVat, 103.22603546112003);
  eq('strešná fólia (D4)', find(b, 'Strešná fólia').totalNoVat, 7.983360000000001);
  eq('plech trapéz (D5)', find(b, 'Plech trapéz').totalNoVat, 88.22);
  eq('plech rohy (D6)', find(b, 'Plech rohy').totalNoVat, 27.680000000000003);
  eq('OSB 12 (D7)', find(b, 'OSB doska 12 mm').totalNoVat, 142.49390625);
  eq('fasádna fólia (D8)', find(b, 'Fasádna fólia').totalNoVat, 112.50360000000002);
  eq('nožičky (D9)', find(b, 'Nožičky na domček').totalNoVat, 1.6);
  eq('záveterky (D10)', find(b, 'Plech záveterky').totalNoVat, 43.136);
  eq('okno (D11)', find(b, 'Okno').totalNoVat, 83.33);
  eq('dvere (D12)', find(b, 'Dvere').totalNoVat, 270);
  eq('latečky (D13)', find(b, 'Latečky 18/95').totalNoVat, 590.2578);
  eq('klince (D14)', find(b, 'Klince 50 mm').totalNoVat, 4.4275);
  eq('šróby 5×90 (D15)', find(b, 'Šróby 5×90').totalNoVat, 5.472);
  eq('farba (D16)', find(b, 'Farba').totalNoVat, 42.975625);
  eq('latečky ks (B13)', find(b, 'Latečky 18/95').qty, 220);
  eq('klince ks (B14)', find(b, 'Klince 50 mm').qty, 3300);
}

// --- KALKMAKE parita: Spolu (O2) = variant s DPH… v Exceli stará sekcia;
//     tu kontrolujeme novú logiku: v2 s DPH + odkvap s DPH (s terasou = bez
//     terasy pri altánku 0) ---
eq('KALKMAKE odkvap (M2 ekvivalent)', r.odkvap.sTerasou.predajSDph, 203.55693120000004);

// =============================================================================
// Sanity testy správania appky (bez Excel režimu — opravená podmienka príplatku)
// =============================================================================
{
  const rApp = E.compute(inputs, config); // clamp zapnutý, príplatok podľa rozmerov
  // hĺbka 2,5 < 4 → príplatok sa NEpripočíta
  eq('app: v1 bez veľkostného príplatku', rApp.variants.v1.priplatokVelkost, 0);
  eq('app: v1 predajná bez DPH (bez príplatku)',
    rApp.variants.v1.predajnaBezDph, 4118.878047946682 - 150 * 1.12);
  // clamp: záporná položka terasy pri altánku 0 → 0
  const kvh45 = rApp.boms.terasa.filter((l) => l.name.indexOf('KVH 45/120') === 0)[0];
  eq('app: KVH 45/120 clamp na 0', kvh45.totalNoVat, 0);

  // 4×4 domček → príplatok sa pripočíta
  const rBig = E.compute({ ...inputs, hlbka: 4 }, config);
  eq('app: 4×4 príplatok v1', rBig.variants.v1.priplatokVelkost, 150);

  // montáž: plocha 16 m² > 10 aj > 5 → 300+100+50
  eq('app: 4×4 montáž v1', rBig.variants.v1.montaz, 450);

  // DPH mení predaj s DPH
  const cfg20 = E.defaultConfig();
  cfg20.settings.dph = 0.20;
  const r20 = E.compute(inputs, cfg20);
  eq('app: DPH 20 % pomer', r20.variants.v1.predajSDph / r20.variants.v1.predajnaBezDph, 1.2);

  // neplatca DPH → nákupná cena s DPH = bez DPH
  const cfgN = E.defaultConfig();
  cfgN.materials.filter((m) => m.key === 'dvere')[0].vatPayer = false;
  const rN = E.compute(inputs, cfgN);
  const dvere = rN.boms.domcek.filter((l) => l.key === 'dvere')[0];
  eq('app: neplatca DPH dvere', dvere.totalWithVat, dvere.totalNoVat);

  // zmena ceny vstupu sa prejaví: dvere +100 € bez DPH → materiál v1 +100
  const cfgP = E.defaultConfig();
  cfgP.materials.filter((m) => m.key === 'dvere')[0].price = 370;
  const rP = E.compute(inputs, cfgP);
  eq('app: dvere +100 € → materiál v1 +100',
    rP.variants.v1.materialNoVat - rApp.variants.v1.materialNoVat, 100);

  // terasa s altánkom 2 m: odkvap s terasou dlhší než bez nej
  const rT = E.compute({ ...inputs, sirkaAltanku: 2 }, config);
  const zlabS = rT.boms.odkvapSTerasou.filter((l) => l.key === 'zlab')[0];
  const zlabB = rT.boms.odkvapBezTerasy.filter((l) => l.key === 'zlab')[0];
  eq('app: žľab s terasou 6 m', zlabS.qty, 6);
  eq('app: žľab bez terasy 4 m', zlabB.qty, 4);

  // výber variantu podľa volieb (KALKMAKE logika)
  eq('pickVariant TT', E.pickVariant(true, true, true) === 'v4' ? 1 : 0, 1);
  eq('pickVariant T-', E.pickVariant(true, false, false) === 'v2' ? 1 : 0, 1);
  eq('pickVariant -P', E.pickVariant(false, true, false) === 'v5' ? 1 : 0, 1);
  eq('pickVariant --', E.pickVariant(false, false, false) === 'v1' ? 1 : 0, 1);
}

console.log(failures === 0 ? '\nVŠETKY TESTY PREŠLI' : `\n${failures} TESTOV ZLYHALO`);
process.exit(failures === 0 ? 0 : 1);
