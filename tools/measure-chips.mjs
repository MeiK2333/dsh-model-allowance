/**
 * Measure the rendered chips: where each mark's ink actually lands inside its
 * chip, in pixels.
 *
 * Geometry says all three are centred; what matters is where the ink sits on
 * screen and how big the three appear next to each other.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const file = path.join(here, '..', '.preview', 'chip-clean.png')
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

const CHIP = 26
const SCALE = 20
const chipPx = CHIP * SCALE
const gap = 40

for (const [index, name] of ['deepseek', 'minimax', 'zhipu'].entries()) {
  const x0 = gap + index * (chipPx + gap)
  const y0 = gap
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let y = y0; y < y0 + chipPx; y += 1) {
    for (let x = x0; x < x0 + chipPx; x += 1) {
      const i = (y * info.width + x) * 4
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      // The marks are saturated; the chip and its page are neutral greys.
      const saturation = Math.max(r, g, b) - Math.min(r, g, b)
      if (saturation < 40) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const cx = x0 + chipPx / 2
  const cy = y0 + chipPx / 2
  const inkCx = (minX + maxX + 1) / 2
  const inkCy = (minY + maxY + 1) / 2
  const inkW = (maxX - minX + 1) / SCALE
  const inkH = (maxY - minY + 1) / SCALE
  console.log(
    `${name.padEnd(9)} ink ${inkW.toFixed(1)}x${inkH.toFixed(1)}px in a ${CHIP}px chip` +
      `  offset from centre: x=${((inkCx - cx) / SCALE).toFixed(2)} y=${((inkCy - cy) / SCALE).toFixed(2)}`,
  )
}
