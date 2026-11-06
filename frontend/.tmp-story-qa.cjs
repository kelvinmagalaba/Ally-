const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('#journey').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const snaps = [];
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, i === 0 ? 0 : 840);
    await page.waitForTimeout(500);
    snaps.push(await page.evaluate(() => ({ scrollY, pinTop: document.querySelector('.cinema-story-pin').getBoundingClientRect().top, panels: Array.from(document.querySelectorAll('.cinema-story-panel')).map((el) => +getComputedStyle(el).opacity) })));
    await page.screenshot({ path: `../.tmp-cinema-story-${i}.png` });
  }
  console.log(JSON.stringify(snaps, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
