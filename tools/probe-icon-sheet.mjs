/**
 * Download the candidate square icons each provider publishes and lay them out
 * side by side, so the choice can be made by looking rather than by guessing
 * what a URL stands for.
 *
 * Rasterises every asset first (SVG included), so the sheet shows what each
 * file actually depicts, its transparency, and whether it is a bare mark or a
 * coloured tile.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const CANDIDATES = [
  ['deepseek svg', 'https://fe-static.deepseek.com/platform/favicon.svg'],
  ['deepseek chat svg', 'https://fe-static.deepseek.com/chat/favicon.svg'],
  ['deepseek png180', 'https://fe-static.deepseek.com/chat/icon-180.png'],
  ['minimax favicon', 'https://agent.minimax.cn/assets/logo/favicon_v2.png'],
  ['minimax touch', 'https://agent.minimax.cn/assets/logo/apple-touch_v2.png'],
  ['zhipu png90', 'https://bigmodel.cn/static/images/favicon.png'],
  ['zhipu png192', 'https://docs.bigmodel.cn/mintlify-assets/_mintlify/favicons/zhipu-ef7018ed/uX_6lYCPLvdOcSdM/_generated/favicon/android-chrome-192x192.png'],
]

const CELL = 96
const PAD = 24

const rendered = []
for (const [label, url] of CANDIDATES) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' })
    if (!response.ok) {
      rendered.push({ label, note: `HTTP ${String(response.status)}` })
      continue
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const meta = await sharp(buffer).metadata()
    // Flatten onto white so a transparent mark is still visible, and keep a
    // copy with alpha to report whether the file has one.
    const png = await sharp(buffer)
      .resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    rendered.push({
      label,
      data: png.toString('base64'),
      note: `${String(meta.format)} ${String(meta.width)}x${String(meta.height)}${meta.hasAlpha ? ' alpha' : ''} ${(buffer.length / 1024).toFixed(1)}KB`,
    })
  } catch (error) {
    rendered.push({ label, note: `error ${error.message.slice(0, 40)}` })
  }
}

const cellW = CELL + PAD * 2
const width = cellW * 4
const height = Math.ceil(rendered.length / 4) * (CELL + PAD + 34) + PAD

const cells = rendered
  .map((item, index) => {
    const x = PAD + (index % 4) * cellW
    const y = PAD + Math.floor(index / 4) * (CELL + PAD + 34)
    const image = item.data
      ? `<image x="${x}" y="${y}" width="${CELL}" height="${CELL}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${item.data}"/>`
      : ''
    return `
      <rect x="${x - 1}" y="${y - 1}" width="${CELL + 2}" height="${CELL + 2}" fill="none" stroke="#d0d0d8"/>
      ${image}
      <text x="${x + CELL / 2}" y="${y + CELL + 16}" font-size="12" text-anchor="middle"
        font-family="Segoe UI, sans-serif" fill="#222">${item.label}</text>
      <text x="${x + CELL / 2}" y="${y + CELL + 30}" font-size="10" text-anchor="middle"
        font-family="Segoe UI, sans-serif" fill="#777">${item.note}</text>`
  })
  .join('')

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>${cells}</svg>`

const output = path.join(here, '..', '.preview', 'official-icons.png')
fs.mkdirSync(path.dirname(output), { recursive: true })
await sharp(Buffer.from(sheet)).png().toFile(output)
console.log('wrote', output)
for (const item of rendered) console.log(`  ${item.label.padEnd(18)} ${item.note}`)
