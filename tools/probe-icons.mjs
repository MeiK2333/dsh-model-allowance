/**
 * Probe each provider's own sites for published icon and logo assets.
 *
 * Reports what each site actually declares (favicon, apple-touch-icon,
 * og:image, logo files) and then verifies each URL: status, content type,
 * byte size, and for bitmaps their pixel dimensions. Nothing is guessed from
 * the URL alone, since a 404 or an HTML error page would otherwise look like
 * a hit.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require(path.join(here, '..', '.sharp', 'node_modules', 'sharp'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const SITES = [
  ['deepseek platform', 'https://platform.deepseek.com/'],
  ['deepseek www', 'https://www.deepseek.com/'],
  ['deepseek chat', 'https://chat.deepseek.com/'],
  ['minimax cn', 'https://platform.minimax.cn/'],
  ['minimax io', 'https://www.minimax.io/'],
  ['bigmodel', 'https://bigmodel.cn/'],
  ['bigmodel open', 'https://open.bigmodel.cn/'],
  ['bigmodel docs', 'https://docs.bigmodel.cn/'],
]

/** Fetch a URL, following redirects, with a browser UA. */
async function get(url, as = 'text') {
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: as === 'text' ? 'text/html,*/*' : '*/*' },
    redirect: 'follow',
  })
  if (!response.ok) return { ok: false, status: response.status }
  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    ok: true,
    status: response.status,
    url: response.url,
    type: response.headers.get('content-type') ?? '',
    buffer,
  }
}

/** Declared icon and logo references in an HTML document. */
function referencesOf(html, base) {
  const found = new Map()
  const add = (raw, kind) => {
    if (!raw) return
    try {
      const absolute = new URL(raw, base).href
      if (!found.has(absolute)) found.set(absolute, kind)
    } catch {
      /* ignore malformed */
    }
  }
  for (const match of html.matchAll(/<link[^>]+>/gi)) {
    const tag = match[0]
    if (!/rel=["'][^"']*icon/i.test(tag)) continue
    add(/href=["']([^"']+)["']/i.exec(tag)?.[1], 'favicon')
  }
  for (const match of html.matchAll(/<meta[^>]+(?:og:image|twitter:image)[^>]*>/gi)) {
    add(/content=["']([^"']+)["']/i.exec(match[0])?.[1], 'og:image')
  }
  for (const match of html.matchAll(/(?:src|href)=["']([^"']*(?:logo|icon)[^"']*\.(?:svg|png|ico|webp))["']/gi)) {
    add(match[1], 'asset')
  }
  return found
}

/** Describe one asset URL. */
async function describe(url) {
  try {
    const result = await get(url, 'binary')
    if (!result.ok) return `HTTP ${String(result.status)}`
    const buffer = result.buffer
    const head = buffer.subarray(0, 200).toString('utf8').trim()
    if (head.startsWith('<svg') || head.includes('<svg')) {
      const viewBox = /viewBox=["']([^"']+)["']/.exec(buffer.toString('utf8'))?.[1]
      return `svg ${(buffer.length / 1024).toFixed(1)}KB${viewBox ? ` viewBox=${viewBox}` : ''}`
    }
    if (head.startsWith('<!DOCTYPE') || head.startsWith('<html')) return 'HTML (not an image)'
    const meta = await sharp(buffer).metadata()
    return `${String(meta.format)} ${String(meta.width)}x${String(meta.height)} ${(buffer.length / 1024).toFixed(1)}KB${meta.hasAlpha ? ' alpha' : ''}`
  } catch (error) {
    return `error ${error.message.slice(0, 60)}`
  }
}

for (const [label, site] of SITES) {
  console.log(`\n=== ${label} — ${site}`)
  let page
  try {
    page = await get(site)
  } catch (error) {
    console.log(`  site unreachable: ${error.message.slice(0, 60)}`)
    continue
  }
  if (!page.ok) {
    console.log(`  site HTTP ${String(page.status)}`)
    continue
  }
  const refs = referencesOf(page.buffer.toString('utf8'), page.url)
  if (refs.size === 0) console.log('  no icon or logo references found')
  for (const [url, kind] of refs) {
    console.log(`  [${kind}] ${url}`)
    console.log(`        -> ${await describe(url)}`)
  }
}
