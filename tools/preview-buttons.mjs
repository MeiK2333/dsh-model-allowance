/**
 * Render the two footer button glyphs at the size they ship, magnified, so
 * their legibility can be judged rather than assumed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

// A 320-degree arc with its gap at the top, plus a filled arrowhead tangent to
// the arc's start, which is what makes it read as "rotate" rather than a hook.
const REFRESH = `
  <path d="M12.05 4.36A6 6 0 1 1 7.95 4.36" fill="none" stroke="#333" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M15.05 5.45L10.48 6.35L12.12 1.83Z" fill="#333" stroke="#333" stroke-width="0.6" stroke-linejoin="round"/>
`

const CREDITS = `
  <circle cx="10" cy="10" r="6.6" fill="none" stroke="#333" stroke-width="1.6"/>
  <path d="M10 5.4v9.2" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12.1 7.7c0-1.1-1-1.7-2.1-1.7s-2.1.6-2.1 1.7c0 1 .9 1.4 2.1 1.7s2.1.7 2.1 1.7c0 1.1-1 1.7-2.1 1.7s-2.1-.6-2.1-1.7" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
`

const SCALE = 14
const BTN = 22
const btnPx = BTN * SCALE
const gap = 60
const width = btnPx * 2 + gap * 3
const height = btnPx + gap * 2

const cells = [
  { name: 'refresh', body: REFRESH },
  { name: 'credits', body: CREDITS },
]
  .map((cell, index) => {
    const x = gap + index * (btnPx + gap)
    const iconPx = 14 * SCALE
    const inset = (btnPx - iconPx) / 2
    return `
      <rect x="${x}" y="${gap}" width="${btnPx}" height="${btnPx}" rx="${6 * SCALE}"
        fill="#f7f7fa" stroke="#d8d8e0" stroke-width="2"/>
      <g transform="translate(${x + inset}, ${gap + inset})">
        <svg width="${iconPx}" height="${iconPx}" viewBox="0 0 20 20">${cell.body}</svg>
      </g>
      <text x="${x + btnPx / 2}" y="${gap + btnPx + 40}" font-size="26" text-anchor="middle"
        font-family="Segoe UI, sans-serif" fill="#333">${cell.name}</text>
    `
  })
  .join('')

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>${cells}</svg>`

const output = path.join(here, '..', '.preview', 'footer-buttons.png')
fs.mkdirSync(path.dirname(output), { recursive: true })
await sharp(Buffer.from(sheet)).png().toFile(output)
console.log('wrote', output)
