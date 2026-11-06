const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const input = 'C:/Users/Magalas B/Downloads/Smiling Motorcycle Gas Delivery Rider.png';
  const output = 'src/assets/cgd-rider-cutout.webp';
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const data = fs.readFileSync(input).toString('base64');
  await page.setContent(`<img id="source" src="data:image/png;base64,${data}">`);
  const result = await page.evaluate(async () => {
    const img = document.getElementById('source');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, url: canvas.toDataURL('image/webp', 0.84) };
  });
  fs.writeFileSync(output, Buffer.from(result.url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ width: result.width, height: result.height, bytes: fs.statSync(output).size }));
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
