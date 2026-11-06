const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const get = () => page.evaluate(() => ({ enhanced: document.querySelector('.cinema-story').classList.contains('is-enhanced'), spacers: document.querySelectorAll('.pin-spacer').length, width: document.documentElement.scrollWidth - innerWidth, opacity: getComputedStyle(document.querySelectorAll('.cinema-story-panel')[1]).opacity }));
  const desktop = await get();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const mobile = await get();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  const restored = await get();
  console.log(JSON.stringify({ desktop, mobile, restored }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
