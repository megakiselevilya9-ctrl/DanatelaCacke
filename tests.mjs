// CI/browser checks. Run build.py first, then npm test after installing Playwright Chromium.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const prefix = '/cake-demo/'; // Simulate GitHub project Pages, not just an origin root.
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const relative = pathname.slice(prefix.length) || 'index.html';
    const target = path.resolve(dist, relative);
    if (!target.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  const waitForStartup=async()=>{
    await page.waitForFunction(()=>Boolean(window.DanatelaStartupError)||window.DanatelaChecks?.passed>=22);
    assert.equal(await page.evaluate(()=>window.DanatelaStartupError||null),null,'Built-in startup checks must pass');
  };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await waitForStartup();
  await page.evaluate(() => new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Service worker was not ready within 20 seconds')),20000);
    navigator.serviceWorker.ready.then(reg=>{clearTimeout(timer);resolve(Boolean(reg.active));},error=>{clearTimeout(timer);reject(error);});
  }));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const total = async () => Number((await page.locator('#totalPrice').innerText()).replace(/\D/g, ''));
  const openAdmin = () => page.locator('#openAdmin').click();
  const closeAdmin = () => page.locator('#adminDialog [data-close="adminDialog"]').click();
  const acceptNextConfirm = () => page.once('dialog', dialog => dialog.accept());
  assert.equal(await total(), 4700);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
  assert.equal(await page.locator('#nextStep').isDisabled(), true, 'No next step without an explicit selection');
  assert.equal(await page.locator('#mobileNext').isDisabled(), true);
  assert.equal(await page.locator('[data-step="1"]').isDisabled(), true);
  assert.equal(await page.locator('[data-step="2"]').isDisabled(), true);
  assert.equal(await page.locator('[data-step="3"]').isDisabled(), true);
  assert.equal(await page.locator('#checkout').isDisabled(), true);
  assert.equal(await page.evaluate(() => goStep(3, false)), false, 'Programmatic navigation has the same guard');
  await page.evaluate(() => openCheckout());
  assert.equal(await page.evaluate(() => document.getElementById('checkoutDialog').open), false);
  assert.equal(await page.evaluate(() => state.step), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
  await page.evaluate(() => window.scrollTo(0, 600));
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'Root page never scrolls');
  const viewportConfig = await page.locator('meta[name="viewport"]').getAttribute('content');
  assert.ok(viewportConfig.includes('maximum-scale=1') && viewportConfig.includes('user-scalable=no'));
  await page.locator('#openPreview').click();
  assert.equal(await page.locator('#checkout').isDisabled(), true, 'Summary cannot bypass the wizard');
  await page.locator('#previewDialog [data-close]').click();
  await mkdir(path.join(root, 'screenshots'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'screenshots', 'mobile.png'), fullPage: true });

  const manifestResponse = await page.request.get(base + 'manifest.webmanifest');
  assert.equal(manifestResponse.status(), 200);
  const manifest = await manifestResponse.json();
  assert.equal(new URL(manifest.start_url, base + 'manifest.webmanifest').href, base);
  assert.equal(manifest.display, 'standalone');
  for (const icon of [...manifest.icons, { src: './apple-touch-icon.png', sizes: '180x180' }]) {
    const response = await page.request.get(new URL(icon.src, base).href);
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
    assert.equal(bytes.readUInt32BE(20), Number(icon.sizes.split('x')[1]));
  }

  // Pick the shape first; future steps remain locked until their own selection.
  await page.locator('[data-shape="round"]').click();
  assert.equal(await page.locator('#mobileNext').isDisabled(), false);
  assert.equal(await page.locator('[data-step="2"]').isDisabled(), true);
  await page.locator('#mobileNext').click();
  assert.equal(await page.evaluate(() => state.step), 1);
  assert.equal(await page.locator('#mobileNext').isDisabled(), true, 'Default filling is not an explicit choice');

  // Add a custom filling with literal markup in its name; it must stay text.
  const originalName = 'Лимон — меренга <b>тест</b>';
  await openAdmin();
  await page.locator('#fillingsTab').click();
  await page.locator('#newFilling').click();
  const form = page.locator('#fillingForm');
  await form.locator('[name="name"]').fill(originalName);
  await form.locator('[name="description"]').fill('Лимонный бисквит, крем и меренга.');
  await form.locator('[name="allergens"]').fill('Пшеница, яйца, молоко.');
  await form.locator('[name="price"]').fill('400');
  await form.locator('[type="submit"]').click();
  assert.equal(await page.locator('[data-edit-filling^="custom_"]').count(), 1);
  assert.equal(await page.locator('#adminContent h3 b').count(), 0);
  const customId = await page.locator('[data-edit-filling^="custom_"]').getAttribute('data-edit-filling');
  await closeAdmin();
  await page.locator('[data-step="1"]').click();
  await page.locator(`[data-filling="${customId}"]`).click();
  assert.equal(await total(), 5000);

  // Verify internal scrolling does not move the root page or advance a step.
  await page.locator('#builderPanel').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  assert.equal(await page.evaluate(() => state.step), 1);
  assert.equal(await page.locator('[data-step="2"]').isDisabled(), false);
  await page.locator('#mobileNext').click();
  assert.equal(await page.locator('#mobileNext').isDisabled(), true, 'Default design is not an explicit choice');
  assert.equal(await page.locator('[data-step="3"]').isDisabled(), true);
  await page.locator('[data-design="vintage"]').click();
  assert.equal(await page.locator('#checkout').isDisabled(), true, 'Details must be visited before checkout');
  await page.locator('#mobileNext').click();
  assert.equal(await page.evaluate(() => state.step), 3);

  // Create a quote snapshot, then edit/remove its filling and reopen the old message.
  await page.locator('#mobileNext').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.locator('#orderForm').evaluate(form => {
      const date=form.elements.date.getBoundingClientRect(), vk=form.elements.vk.getBoundingClientRect();
      const modal=document.getElementById('checkoutDialog').getBoundingClientRect();
      return date.width>0 && date.bottom<=vk.top && date.left>=modal.left && vk.right<=modal.right && date.right<=modal.right;
    }), 'Date and VK must be stacked and contained on narrow screens');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await page.locator('#checkoutDialog').evaluate(el => el.scrollHeight>el.clientHeight), 'Long form has its own scroll area');
    await page.locator('#checkoutDialog').evaluate(el => {el.scrollTop=el.scrollHeight;});
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'Scrolling a dialog does not move the page');
    await page.locator('#checkoutDialog').evaluate(el => {el.scrollTop=0;});
    await page.screenshot({path:path.join(root,'screenshots',`checkout-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:390,height:430});
  await page.waitForFunction(() => Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--app-height'))-window.innerHeight)<2);
  await page.locator('#orderForm [type="submit"]').scrollIntoViewIfNeeded();
  const compactButton=await page.locator('#orderForm [type="submit"]').boundingBox();
  assert.ok(compactButton && compactButton.y>=0 && compactButton.y+compactButton.height<=430, 'Submit stays reachable when available height shrinks');
  assert.equal(await page.evaluate(() => window.scrollY),0);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#orderForm [name="name"]').fill('Тестовый клиент');
  await page.locator('#orderForm [name="phone"]').fill('+7 999 123-45-67');
  const tomorrow = await page.evaluate(() => minOrderDate());
  await page.locator('#orderForm [name="date"]').fill(tomorrow);
  await page.locator('#orderForm [name="ack"]').check();
  await page.locator('#orderForm [type="submit"]').click();
  await page.waitForFunction(() => document.getElementById('vkDialog').open);
  assert.ok((await page.locator('#vkMessage').innerText()).includes(originalName));
  assert.equal(await page.locator('#vkMessage b').count(), 0);
  await page.locator('#vkDialog [data-close]').click();
  await openAdmin();
  await page.locator('#fillingsTab').click();
  await page.locator(`[data-edit-filling="${customId}"]`).click();
  await page.locator('#fillingForm [name="name"]').fill('Лимонная новая');
  await page.locator('#fillingForm [name="price"]').fill('450');
  await page.locator('#fillingForm [type="submit"]').click();
  assert.equal(await total(), 5100);
  acceptNextConfirm();
  await page.locator(`[data-delete-filling="${customId}"]`).click();
  assert.equal(await total(), 4700);
  assert.equal(await page.evaluate(() => stepChoices.filling), false, 'Deleted selection requires a new explicit choice');
  assert.equal(await page.locator('[data-step="3"]').isDisabled(), true);
  assert.equal(await page.locator(`[data-edit-filling="${customId}"]`).count(), 0);
  await page.locator('#ordersTab').click();
  assert.ok((await page.locator('#adminContent').innerText()).includes(originalName));
  await page.locator('[data-order-message]').click();
  const oldMessage = await page.locator('#vkMessage').innerText();
  assert.ok(oldMessage.includes(originalName));
  assert.ok(oldMessage.replace(/\s/g, '').includes('5000₽'));
  await page.locator('#vkDialog [data-close]').click();

  await page.locator('#fillingsTab').click();
  while (await page.locator('[data-delete-filling]').count() > 1) {
    acceptNextConfirm();
    await page.locator('[data-delete-filling]').first().click();
  }
  assert.equal(await page.locator('[data-delete-filling]').isDisabled(), true, 'Last filling is protected');
  await page.locator('#pricesTab').click();
  acceptNextConfirm();
  await page.locator('#resetPrices').click();
  assert.equal(await page.evaluate(() => FILLINGS.length), 4);

  // JSON rejects prototype-like IDs; the previous valid state must survive failure.
  const bad = { version: 2, fillings: [{ id: '__proto__', name: 'Bad', description: 'Bad', allergens: 'Bad', biscuit: '#ffffff', cream: '#ffffff' }], prices: { fillings: { ['__proto__']: 0 } } };
  await page.locator('#pricesFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await page.waitForFunction(() => document.getElementById('pricesError').textContent.length > 0);
  assert.equal(await page.evaluate(() => FILLINGS.length), 4);
  await closeAdmin();

  // Check offline reload; only static files survive, never the custom catalogue/orders.
  await context.setOffline(true);
  acceptNextConfirm();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForStartup();
  assert.equal(await total(), 4700);
  assert.equal(await page.evaluate(() => FILLINGS.length), 4);
  assert.equal(await page.evaluate(() => orders.length), 0);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.ok(await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('danatela:'));
    if (!names.length) return false;
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) if (!/\/(index\.html|pwa\.js|manifest\.webmanifest|icon\.svg|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png)$/.test(new URL(req.url).pathname)) return false;
    }
    return true;
  }), 'Cache only contains public assets');
  await context.setOffline(false);
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.screenshot({ path: path.join(root, 'screenshots', 'desktop.png'), fullPage: true });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS: startup, 22 self-checks, guarded wizard, fixed shell, mobile form, catalogue CRUD, pricing snapshots, validation, manifest/icons, subpath, offline reload and screenshots.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
