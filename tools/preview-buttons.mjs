/**
 * Render the two footer button glyphs exactly as they ship — a 26px button
 * holding a 16px icon — then magnify the pixels with nearest-neighbour.
 *
 * Magnified vector art flatters a glyph; magnified raster pixels show what the
 * screen will really show. That difference settled the console icon: a terminal
 * prompt turned into a smudge at this size and a window did not.
 *
 * The markup is extracted from client.js so this cannot drift from shipping.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const client = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

/** The body of one glyph function, up to its closing line. */
function blockOf(name) {
  const start = client.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`missing ${name}`)
  const end = client.indexOf('\n    }', start)
  if (end < 0) throw new Error(`unterminated ${name}`)
  return client.slice(start, end)
}

/** Read one numeric or string prop out of a props block. */
function prop(block, key, fallback) {
  const quoted = new RegExp(`${key}: '([^']+)'`).exec(block)
  if (quoted) return quoted[1]
  const numeric = new RegExp(`${key}: ([\\d.]+)`).exec(block)
  if (numeric) return Number(numeric[1])
  return fallback
}

/**
 * One glyph as inline SVG. Every path keeps its own fill, because the refresh
 * arrowhead is a filled triangle and would vanish if drawn as a stroke.
 */
function markupOf(name, color) {
  const block = blockOf(name)
  const rects = [...block.matchAll(/h\('rect', \{([\s\S]*?)\}\)/g)].map((match) => {
    const props = match[1]
    return `<rect x="${prop(props, 'x')}" y="${prop(props, 'y')}" width="${prop(
      props,
      'width',
    )}" height="${prop(props, 'height')}" rx="${prop(props, 'rx', 0)}" fill="none" stroke="${color}" stroke-width="${prop(
      props,
      'strokeWidth',
      1.6,
    )}"/>`
  })
  const paths = [...block.matchAll(/h\('path', \{([\s\S]*?)\}\)/g)].map((match) => {
    const props = match[1]
    const fill = prop(props, 'fill', 'none') === 'currentColor' ? color : prop(props, 'fill', 'none')
    const stroke = prop(props, 'stroke', 'none') === 'currentColor' ? color : prop(props, 'stroke', 'none')
    const cap = prop(props, 'strokeLinecap', 'butt')
    const join = prop(props, 'strokeLinejoin', 'miter')
    return `<path d="${prop(props, 'd')}" fill="${fill}" stroke="${stroke}" stroke-width="${prop(
      props,
      'strokeWidth',
      0,
    )}" stroke-linecap="${cap}" stroke-linejoin="${join}"/>`
  })
  return rects.join('') + paths.join('')
}

const BUTTON = 26
const ICON = 16
const SCALE = 8
const gap = 24
const width = BUTTON * 2 + gap * 3
const height = BUTTON + gap * 2

const cells = ['refreshGlyph', 'consoleGlyph']
  .map(
    (name, index) => `
      <rect x="${gap + index * (BUTTON + gap)}" y="${gap}" width="${BUTTON}" height="${BUTTON}" rx="7"
        fill="#f7f7fa" stroke="#d8d8e0" stroke-width="1"/>
      <g transform="translate(${gap + index * (BUTTON + gap) + (BUTTON - ICON) / 2}, ${
        gap + (BUTTON - ICON) / 2
      })">
        <svg width="${ICON}" height="${ICON}" viewBox="0 0 20 20">${markupOf(name, '#333')}</svg>
      </g>`,
  )
  .join('')

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>${cells}</svg>`

const output = path.join(here, '..', '.preview', 'footer-buttons.png')
fs.mkdirSync(path.dirname(output), { recursive: true })
const raster = await sharp(Buffer.from(sheet)).png().toBuffer()
await sharp(raster).resize({ width: width * SCALE, kernel: 'nearest' }).toFile(output)
console.log('wrote', output)
