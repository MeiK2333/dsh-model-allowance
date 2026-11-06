/**
 * Write the official DeepSeek and MiniMax path data into client.js.
 *
 * The artwork is thousands of characters; retyping it would risk a silent
 * single-character corruption that no test would catch. This fetches the
 * sources, extracts the exact `d` strings, and splices them in place of the
 * Simple Icons ones. It writes only with `--write`; the default is a dry run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientPath = path.join(here, '..', 'src', 'client', 'icons.js')
const write = process.argv.includes('--write')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const fetchText = async (url) =>
  (await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' })).text()

const deepseekSvg = await fetchText('https://fe-static.deepseek.com/chat/favicon.svg')
const deepseekD = /<path[^>]*d="([^"]+)"/.exec(deepseekSvg)?.[1]
if (!deepseekD) throw new Error('no DeepSeek path found')

const minimaxSvg = await fetchText('https://mintcdn.com/minimax-zh/1UjvBcdoC6r0UeyA/logo/light.svg')
const minimaxTag = [...minimaxSvg.matchAll(/<path[^>]*>/g)]
  .map((match) => match[0])
  .find((tag) => /fill="url\(#/.test(tag))
const minimaxD = minimaxTag ? /d="([^"]+)"/.exec(minimaxTag)?.[1] : undefined
if (!minimaxD) throw new Error('no MiniMax waveform path found')

let source = fs.readFileSync(clientPath, 'utf8')

/** Replace one `const NAME = '...'` assignment. */
function replaceConstant(text, name, value) {
  const pattern = new RegExp(`const ${name} =\\s*\\n\\s*'[^']*'`)
  if (!pattern.test(text)) throw new Error(`could not find ${name}`)
  return text.replace(pattern, `const ${name} =\n  '${value}'`)
}

source = replaceConstant(source, 'DEEPSEEK_PATH', deepseekD)
source = replaceConstant(source, 'MINIMAX_PATH', minimaxD)

if (!write) {
  console.log('dry run: pass --write to update src/client/icons.js')
  console.log(`deepseek path ${deepseekD.length} chars, subpaths ${(deepseekD.match(/[Mm]/g) ?? []).length}`)
  console.log(`minimax path ${minimaxD.length} chars, subpaths ${(minimaxD.match(/[Mm]/g) ?? []).length}`)
  process.exit(0)
}

fs.writeFileSync(clientPath, source)
console.log('updated src/client/icons.js; run `npm run build` to regenerate client.js')
console.log(`deepseek path ${deepseekD.length} chars, subpaths ${(deepseekD.match(/[Mm]/g) ?? []).length}`)
console.log(`minimax path ${minimaxD.length} chars, subpaths ${(minimaxD.match(/[Mm]/g) ?? []).length}`)
