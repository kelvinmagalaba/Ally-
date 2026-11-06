const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2300);
    await page.screenshot({ path: `../.tmp-type-hero-${viewport.width}.png` });
    await page.locator('#products').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2300);
    await page.screenshot({ path: `../.tmp-type-products-${viewport.width}.png` });
    console.log(JSON.stringify({ width: viewport.width, overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), headings: await page.locator('.cgd-cinema h1,.cgd-cinema h2,.cgd-cinema h3,.cgd-cinema h4,.cgd-cinema h5,.cgd-cinema h6').count(), rawHeadings: await page.locator('.cgd-cinema h1:not(:has(.cinema-type-line)),.cgd-cinema h2:not(:has(.cinema-type-line)),.cgd-cinema h3:not(:has(.cinema-type-line)),.cgd-cinema h4:not(:has(.cinema-type-line))').count(), errors }));
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
