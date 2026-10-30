// Genera los iconos PNG de la app a partir de la ilustración SVG original.
// Uso: node scripts/make-icons.mjs  (requiere Playwright con Chromium)
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { appIcon } from '../js/art.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const svg = appIcon();
await writeFile(new URL('../icons/icon.svg', import.meta.url), svg);
const browser = await pw.chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-512-maskable.png', 512]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: new URL(`../icons/${name}`, import.meta.url).pathname });
}
await browser.close();
console.log('Iconos generados');
