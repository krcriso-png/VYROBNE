/*
 * Zloží jednosúborové verzie do dist/ (dajú sa poslať e-mailom alebo nahrať
 * na ľubovoľný statický hosting):
 *   dist/kalkulacka.html — interná kalkulačka (index.html + engine + app)
 *   dist/widget.html     — zákaznícky 3D konfigurátor (widget.html + engine)
 *   dist/navrhar.html    — návrhár EXPERTWOOD s cenovým panelom (navrhar.html + engine)
 *
 * Spustenie: node kalkulacka/build.js
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });

function inlineEngine(html) {
  return html.replace('<script src="engine.js"></script>', '<script>\n' + engine + '\n</script>');
}
function buildOne(srcName, outName, extra) {
  let html = fs.readFileSync(path.join(dir, srcName), 'utf8');
  const before = html;
  html = inlineEngine(html);
  if (extra) html = extra(html);
  if (html === before) {
    console.error('CHYBA: script tagy sa nenašli v ' + srcName);
    process.exit(1);
  }
  fs.writeFileSync(path.join(dir, 'dist', outName), html);
  console.log('OK → kalkulacka/dist/' + outName + ' (' + Math.round(html.length / 1024) + ' kB)');
}

buildOne('index.html', 'kalkulacka.html', (html) => {
  const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  return html.replace('<script src="app.js"></script>', '<script>\n' + app + '\n</script>');
});
buildOne('widget.html', 'widget.html');
buildOne('navrhar.html', 'navrhar.html');
