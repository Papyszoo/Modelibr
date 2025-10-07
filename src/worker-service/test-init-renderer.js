import puppeteer from 'puppeteer'

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/usr/bin/chromium',
  args: [
    '--no-sandbox', 
    '--disable-setuid-sandbox', 
    '--disable-dev-shm-usage', 
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process'
  ]
})

const page = await browser.newPage()

page.on('console', msg => console.log('CONSOLE:', msg.text()))
page.on('pageerror', error => console.log('ERROR:', error.message))

await page.goto('file://' + process.cwd() + '/render-template.html')

// Wait for THREE
await page.waitForFunction(() => window.THREE !== undefined, { timeout: 5000 })
console.log('THREE is loaded')

// Try to init renderer
const result = await page.evaluate(async () => {
  try {
    const initialized = await window.initRenderer(800, 600, '#f0f0f0')
    return { success: initialized, error: window.modelRenderer.error }
  } catch (error) {
    return { success: false, error: error.message, stack: error.stack }
  }
})

console.log('Init result:', JSON.stringify(result, null, 2))

await browser.close()
