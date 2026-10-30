// Recorrido completo en un iPhone emulado (modo local, sin nube).
// Uso:  npm start &   y después   node tests/e2e.mjs
// Guarda capturas en docs/screenshots.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const BASE = process.env.APP_URL || 'http://localhost:5173/';
const SHOTS = new URL('../docs/screenshots/', import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ ...pw.devices['iPhone 14'], locale: 'es-ES', timezoneId: 'Europe/Madrid' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const sheet = () => page.locator('.sheet').last();

await page.goto(BASE);
await page.waitForSelector('#view .h-display');
await shot('01-inicio-vacio');
// Los avisos de toma (diálogo) se prueban aparte: aquí molestarían según la hora real.
await page.evaluate(() => globalThis.__medicina.store.updateSettings({ notifyDoses: false }));

// 1. Añadir Paracetamol: cada 8 h, 30 comprimidos, receta.
await page.click('[data-action="add-med"] >> nth=0');
await sheet().locator('input[name="name"]').fill('Paracetamol');
await sheet().locator('input[name="strength"]').fill('1 g');
await sheet().locator('input[name="firstTime"]').fill('08:00');
await sheet().locator('input[name="stockInitial"]').fill('30');
await sheet().locator('input[name="needsRx"]').check();
await shot('02-nuevo-medicamento');
await sheet().locator('button[type="submit"]').click();
await wait(500);

// 2. Ibuprofeno: tres veces al día, 12 comprimidos (ejemplo: 4 días).
await page.goto(BASE + '#medicamentos');
await page.click('.dock [data-action="add-med"]');
await sheet().locator('input[name="name"]').fill('Ibuprofeno');
await sheet().locator('input[name="strength"]').fill('400 mg');
await sheet().locator('select[name="frequency"]').selectOption('d3');
await sheet().locator('input[name="stockInitial"]').fill('12');
await sheet().locator('button[type="submit"]').click();
await wait(500);

const st = () => page.evaluate(() => globalThis.__medicina.store.data);
let data = await st();
assert.equal(data.meds.length, 2);

// 3. Registrar toma desde Inicio (botón REGISTRAR TOMA de Próxima toma)
await page.goto(BASE + '#inicio');
await wait(300);
await shot('03-inicio');
const before = (await st()).intakes.length;
await page.click('.next [data-register]');
await page.waitForSelector('.toast:has-text("Toma registrada correctamente")');
data = await st();
assert.equal(data.intakes.length, before + 1);

// 4. Existencias: Paracetamol 30 → 29 tras una toma (si fue esa) — comprobamos por medicamento
const stock = await page.evaluate(async () => {
  const { infoFor } = await import('./js/model.js');
  return Object.fromEntries(globalThis.__medicina.store.data.meds.map((m) => [m.name, infoFor(m)]));
});
assert.equal(stock.Paracetamol.stock + stock.Ibuprofeno.stock, 41);
assert.equal(stock.Ibuprofeno.daysLeft === 4 || stock.Ibuprofeno.daysLeft === 3, true);

// 5. Doble toque: pide confirmación y no duplica
await page.goto(BASE + '#medicamentos');
await wait(300);
await page.locator('.med-card').filter({ hasText: 'Paracetamol' }).locator('[data-register]').click();
await wait(400);
if (!(await page.locator('.dialog').count())) await page.locator('.med-card').filter({ hasText: 'Paracetamol' }).locator('[data-register]').click();
await page.waitForSelector('.dialog');
await shot('04-confirmar-repetida');
await page.click('.dialog [data-no].btn');
await wait(200);
await shot('05-medicamentos');

// 6. Ficha con existencias + solicitar receta + reposición
await page.locator('.med-card').filter({ hasText: 'Paracetamol' }).locator('.med-name').click();
await wait(400);
await shot('06-ficha');
await sheet().locator('[data-rx-to="solicitada"]').click();
await wait(300);
assert.equal((await st()).meds.find((m) => m.name === 'Paracetamol').rxStatus, 'solicitada');
await sheet().locator('[data-restock]').click();
await wait(400);
await sheet().locator('input[name="quantity"]').fill('20');
await sheet().locator('button[type="submit"]').click();
await wait(400);
data = await st();
assert.equal(data.restocks.length, 1);
assert.equal(data.meds.find((m) => m.name === 'Paracetamol').rxStatus, 'repuesto');
await sheet().locator('.sheet-head [data-close]').click();
await wait(400);
assert.equal(await page.locator('.sheet').count(), 0);

// 7. Corregir y eliminar una toma (existencias se recalculan)
await page.goto(BASE + '#historial');
await wait(300);
await shot('07-historial');
const s1 = await page.evaluate(async () => { const { infoFor } = await import('./js/model.js'); const m = globalThis.__medicina.store.data.meds.find((x) => x.name === 'Paracetamol'); return infoFor(m).stock; });
await page.locator('[data-intake]').first().click();
await wait(300);
await sheet().locator('[data-status="omitida"]').click();
await sheet().locator('button[type="submit"]').click();
await wait(400);
const s2 = await page.evaluate(async () => { const { infoFor } = await import('./js/model.js'); const m = globalThis.__medicina.store.data.meds.find((x) => x.name === 'Paracetamol'); return infoFor(m).stock; });
assert.ok(s2 >= s1, 'pasar a omitida no puede bajar existencias');

// 8. Pocas existencias → aviso único
await page.evaluate(async () => {
  const { store } = await import('./js/store.js');
  const m = store.data.meds.find((x) => x.name === 'Ibuprofeno');
  await store.save('meds', { id: m.id, stockInitial: 5, stockSince: Date.now() });
  const { checkStockAlerts } = await import('./js/model.js');
  await checkStockAlerts(); await checkStockAlerts();
});
data = await st();
assert.equal(data.alerts.filter((a) => !a.silent).length, 1);
await page.goto(BASE + '#inicio');
await wait(300);
await shot('08-inicio-avisos');
await page.goto(BASE + '#reposiciones');
await wait(300);
await shot('09-reposiciones');

// 9. Calendario
await page.goto(BASE + '#calendario');
await wait(300);
await shot('10-calendario');

// 10. PDF
await page.goto(BASE + '#historial');
await wait(300);
await page.click('[data-action="pdf"]');
await wait(300);
await shot('11-pdf');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  sheet().locator('button[type="submit"]').click(),
]);
await download.saveAs(`${SHOTS}../informe-ejemplo.pdf`);

// 11. Perfil y modo oscuro
await page.goto(BASE + '#perfil');
await wait(300);
await shot('12-perfil');
await page.click('[data-theme-set="dark"]');
await page.goto(BASE + '#inicio');
await wait(300);
await shot('13-inicio-oscuro');
await page.click('[data-theme-set="light"]').catch(() => {});

// 12. Persistencia: recargar y seguir teniendo los datos
const countBefore = (await st()).intakes.length;
await page.reload();
await page.waitForSelector('#view .h-display');
assert.equal((await st()).intakes.length, countBefore);

assert.deepEqual(errors, [], 'errores en consola');
console.log('E2E OK ·', countBefore, 'tomas ·', (await st()).meds.length, 'medicamentos');
await browser.close();
