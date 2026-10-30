// Comprueba que MEDICINA abre sin conexión (service worker) y conserva los datos.
// Uso:  npm start &   y después   node tests/offline.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const BASE = process.env.APP_URL || 'http://localhost:5173/';
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ ...pw.devices['iPhone 14'], locale: 'es-ES' });
const page = await ctx.newPage();
await page.goto(BASE);
await page.waitForSelector('#view .h-display');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.evaluate(async () => {
  const { store } = await import('./js/store.js');
  await store.save('meds', { name: 'Prueba', form: 'comprimido', dose: 1, unit: 'comprimidos', frequency: 'd1', times: ['09:00'], scheduleMode: 'fijo', startDate: '2026-01-01', endDate: '', status: 'activo', statusAt: Date.now(), archived: false, stockEnabled: true, stockInitial: 10, stockSince: Date.now(), minReserve: 2, thresholds: [], alertDays: 0, needsRx: false, rxStatus: 'sin_receta', rxStatusAt: Date.now() });
});
await page.reload();
await page.waitForTimeout(800);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#view .h-display', { timeout: 10000 });
const n = await page.evaluate(() => globalThis.__medicina.store.data.meds.length);
assert.equal(n, 1);
// El PDF también se genera sin conexión (librería en caché)
const ok = await page.evaluate(async () => { const { loadPdfLib } = await import('./js/pdf.js'); return typeof (await loadPdfLib()) === 'function'; });
assert.ok(ok);
console.log('Sin conexión OK');
await browser.close();
