/**
 * Measure each mark's true drawn bounds inside its viewBox.
 *
 * A path's viewBox says nothing about where the ink lands inside it, and an
 * off-centre glyph is invisible in code but obvious on screen. Rendering to a
 * transparent canvas and reading back the opaque pixel rectangle answers it
 * with pixels instead of arithmetic.
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

/** SVG markup plus its viewBox for one provider. */
function markupOf(provider) {
  if (provider === 'zhipu') {
    return {
      viewBox: '0 0 21.052 24',
      body: zhipu.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join(''),
    }
  }
  return {
    viewBox: '0 0 24 24',
    body: `<path d="${provider === 'deepseek' ? deepseek : minimax}" fill="#000"/>`,
  }
}

const SCALE = 10

for (const provider of ['deepseek', 'minimax', 'zhipu']) {
  const { viewBox, body } = markupOf(provider)
  const [, , vw, vh] = viewBox.split(/\s+/).map(Number)
  const width = Math.round(vw * SCALE)
  const height = Math.round(vh * SCALE)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`

  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = info.width
  let maxX = -1
  let minY = info.height
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3]
      if (alpha < 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const left = minX / SCALE
  const right = vw - (maxX + 1) / SCALE
  const top = minY / SCALE
  const bottom = vh - (maxY + 1) / SCALE
  const inkW = (maxX - minX + 1) / SCALE
  const inkH = (maxY - minY + 1) / SCALE

  console.log(
    `${provider.padEnd(9)} viewBox ${vw}x${vh}  ink ${inkW.toFixed(2)}x${inkH.toFixed(2)}` +
      `  gaps L=${left.toFixed(2)} R=${right.toFixed(2)} T=${top.toFixed(2)} B=${bottom.toFixed(2)}` +
      `  off-centre x=${((left - right) / 2).toFixed(2)} y=${((top - bottom) / 2).toFixed(2)}`,
  )
}
