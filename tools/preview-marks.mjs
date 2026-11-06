/**
 * Render the three provider marks to a PNG so they can be looked at.
 *
 * The path data is read out of client.js, so this previews exactly what the
 * plugin draws rather than a copy that could drift.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const client = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

/** Pull one string constant out of client.js. */
function constantOf(name) {
  const match = new RegExp(`${name} =\\s*'([^']+)'`).exec(client)
  if (!match) throw new Error(`missing ${name}`)
  return match[1]
}

const deepseek = constantOf('DEEPSEEK_PATH')
const minimax = constantOf('MINIMAX_PATH')

// The Zhipu glyph array, with its flat fills, in declaration order.
const zhipuBlock = /const ZHIPU_PATHS = \[([\s\S]*?)\n    \]/.exec(client)?.[1]
if (!zhipuBlock) throw new Error('missing ZHIPU_PATHS')
const zhipu = [...zhipuBlock.matchAll(/d: '([^']+)',\s*fill: '([^']+)'/g)].map((match) => ({
  d: match[1],
  fill: match[2],
}))

/** One mark as standalone SVG markup. */
function markup(provider, size, color) {
  if (provider === 'zhipu') {
    const paths = zhipu
      .map((path) => `<path d="${path.d}" fill="${path.fill}"/>`)
      .join('')
    const width = (size * 21.052) / 24
    return `<svg width="${width}" height="${size}" viewBox="0 0 21.052 24">${paths}</svg>`
  }
  const d = provider === 'deepseek' ? deepseek : minimax
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${d}" fill="${color}"/></svg>`
}

const COLORS = { deepseek: '#4d6bfe', minimax: '#e21680', zhipu: '#5668f5' }
const panels = [
  { background: '#ffffff', label: 'light' },
  { background: '#1b1b1f', label: 'dark' },
]

const width = 560
const rowHeight = 150
// A third band shows the marks as the card actually draws them: a 22px chip
// holding a 14px glyph, magnified four times so the true proportions are
// readable without guessing.
const chipScale = 4
const chipRowHeight = 100
const chipBandHeight = chipRowHeight * panels.length + 20
const height = rowHeight * panels.length + chipBandHeight + 60

const groups = panels
  .map((panel, rowIndex) => {
    const y = 20 + rowIndex * rowHeight
    const cells = ['deepseek', 'minimax', 'zhipu']
      .map((provider, index) => {
        const x = 40 + index * 170
        return `
          ${markup(provider, 96, COLORS[provider]).replace('<svg', `<svg x="${x}" y="${y}"`)}
          <text x="${x + 48}" y="${y + 118}" font-size="12" fill="${panel.background === '#ffffff' ? '#444' : '#bbb'}" text-anchor="middle" font-family="Segoe UI, sans-serif">${provider}</text>
        `
      })
      .join('')
    return `<rect x="0" y="${y - 18}" width="${width}" height="${rowHeight - 10}" fill="${panel.background}"/>${cells}`
  })
  .join('')

// The chip band, with the light and dark surface colours the theme supplies.
const chipY = 20 + rowHeight * panels.length + 26
const chipChips = panels
  .map((panel, rowIndex) => {
    const bg = panel.background === '#ffffff' ? '#f2f2f5' : '#2a2a30'
    const border = panel.background === '#ffffff' ? '#e2e2e8' : '#3a3a42'
    const rowY = chipY + rowIndex * chipRowHeight
    const chips = ['deepseek', 'minimax', 'zhipu']
      .map((provider, index) => {
        const chipSize = 22 * chipScale
        const iconSize = 14 * chipScale
        const x = 40 + index * 90
        const inset = (chipSize - iconSize) / 2
        return `
          <rect x="${x}" y="${rowY}" width="${chipSize}" height="${chipSize}" rx="${6 * chipScale}"
            fill="${bg}" stroke="${border}" stroke-width="1"/>
          ${markup(provider, iconSize, COLORS[provider]).replace('<svg', `<svg x="${x + inset}" y="${rowY + inset}"`)}
        `
      })
      .join('')
    return `<rect x="0" y="${rowY - 12}" width="${width}" height="${chipRowHeight}" fill="${panel.background}"/>${chips}`
  })
  .join('')

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#888"/>
  ${groups}
  ${chipChips}
</svg>`

const output = path.join(here, '..', '.preview', 'provider-marks.png')
fs.mkdirSync(path.dirname(output), { recursive: true })
await sharp(Buffer.from(sheet)).png().toFile(output)
console.log('wrote', output)
