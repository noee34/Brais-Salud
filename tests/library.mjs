// Biblioteca con respuestas de CIMA simuladas (sin Internet).
// Uso:  npm start &   y después   node tests/library.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const BASE = process.env.APP_URL || 'http://localhost:5173/';
const results = { total: 2, resultados: [
  { nregistro: '68339', nombre: 'PARACETAMOL KERN PHARMA 1 g COMPRIMIDOS EFG', lab: 'Kern Pharma S.L.', receta: true, cpresc: 'Medicamento Sujeto A Prescripción Médica', comerc: true, generico: true, conduc: false, dosis: '1 g', forma: 'COMPRIMIDO', via: 'VÍA ORAL', pactivos: 'paracetamol', prospecto: { url: 'https://cima.aemps.es/cima/pdfs/p/68339/P_68339.pdf' }, foto: '' },
  { nregistro: '72522', nombre: 'PARACETAMOL KERN PHARMA 1 g COMPRIMIDOS EFERVESCENTES EFG', lab: 'Kern Pharma S.L.', receta: true, cpresc: '', comerc: false, generico: true, conduc: false, dosis: '1 g', forma: 'COMPRIMIDO EFERVESCENTE', via: 'VÍA ORAL', pactivos: 'paracetamol', prospecto: null, foto: '' },
] };
const leaflet = [
  { seccion: '0', titulo: 'Introducción', contenido: '<p>Prospecto</p>' },
  { seccion: '1', titulo: '1. Qué es Paracetamol Kern Pharma y para qué se utiliza', contenido: '<div><p style="color:red" onclick="alert(1)">Alivio del <b>dolor</b> leve o moderado y la fiebre.</p><script>window.__xss=1</script><img src=x onerror="window.__xss=2"><ul><li>Dolor de cabeza</li></ul></div>' },
  { seccion: '5', titulo: '5. Conservación', contenido: '<p>No requiere condiciones especiales.</p>' },
];
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ ...pw.devices['iPhone 14'], locale: 'es-ES' });
await ctx.addInitScript(() => { globalThis.__MEDICINA_CIMA_BASE__ = 'https://cima.prueba'; });
await ctx.route('https://cima.prueba/**', (route) => {
  const u = new URL(route.request().url());
  const r = u.searchParams.get('ruta');
  const body = r === 'medicamentos' ? (u.searchParams.get('nombre') === 'zzz' ? { total: 0, resultados: [] } : results) : leaflet;
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE + '#biblioteca');
await page.waitForSelector('[data-lib-form]');
await page.fill('input[name="lib-q"]', 'paracetamol');
await page.click('[data-lib-form] button[type="submit"]');
await page.waitForSelector('[data-lib="68339"]');
assert.equal(await page.locator('[data-lib]').count(), 2);
await page.screenshot({ path: 'docs/screenshots/16-biblioteca.png' });
await page.click('[data-lib="68339"]');
await page.waitForSelector('.leaflet-sec');
assert.equal(await page.locator('.leaflet-sec').count(), 2);
assert.equal(await page.evaluate(() => globalThis.__xss), undefined, 'el HTML del prospecto debe estar limpio');
assert.equal(await page.locator('.leaflet-body [onclick], .leaflet-body img, .leaflet-body script').count(), 0);
await page.screenshot({ path: 'docs/screenshots/17-prospecto-oficial.png' });
await page.click('[data-lib-add]');
await page.waitForTimeout(500);
assert.equal(await page.inputValue('.sheet input[name="name"]'), 'Paracetamol Kern Pharma 1 g comprimidos EFG');
assert.equal(await page.inputValue('.sheet input[name="strength"]'), '1 g');
assert.match(await page.inputValue('.sheet textarea[name="lf-uso"]'), /Alivio del dolor leve/);
assert.equal(await page.isChecked('.sheet input[name="needsRx"]'), true);
await page.fill('.sheet input[name="stockInitial"]', '20');
await page.click('.sheet button[type="submit"]');
await page.waitForTimeout(500);
const meds = await page.evaluate(() => globalThis.__medicina.store.data.meds.map((m) => m.name));
assert.deepEqual(meds, ['Paracetamol Kern Pharma 1 g comprimidos EFG']);
// Sin resultados
await page.goto(BASE + '#biblioteca');
await page.fill('input[name="lib-q"]', 'zzz');
await page.click('[data-lib-form] button[type="submit"]');
await page.waitForSelector('text=Sin resultados');
assert.deepEqual(errors, []);
console.log('Biblioteca OK');
await browser.close();
