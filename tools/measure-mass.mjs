/**
 * Compare each glyph's ink bounding box with its ink centroid.
 *
 * A mark can sit perfectly inside its box and still look shifted, because the
 * eye follows where the mass is, not where the extremes are: a whale with a
 * heavy body on the left and a thin tail on the right reads left-heavy even
 * when its bounding box is centred. This measures that difference.
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

/** Glyph body plus the viewBox it is drawn in. */
function glyphOf(name) {
  if (name === 'zhipu') {
    return {
      viewBox: '0 0 21.052 24',
      body: zhipu.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join(''),
    }
  }
  if (name === 'refresh' || name === 'console') {
    const start = client.indexOf(`function ${name}Glyph(`)
    const block = client.slice(start, client.indexOf('\n    }', start))
    const rects = [...block.matchAll(/h\('rect', \{([\s\S]*?)\}\)/g)].map((match) => {
      const props = match[1]
      const num = (key) => Number(new RegExp(`${key}: ([\\d.]+)`).exec(props)?.[1])
      return `<rect x="${num('x')}" y="${num('y')}" width="${num('width')}" height="${num(
        'height',
      )}" rx="${num('rx') ?? 0}" fill="none" stroke="#000" stroke-width="${num('strokeWidth')}"/>`
    })
    const paths = [...block.matchAll(/h\('path', \{([\s\S]*?)\}\)/g)].map((match) => {
      const props = match[1]
      const d = /d: '([^']+)'/.exec(props)?.[1]
      const fill = /fill: 'currentColor'/.test(props) ? '#000' : /fill: 'none'/.test(props) ? 'none' : '#000'
      const stroke = /stroke: 'currentColor'/.test(props) ? '#000' : 'none'
      return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${
        Number(/strokeWidth: ([\d.]+)/.exec(props)?.[1]) || 0
      }" stroke-linecap="round" stroke-linejoin="round"/>`
    })
    return { viewBox: '0 0 20 20', body: rects.join('') + paths.join('') }
  }
  return {
    viewBox: '0 0 24 24',
    body: `<path d="${name === 'deepseek' ? deepseek : minimax}" fill="#000"/>`,
  }
}

const SCALE = 12

for (const name of ['deepseek', 'minimax', 'zhipu', 'refresh', 'console']) {
  const { viewBox, body } = glyphOf(name)
  const [, , vw, vh] = viewBox.split(/\s+/).map(Number)
  const width = Math.round(vw * SCALE)
  const height = Math.round(vh * SCALE)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  let minX = info.width
  let maxX = -1
  let minY = info.height
  let maxY = -1
  let sumX = 0
  let sumY = 0
  let sum = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3]
      if (alpha < 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      // Edge pixels count less than solid interiors.
      sumX += x * alpha
      sumY += y * alpha
      sum += alpha
    }
  }
  const boxCx = (minX + maxX + 1) / 2
  const boxCy = (minY + maxY + 1) / 2
  const massCx = sumX / sum
  const massCy = sumY / sum
  const centreX = (vw * SCALE) / 2
  const centreY = (vh * SCALE) / 2
  console.log(
    `${name.padEnd(9)} viewBox centre (${centreX.toFixed(1)}, ${centreY.toFixed(1)})` +
      ` | box centre (${boxCx.toFixed(1)}, ${boxCy.toFixed(1)})` +
      ` | mass centre (${massCx.toFixed(1)}, ${massCy.toFixed(1)})` +
      ` | mass vs box  dx=${((massCx - boxCx) / SCALE).toFixed(2)}u dy=${((massCy - boxCy) / SCALE).toFixed(2)}u`,
  )
}
