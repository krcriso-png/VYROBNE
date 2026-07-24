# Kalkulačka záhradných domčekov

Sada troch prepojených nástrojov nad jednou cenovou logikou
(`engine.js`, podľa `KALKULACKA_FINAL.xlsx`):

| Nástroj | Súbor | Pre koho |
| --- | --- | --- |
| **Kalkulačka** | `index.html` (`dist/kalkulacka.html`) | interná — ceny, marže, cenník, ponuky |
| **3D konfigurátor (widget)** | `widget.html` (`dist/widget.html`) | zákaznícka — na web stránku |
| **Návrhár EXPERTWOOD** | `navrhar.html` (`dist/navrhar.html`) | interná — technické výkresy + živá cena |

Smerodajná je logika spodnej sekcie **„bez DPH“** hárku `kalkulacka`
(riadky 44–51):

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

## 3D konfigurátor pre web (widget)

`widget.html` — zákaznícky konfigurátor s 3D modelom (vlastný canvas renderer,
žiadne externé knižnice): ťahaním sa otáča, kolieskom približuje. Zákazník si
nastaví rozmery, terasu, podlahu, odkvap, zateplenie a farby a hneď vidí
predajnú cenu s DPH (interné údaje — nákupné ceny, zisk, marža — sa
nezobrazujú, sú však v zdrojáku enginu).

- **Vloženie na stránku:**
  `<iframe src="widget.html?email=objednavky@firma.sk" style="width:100%;height:720px;border:0"></iframe>`
  (parameter `email` určuje, kam smeruje tlačidlo „Mám záujem“).
- Ak beží na rovnakej doméne ako kalkulačka, číta jej uložený cenník
  (localStorage) — zmena cien v kalkulačke sa hneď prejaví vo widgete.
- „Stiahnuť konfiguráciu pre návrhára (JSON)“ vytvorí súbor, ktorý sa dá
  v návrhári otvoriť cez **📂 Načítať** (rozmery, terasa, osadenie, odkvap,
  farby).

## Návrhár EXPERTWOOD + živá cena

`navrhar.html` je pôvodný návrhár (technické pohľady, výrobný kalkulátor,
rezivo) doplnený o **cenový panel vpravo dole** — pri každej zmene prepočíta
predajnú cenu logikou kalkulačky (mapovanie: šírka/hĺbka podľa smeru sklonu,
výška = svetlá výška − 15 cm, plochy okien a dverí z reálneho stavu, terasa
z „Šírka terasy“, podlaha = osadenie „Podlaha na pätkách“, odkvap =
odvodnenie). Zdroj bloku: `navrhar-bridge.html`; do `navrhar.html` ho vkladá
build. Panel tiež číta cenník kalkulačky z localStorage.

## Testy

```
node kalkulacka/test.js
```

Overuje presnú zhodu s hodnotami vypočítanými Excelom (na centy aj floating
point) pri vstupoch 4 × 2,5 × 2,1 m a sadu kontrol správania aplikácie.
