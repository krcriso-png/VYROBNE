# Kalkulačka záhradných domčekov

Webová aplikácia postavená podľa `KALKULACKA_FINAL.xlsx`. Smerodajná je logika
spodnej sekcie **„bez DPH“** hárku `kalkulacka` (riadky 44–51):

```
predajná cena BEZ DPH = (materiál × 1,5 + výroba + doprava + montáž + príplatok) × 1,12
predaj s DPH          = predajná cena BEZ DPH × (1 + DPH)      # DPH = 23 %
```

Množstvá materiálu sa počítajú vzorcami z hárkov `domček`, `terasa`,
`podlaha v domceku`, `podlaha terasa`, `zateplenie domčeka`, `žľab + zvod`;
vstupné ceny podľa hárku `matros` (všetky sú v aplikácii editovateľné).

## Spustenie

Žiadna inštalácia — stačí otvoriť `index.html` v prehliadači (dvojklik).
Súbory `engine.js` a `app.js` musia byť v tom istom priečinku.

Alternatívne jednosúborová verzia: `dist/kalkulacka.html` (vznikne cez
`node build.js`) — jeden súbor, ktorý sa dá poslať e-mailom alebo nahrať
na akýkoľvek hosting.

## Čo appka vie

- **Kalkulácia** — rozmery a výbava zákazky, porovnanie 5 variantov
  (domček / + terasa / + podlahy), rozpis materiálu s množstvami a cenami,
  zisk a marža pri každom variante.
- **Cenník materiálov** — editovateľné vstupné ceny bez DPH (hárok `matros`),
  prepínač „platca DPH“ pre dodávateľa, ceny za balenie pri klincoch a šróboch.
- **Nastavenia** — DPH, sadzba práce €/m², doprava, montážne základy podľa
  variantu, príplatky, koeficienty marže, údaje firmy; export/import JSON zálohy.
- **Cenová ponuka** — údaje zákazníka + tlač do PDF (Ctrl+P / tlačidlo).

Všetko sa automaticky ukladá v prehliadači (localStorage).

## Zámerné odchýlky oproti Excelu

1. **Veľkostný príplatok** (150–300 €): v Exceli má sekcia „bez DPH“ chybný
   odkaz (`B17`/`B18` namiesto `B2`/`B3`), takže príplatok sa pripočítaval
   **vždy**. Appka používa zamýšľanú podmienku *šírka ≥ 4 m a hĺbka ≥ 4 m*
   (limity aj sumy sú v Nastaveniach).
2. **Záporné množstvá**: pri šírke terasy < 0,5 m vychádzal v Exceli materiál
   terasy záporne; appka orezáva množstvá na 0.
3. **Ceny s DPH pri položkách** sú jednotne `bez DPH × 1,23` (podľa flagu
   platca DPH); nekonzistentné vzorce v stĺpci E Excelu sa nereplikujú —
   smerodajná je vetva bez DPH.
4. Ocenenie „KVH 120/120“ v domčeku sadzbou fošne 45/120 a „dosky 2,5/100“
   sadzbou latečiek je **replikované presne podľa Excelu** (v rozpise označené
   poznámkou).
5. **Zateplenie**: podľa poznámky v Exceli („rátať ×2 do ceny domčeka“) sa 2×
   materiál zateplenia pripočíta k materiálu domčeka pred prirážkami;
   koeficient je v Nastaveniach.

## Testy

```
node kalkulacka/test.js
```

Overuje presnú zhodu s hodnotami vypočítanými Excelom (na centy aj floating
point) pri vstupoch 4 × 2,5 × 2,1 m a sadu kontrol správania aplikácie.
