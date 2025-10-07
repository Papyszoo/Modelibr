import puppeteer from 'puppeteer'

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/usr/bin/chromium',
  args: [
    '--no-sandbox', 
    '--disable-setuid-sandbox', 
    '--disable-dev-shm-usage', 
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--use-gl=swiftshader',  // Use software rendering for WebGL
    '--enable-webgl',         // Enable WebGL explicitly
    '--ignore-gpu-blocklist'  // Ignore GPU blocklist
  ]
})

const page = await browser.newPage()

page.on('console', msg => console.log('CONSOLE:', msg.text()))

await page.goto('file://' + process.cwd() + '/render-template.html')
await page.waitForFunction(() => window.THREE !== undefined, { timeout: 5000 })

const result = await page.evaluate(async () => {
  const initialized = await window.initRenderer(800, 600, '#f0f0f0')
  return { success: initialized, error: window.modelRenderer.error }
})

console.log('Result:', JSON.stringify(result, null, 2))

await browser.close()
