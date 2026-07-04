#!/usr/bin/env node
/**
 * Build a side-by-side before/after page from two design:snap runs.
 *
 *   npm run design:compare -- <before-label> <after-label>
 *
 * Writes test-report/design-review/compare-<before>-vs-<after>.html and
 * prints its path. Click any pair to flip between the two shots in place
 * (spot-the-difference mode).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)
const reviewDir = path.join(repoRoot, 'test-report/design-review')

const [before, after] = process.argv.slice(2)
if (!before || !after) {
  console.error('Usage: design:compare -- <before-label> <after-label>')
  process.exit(1)
}
for (const label of [before, after]) {
  if (!fs.existsSync(path.join(reviewDir, label))) {
    console.error(`No snapshot folder: ${path.join(reviewDir, label)}`)
    process.exit(1)
  }
}

const shots = fs
  .readdirSync(path.join(reviewDir, before))
  .filter(f => f.endsWith('.png'))
  .sort()

const rows = shots
  .map(f => {
    const afterExists = fs.existsSync(path.join(reviewDir, after, f))
    return `
<section>
  <h2>${f.replace('.png', '').replace('--', ' — ')}</h2>
  <div class="pair">
    <figure>
      <figcaption>before · ${before}</figcaption>
      <img src="${before}/${f}" loading="lazy" alt="before ${f}">
    </figure>
    <figure>
      <figcaption>after · ${after}</figcaption>
      ${
        afterExists
          ? `<img src="${after}/${f}" loading="lazy" alt="after ${f}">`
          : '<p class="missing">missing in after run</p>'
      }
    </figure>
  </div>
  ${
    afterExists
      ? `<details><summary>flip in place (A/B on click)</summary>
           <div class="flip" data-a="${before}/${f}" data-b="${after}/${f}">
             <img src="${before}/${f}" loading="lazy" alt="flip ${f}">
             <span class="flip-tag">before</span>
           </div>
         </details>`
      : ''
  }
</section>`
  })
  .join('\n')

const html = `<!doctype html>
<meta charset="utf-8">
<title>design review: ${before} vs ${after}</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 1rem; background: #111; color: #ddd; }
  h1 { font-size: 1.1rem; } h2 { font-size: 0.95rem; margin: 1.5rem 0 0.5rem; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  figure { margin: 0; } figcaption { font-size: 0.75rem; color: #999; margin-bottom: 0.25rem; }
  img { width: 100%; border: 1px solid #333; border-radius: 4px; }
  .missing { color: #f66; }
  details { margin-top: 0.5rem; } summary { cursor: pointer; color: #7ab; font-size: 0.8rem; }
  .flip { position: relative; cursor: pointer; max-width: 50%; }
  .flip-tag { position: absolute; top: 8px; left: 8px; background: #000c; padding: 2px 8px;
              border-radius: 4px; font-size: 0.75rem; }
</style>
<h1>design review: <code>${before}</code> vs <code>${after}</code></h1>
<p>Side-by-side full-page shots. Open the "flip in place" view and click the image to A/B it.</p>
${rows}
<script>
  document.querySelectorAll('.flip').forEach(el => {
    const img = el.querySelector('img'), tag = el.querySelector('.flip-tag')
    let showingA = true
    el.addEventListener('click', () => {
      showingA = !showingA
      img.src = showingA ? el.dataset.a : el.dataset.b
      tag.textContent = showingA ? 'before' : 'after'
    })
  })
</script>`

const outFile = path.join(reviewDir, `compare-${before}-vs-${after}.html`)
fs.writeFileSync(outFile, html)
console.log(outFile)
