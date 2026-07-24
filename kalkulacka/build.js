/*
 * Zloží jednosúborovú verziu aplikácie: dist/kalkulacka.html
 * (engine.js + app.js vložené priamo do HTML — dá sa poslať e-mailom
 *  alebo nahrať na ľubovoľný statický hosting).
 *
 * Spustenie: node kalkulacka/build.js
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

const out = html
  .replace('<script src="engine.js"></script>', '<script>\n' + engine + '\n</script>')
  .replace('<script src="app.js"></script>', '<script>\n' + app + '\n</script>');

if (out === html) {
  console.error('CHYBA: script tagy sa nenašli v index.html');
  process.exit(1);
}

fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'kalkulacka.html'), out);
console.log('OK → kalkulacka/dist/kalkulacka.html (' + Math.round(out.length / 1024) + ' kB)');
