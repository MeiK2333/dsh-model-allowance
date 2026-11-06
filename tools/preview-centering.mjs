/**
 * Draw each mark inside its real chip at high magnification, with the chip's
 * centre lines available, so an off-centre glyph is visible rather than
 * deduced.
 *
 * Every value comes from client.js: the path data, the geometry, and the
 * gradient. The parser is deliberately shape-tolerant — reading by key rather
 * than by position — because a stricter one silently stopped matching when the
 * geometry gained its viewBox origin.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const client = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

/** One string constant out of client.js. */
const constantOf = (name) => {
  const value = new RegExp(`const ${name} =\\s*\\n\\s*'([^']+)'`).exec(client)?.[1]
  if (!value) throw new Error(`missing ${name}`)
  return value
}

/** A flat object literal of `key: number` pairs. */
function numbersOf(name) {
  const block = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n    \\}`).exec(client)?.[1]
  if (!block) throw new Error(`missing ${name}`)
  return Object.fromEntries(
    [...block.matchAll(/(\w+): (-?[\d.]+)/g)].map((match) => [match[1], Number(match[2])]),
  )
}

/** The Zhipu path list, with each path's fill. */
function zhipuPaths() {
  const block = /const ZHIPU_PATHS = \[([\s\S]*?)\n    \]/.exec(client)?.[1]
  if (!block) throw new Error('missing ZHIPU_PATHS')
  return [...block.matchAll(/d: '([^']+)',\s*fill: '([^']+)'/g)].map((match) => ({
    d: match[1],
    fill: match[2],
  }))
}

/** The MiniMax gradient definition. */
function minimaxGradient() {
  const block = /const MINIMAX_GRADIENT = \{([\s\S]*?)\n    \}/.exec(client)?.[1]
  if (!block) throw new Error('missing MINIMAX_GRADIENT')
  const id = /id: '([^']+)'/.exec(block)?.[1]
  const coords = Object.fromEntries(
    [...block.matchAll(/(x1|y1|x2|y2): (-?[\d.]+)/g)].map((match) => [match[1], Number(match[2])]),
  )
  const stops = [...block.matchAll(/\['(#[0-9A-Fa-f]+)', '([\d.]+)'\]/g)].map((match) => ({
    color: match[1],
    offset: match[2],
  }))
  return { id, ...coords, stops }
}

/** `{ deepseek: {…}, minimax: {…}, zhipu: {…} }` from ICON_GEOMETRY. */
function geometry() {
  const block = /const ICON_GEOMETRY = \{([\s\S]*?)\n    \}/.exec(client)?.[1]
  if (!block) throw new Error('missing ICON_GEOMETRY')
  const out = {}
  for (const match of block.matchAll(/(\w+): \{([^}]+)\}/g)) {
    out[match[1]] = Object.fromEntries(
      [...match[2].matchAll(/(\w+): (-?[\d.]+)/g)].map((pair) => [pair[1], Number(pair[2])]),
    )
  }
  return out
}

const GEOMETRY = geometry()
const deepseek = constantOf('DEEPSEEK_PATH')
const minimax = constantOf('MINIMAX_PATH')
const zhipu = zhipuPaths()
const gradient = minimaxGradient()

const crosshair = process.argv.includes('--crosshair')
const CHIP = 26
const INK_HEIGHT = 14
const SCALE = 20
const chipPx = CHIP * SCALE
const inkPx = INK_HEIGHT * SCALE
const gap = 40
const width = (chipPx + gap) * 3 + gap
const height = chipPx + gap * 2

/**
 * Box dimensions and inner markup for one mark, mirroring the component:
 * whole even boxes, ink height matched, viewBox cropped to the glyph.
 */
function body(provider) {
  const geo = GEOMETRY[provider]
  if (!geo) throw new Error(`missing geometry for ${provider}`)
  const even = (value) => Math.max(2, Math.round(value / 2) * 2)
  const h = even((inkPx * geo.vbH) / geo.inkH)
  const w = even((inkPx * geo.vbW) / geo.inkH)

  let inner
  if (provider === 'zhipu') {
    inner = zhipu.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('')
  } else if (provider === 'minimax') {
    const stops = gradient.stops
      .map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`)
      .join('')
    inner =
      `<defs><linearGradient id="${gradient.id}" x1="${gradient.x1}" y1="${gradient.y1}"` +
      ` x2="${gradient.x2}" y2="${gradient.y2}" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>` +
      `<path d="${minimax}" fill="url(#${gradient.id})"/>`
  } else {
    inner = `<path d="${deepseek}" fill="#4d6bfe"/>`
  }
  return { w, h, inner, viewBox: `${geo.x} ${geo.y} ${geo.vbW} ${geo.vbH}` }
}

// The chip draws no surface of its own any more, so the sheet uses the panel
// colour and only the selected chip gets a frame — the same thing the CSS does.
const PANEL = '#e9ecf2'
const FRAME = '#c9ccd4'
const SELECTED = 'zhipu'

const cells = ['deepseek', 'minimax', 'zhipu']
  .map((provider, index) => {
    const x = gap + index * (chipPx + gap)
    const y = gap
    const mark = body(provider)
    const insetX = (chipPx - mark.w) / 2
    const insetY = (chipPx - mark.h) / 2
    const midX = x + chipPx / 2
    const midY = y + chipPx / 2
    const frame =
      provider === SELECTED
        ? `<rect x="${x}" y="${y}" width="${chipPx}" height="${chipPx}" rx="${7 * SCALE}"
             fill="none" stroke="${FRAME}" stroke-width="${SCALE}"/>`
        : ''
    return `
      ${frame}
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
  <rect width="${width}" height="${height}" fill="${PANEL}"/>
  ${cells}
</svg>`

const output = path.join(here, '..', '.preview', crosshair ? 'chip-centering.png' : 'chip-clean.png')
fs.mkdirSync(path.dirname(output), { recursive: true })
await sharp(Buffer.from(sheet)).png().toFile(output)
console.log('wrote', output)
