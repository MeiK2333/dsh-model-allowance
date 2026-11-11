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
  // A bundled function ends with a brace in column zero.
  const end = client.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`unterminated ${name}`)
  return client.slice(start, end)
}

/** Read one numeric or string prop out of a props block. */
function prop(block, key, fallback) {
  const quoted = new RegExp(`\\b${key}: ['"\`]([^'"\`]+)['"\`]`).exec(block)
  if (quoted) return quoted[1]
  const numeric = new RegExp(`\\b${key}: ([\\d.]+)`).exec(block)
  if (numeric) return Number(numeric[1])
  return fallback
}

/**
 * One glyph as inline SVG. Every path keeps its own fill, because the refresh
 * arrowhead is a filled triangle and would vanish if drawn as a stroke.
 *
 * The bundle names the element call `createElement)("path", …)` while the
 * source says `h('path', …)`, so both spellings are read.
 */
function markupOf(name, color) {
  const block = blockOf(name)
  const parts = []
  for (const match of block.matchAll(
    /(?:createElement\)\(|h\()\s*["'](path|rect)["'],\s*\{([\s\S]*?)\}\)/g,
  )) {
    const tag = match[1]
    const props = match[2]
    const fill = prop(props, 'fill', 'none')
    const stroke = prop(props, 'stroke', 'none')
    const paintedFill = fill === 'currentColor' ? color : fill
    const paintedStroke = stroke === 'currentColor' ? color : stroke
    const width = prop(props, 'strokeWidth', 0)
    if (tag === 'rect') {
      parts.push(
        `<rect x="${prop(props, 'x')}" y="${prop(props, 'y')}" width="${prop(props, 'width')}" height="${prop(
          props,
          'height',
        )}" rx="${prop(props, 'rx', 0)}" fill="${paintedFill}" stroke="${paintedStroke}" stroke-width="${width}"/>`,
      )
    } else {
      parts.push(
        `<path d="${prop(props, 'd')}" fill="${paintedFill}" stroke="${paintedStroke}" stroke-width="${width}" stroke-linecap="${prop(
          props,
          'strokeLinecap',
          'butt',
        )}" stroke-linejoin="${prop(props, 'strokeLinejoin', 'miter')}"/>`,
      )
    }
  }
  return parts.join('')
}

const BUTTON = 26
const ICON = 16
const SCALE = 8
const gap = 24
const glyphs = ['refreshGlyph', 'consoleGlyph', 'modelGlyph']
const width = BUTTON * glyphs.length + gap * (glyphs.length + 1)
const height = BUTTON + gap * 2

const cells = glyphs
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
