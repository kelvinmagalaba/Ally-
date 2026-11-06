const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const results = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('.cinema-hero-actions a[href="#journey"]').click();
    await page.waitForTimeout(900);
    const journey = await page.evaluate(() => ({ hash: location.hash, top: document.querySelector('#journey').getBoundingClientRect().top, visiblePanels: Array.from(document.querySelectorAll('.cinema-story-panel')).map((el) => getComputedStyle(el).opacity) }));
    await page.screenshot({ path: `../.tmp-cinema-anchor-${viewport.width}.png` });
    results.push({ width: viewport.width, journey });
    await page.close();
  }
  for (const { button, selector, expected } of [{ button: 'Order cooking gas', selector: '.cinema-hero-actions button', expected: 'Customer Registration' }, { button: 'Join as a rider', selector: '.cinema-partner-rider button', expected: 'Driver Registration' }, { button: 'Become a seller', selector: '.cinema-partner-seller button', expected: 'Supplier Registration' }]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(650);
    await page.locator(selector).click();
    results.push({ button, expected, body: (await page.locator('body').innerText()).slice(0, 65) });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
