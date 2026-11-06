/**
 * Draw each mark inside its real chip at high magnification, with the chip's
 * centre lines marked, so an off-centre glyph is visible rather than deduced.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const client = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')
const constantOf = (name) => new RegExp(`${name} =\\s*'([^']+)'`).exec(client)?.[1]
const deepseek = constantOf('DEEPSEEK_PATH')
const minimax = constantOf('MINIMAX_PATH')
const zhipuBlock = /const ZHIPU_PATHS = \[([\s\S]*?)\n    \]/.exec(client)?.[1]
const zhipu = [...zhipuBlock.matchAll(/d: '([^']+)',\s*fill: '([^']+)'/g)].map((m) => ({
  d: m[1],
  fill: m[2],
}))

const crosshair = process.argv.includes('--crosshair')
const COLORS = { deepseek: '#4d6bfe', minimax: '#e21680', zhipu: '#5668f5' }
const CHIP = 26
const INK_HEIGHT = 14
const SCALE = 20
const chipPx = CHIP * SCALE
const inkPx = INK_HEIGHT * SCALE
const gap = 40
const width = (chipPx + gap) * 3 + gap
const height = chipPx + gap * 2

// Read the same geometry the component uses, so the preview cannot drift.
const GEOMETRY = {}
for (const match of client.matchAll(
  /(\w+): \{ vbW: ([\d.]+), vbH: ([\d.]+), inkW: ([\d.]+), inkH: ([\d.]+) \}/g,
)) {
  GEOMETRY[match[1]] = {
    vbW: Number(match[2]),
    vbH: Number(match[3]),
    inkW: Number(match[4]),
    inkH: Number(match[5]),
  }
}
if (Object.keys(GEOMETRY).length !== 3) {
  throw new Error(`expected three icon geometries, parsed ${Object.keys(GEOMETRY).length}`)
}

/**
 * Box dimensions for this mark, rounded to whole even pixels the way the
 * component does it. A fractional box is floored into the chip's centre, which
 * is what made the marks sit a pixel left of centre on screen.
 */
function body(provider) {
  const geo = GEOMETRY[provider]
  const even = (value) => Math.max(2, Math.round(value / 2) * 2)
  const h = even((inkPx * geo.vbH) / geo.inkH)
  const w = even((inkPx * geo.vbW) / geo.inkH)
  const inner =
    provider === 'zhipu'
      ? zhipu.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('')
      : `<path d="${provider === 'deepseek' ? deepseek : minimax}" fill="${COLORS[provider]}"/>`
  return { w, h, inner, viewBox: `0 0 ${geo.vbW} ${geo.vbH}` }
}

const cells = ['deepseek', 'minimax', 'zhipu']
  .map((provider, index) => {
    const x = gap + index * (chipPx + gap)
    const y = gap
    const mark = body(provider)
    const insetX = (chipPx - mark.w) / 2
    const insetY = (chipPx - mark.h) / 2
    const midX = x + chipPx / 2
    const midY = y + chipPx / 2
    return `
      <rect x="${x}" y="${y}" width="${chipPx}" height="${chipPx}" rx="${7 * SCALE}"
        fill="#f2f2f5" stroke="#d0d0d8" stroke-width="2"/>
      ${crosshair ? `<line x1="${midX}" y1="${y}" x2="${midX}" y2="${y + chipPx}" stroke="#ff00aa" stroke-width="1.5" stroke-dasharray="6 6" opacity="0.85"/>` : ""}
      ${crosshair ? `<line x1="${x}" y1="${midY}" x2="${x + chipPx}" y2="${midY}" stroke="#ff00aa" stroke-width="1.5" stroke-dasharray="6 6" opacity="0.85"/>` : ""}
      <g transform="translate(${x + insetX}, ${y + insetY})">
        <svg width="${mark.w}" height="${mark.h}" viewBox="${mark.viewBox}">${mark.inner}</svg>
      </g>
      <text x="${midX}" y="${y + chipPx + 30}" font-size="22" text-anchor="middle"
        font-family="Segoe UI, sans-serif" fill="#333">${provider}</text>
    `
  })
  .join('')

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  ${cells}
</svg>`

const output = path.join(here, '..', '.preview', crosshair ? 'chip-centering.png' : 'chip-clean.png')
fs.mkdirSync(path.dirname(output), { recursive: true })
await sharp(Buffer.from(sheet)).png().toFile(output)
console.log('wrote', output)
