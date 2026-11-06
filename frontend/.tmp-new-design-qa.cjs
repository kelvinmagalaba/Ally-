const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const results = [];
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'small', width: 320, height: 700 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('#mikoani').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `../.tmp-new-magalai-${viewport.name}.png` });
    const quickVisible = await page.getByRole('button', { name: 'Quick order' }).isVisible();
    await page.locator('.cinema-showcase').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(450);
    await page.screenshot({ path: `../.tmp-new-showcase-${viewport.name}.png` });
    const canvas = await page.locator('.cgd-column-spread canvas').evaluate((el) => ({ width: el.width, height: el.height, pixel: [...el.getContext('2d').getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1).data] }));
    await page.locator('.cgd-column-spread-control').click();
    const pauseLabel = await page.locator('.cgd-column-spread-control').getAttribute('aria-label');
    await page.locator('#stories').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1900);
    await page.screenshot({ path: `../.tmp-new-voices-${viewport.name}.png` });
    results.push({ viewport: viewport.name, overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), quickVisible, canvas, pauseLabel, headings: await page.locator('.cgd-cinema h1,.cgd-cinema h2,.cgd-cinema h3,.cgd-cinema h4').count(), rawHeadings: await page.locator('.cgd-cinema h1:not(:has(.cinema-type-line)),.cgd-cinema h2:not(:has(.cinema-type-line)),.cgd-cinema h3:not(:has(.cinema-type-line)),.cgd-cinema h4:not(:has(.cinema-type-line))').count(), errors });
    await page.close();
  }
  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reduced.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  results.push({ reducedMotion: true, showcaseControlDisabled: await reduced.locator('.cgd-column-spread-control').isDisabled(), heroText: await reduced.locator('#cinema-hero-title').innerText() });
  await reduced.close();
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
