// tools/patch-reporte.js
// Uso: node tools/patch-reporte.js ruta/a/reporte.html
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.log('Uso: node tools/patch-reporte.js ruta/a/reporte.html');
  process.exit(1);
}

let html = fs.readFileSync(file, 'utf8');
const tagPlan = `<script src="./fixes/planfix.js"></script>`;
const tagGasto = `<script src="./fixes/gastosfix.js"></script>`;

if (!html.includes('fixes/planfix.js')) {
  html = html.replace('</body>', `  ${tagPlan}\n</body>`);
}
if (!html.includes('fixes/gastosfix.js')) {
  html = html.replace('</body>', `  ${tagGasto}\n</body>`);
}
fs.writeFileSync(file, html);
console.log('Listo. Verificá que las etiquetas aparezcan cerca del cierre </body>');
