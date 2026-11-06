/**
 * Extract the official artwork for the two marks that are still third-party.
 *
 * DeepSeek publishes a standalone square icon SVG; MiniMax only publishes a
 * wordmark, so its waveform has to be separated from the lettering. This
 * reports, for each: the path data, the paint, and the ink bounding box, so
 * the component can crop its viewBox to the glyph exactly.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Ink bounding box of an SVG drawn on a transparent canvas. */
async function inkBoxOf(svg, label) {
  const size = 1000
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const vb = /viewBox=["']([^"']+)["']/.exec(svg)
  const [vx, vy, vw, vh] = (vb?.[1] ?? '0 0 1 1').split(/[\s,]+/).map(Number)
  let minX = info.width
  let maxX = -1
  let minY = info.height
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const toUnits = (px, axis) => {
    const scale = axis === 'x' ? vw / info.width : vh / info.height
    return (axis === 'x' ? vx : vy) + px * scale
  }
  const box = {
    x: toUnits(minX, 'x'),
    y: toUnits(minY, 'y'),
    w: toUnits(maxX + 1 - minX, 'x'),
    h: toUnits(maxY + 1 - minY, 'y'),
  }
  console.log(
    `  ${label}: ink box in viewBox units  x=${box.x.toFixed(3)} y=${box.y.toFixed(3)}` +
      ` w=${box.w.toFixed(3)} h=${box.h.toFixed(3)}  (aspect ${(box.w / box.h).toFixed(4)})`,
  )
  return box
}

console.log('=== DeepSeek chat/favicon.svg')
const dsSvg = await (await fetch('https://fe-static.deepseek.com/chat/favicon.svg', { headers: { 'user-agent': UA } })).text()
const dsPath = /<path[^>]*d="([^"]+)"/.exec(dsSvg)?.[1]
const dsFill = /fill="(#[0-9A-Fa-f]{6})"/.exec(dsSvg)?.[1]
console.log(`  viewBox ${/viewBox=["']([^"']+)["']/.exec(dsSvg)?.[1]}  fill ${dsFill}  pathLen ${dsPath?.length}`)
console.log(`  subpaths ${(dsPath?.match(/[Mm]/g) ?? []).length}`)
await inkBoxOf(dsSvg, 'deepseek')

console.log('\n=== MiniMax wordmark light.svg')
const mmSvg = await (await fetch('https://mintcdn.com/minimax-zh/1UjvBcdoC6r0UeyA/logo/light.svg', { headers: { 'user-agent': UA } })).text()
const mmPaths = [...mmSvg.matchAll(/<path[^>]*d="([^"]+)"/g)].map((m) => m[1])
console.log(`  viewBox ${/viewBox=["']([^"']+)["']/.exec(mmSvg)?.[1]}  paths ${mmPaths.length}`)
const gradient = /<linearGradient[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/linearGradient>/g
for (const m of mmSvg.matchAll(gradient)) {
  const stops = [...m[2].matchAll(/stop-color="([^"]+)"(?:\s+stop-opacity="([^"]+)")?/g)].map((s) => s[1])
  console.log(`  gradient ${m[1]}: stops ${stops.join(' -> ')}`)
}
// Which paint does each path use?
for (const [index, match] of [...mmSvg.matchAll(/<path[^>]*>/g)].entries()) {
  const tag = match[0]
  const d = /d="([^"]+)"/.exec(tag)?.[1] ?? ''
  const fill = /fill="([^"]+)"/.exec(tag)?.[1] ?? '(none)'
  const start = /d="M\s*([\d.]+)/.exec(tag)?.[1]
  console.log(`  path${index} fill=${fill.padEnd(22)} starts x=${start} len=${d.length}`)
}

// The waveform is whichever path fills with the gradient.
const waveTag = [...mmSvg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).find((tag) => /fill="url\(#/.test(tag))
const waveD = waveTag ? /d="([^"]+)"/.exec(waveTag)?.[1] : undefined
const waveFill = waveTag ? /fill="([^"]+)"/.exec(waveTag)?.[1] : undefined
if (waveD) {
  console.log(`\n  waveform: fill ${waveFill}  len ${waveD.length}  subpaths ${(waveD.match(/[Mm]/g) ?? []).length}`)
  // Crop the viewBox to the waveform's own box so the glyph stands alone.
  const vb = /viewBox=["']([^"']+)["']/.exec(mmSvg)[1].split(/[\s,]+/).map(Number)
  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="129" height="32" viewBox="0 0 ${String(vb[2])} ${String(vb[3])}"><path d="${waveD}" fill="#000"/></svg>`
  const box = await inkBoxOf(wrapper, 'minimax waveform')
  console.log(`  suggested cropped viewBox: ${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}`)
}
