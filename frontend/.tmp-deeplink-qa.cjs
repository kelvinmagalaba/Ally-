const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto('http://127.0.0.1:8084/#journey', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => ({ hash: location.hash, journeyTop: document.querySelector('#journey').getBoundingClientRect().top, scrollY }));
    await page.locator('.cinema-story-back').first().click();
    await page.waitForTimeout(350);
    const after = await page.evaluate(() => ({ hash: location.hash, scrollY, quickOrder: !!document.querySelector('.cinema-quick-order') }));
    console.log(JSON.stringify({ viewport: viewport.width, before, after }, null, 2));
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
