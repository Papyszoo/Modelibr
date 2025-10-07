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

// Enable console logging
page.on('console', msg => console.log('PAGE LOG:', msg.text()))
page.on('pageerror', error => console.log('PAGE ERROR:', error.message))

await page.goto('file://' + process.cwd() + '/render-template.html')

// Wait for module script to execute
await new Promise(resolve => setTimeout(resolve, 2000))

// Check what's on window
const result = await page.evaluate(() => {
  return {
    hasTHREE: typeof window.THREE !== 'undefined',
    hasInitRenderer: typeof window.initRenderer !== 'undefined',
    hasModelRenderer: typeof window.modelRenderer !== 'undefined',
    modelRendererState: window.modelRenderer ? {
      scene: !!window.modelRenderer.scene,
      camera: !!window.modelRenderer.camera,
      renderer: !!window.modelRenderer.renderer,
      error: window.modelRenderer.error
    } : null
  }
})

console.log('Window state:', JSON.stringify(result, null, 2))

await browser.close()
