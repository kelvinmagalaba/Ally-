const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const results = [];
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'small', width: 320, height: 700 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1100);
    const width = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const storyEnhanced = await page.locator('.cinema-story.is-enhanced').count();
    await page.screenshot({ path: `../.tmp-cinema-v2-hero-${viewport.name}.png` });
    if (viewport.name !== 'small') {
      await page.locator('#products').scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `../.tmp-cinema-v2-products-${viewport.name}.png` });
      await page.locator('.cinema-size-list button').first().click();
      const product = await page.locator('.cinema-product-stage-size').textContent();
      await page.locator('#partners').scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `../.tmp-cinema-v2-partners-${viewport.name}.png` });
      await page.locator('.cinema-faq').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      console.log('FAQ diagnostic', viewport.name, await page.locator('.cinema-faq-item').first().evaluate((el) => ({ rect: el.getBoundingClientRect().toJSON(), style: el.getAttribute('style'), opacity: getComputedStyle(el).opacity, scrollY })));
      await page.screenshot({ path: `../.tmp-cinema-v2-faq-${viewport.name}.png` });
      await page.locator('.cinema-faq-item summary').first().click();
      const faqOpen = await page.locator('.cinema-faq-item').first().evaluate((el) => el.open);
      await page.locator('#contact').scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `../.tmp-cinema-v2-final-${viewport.name}.png` });
      results.push({ viewport: viewport.name, width, storyEnhanced, product, faqOpen, errors });
    } else {
      await page.locator('.cinema-menu').click();
      const menuOpen = await page.locator('.cinema-nav').evaluate((el) => el.classList.contains('is-open'));
      await page.locator('.cinema-nav a[href="#products"]').click();
      await page.waitForTimeout(650);
      const hash = await page.evaluate(() => location.hash);
      const productsY = await page.locator('#products').evaluate((el) => el.getBoundingClientRect().top);
      results.push({ viewport: viewport.name, width, storyEnhanced, menuOpen, hash, productsY, errors });
    }
    await page.close();
  }
  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await reduced.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  results.push({ reducedMotion: true, enhanced: await reduced.locator('.cinema-story.is-enhanced').count(), panels: await reduced.locator('.cinema-story-panel').count() });
  await reduced.close();
  const auth = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await auth.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await auth.getByRole('button', { name: 'Log in', exact: true }).first().click();
  results.push({ loginText: (await auth.locator('body').innerText()).slice(0, 300) });
  await auth.close();
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
