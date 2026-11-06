/**
 * Render the allowance card against the harness's own theme tokens, so its
 * colours, radii, and elevation can be reviewed without booting DSH.
 *
 * The tokens are not retyped here: they are read out of the installed theme
 * package, which ships them as JS string literals inside its client bundle.
 * Whole sheets are copied rather than individual declarations, because the
 * aliases are a var() chain — `--dsw-specific-menu` resolves through
 * `--dsw-menu-surface-fill`, and dropping that link renders the card
 * transparent.
 *
 * Usage:
 *   node tools/preview-panel.mjs [--asar <path>]
 * Writes .preview/panel-light.{html,png} and .preview/panel-dark.{html,png}.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..')

/** Locate the packaged harness: an explicit flag, then the environment, then the default install. */
function locateAsar() {
  const flagAt = process.argv.indexOf('--asar')
  if (flagAt >= 0 && process.argv[flagAt + 1] !== undefined) return process.argv[flagAt + 1]
  if (process.env.DSH_APP_ASAR !== undefined) return process.env.DSH_APP_ASAR
  const fallback = 'D:\\DeepSeekHarness\\resources\\app.asar'
  if (fs.existsSync(fallback)) return fallback
  throw new Error('cannot find app.asar; pass --asar <path> or set DSH_APP_ASAR')
}

const THEME_FILE = 'dsh-client-ui-theme/lib/client.js'

/** Extract the theme bundle out of the asar, reusing a previous extraction. */
function themeSource() {
  const outDir = path.join(repo, '.preview', '.theme')
  const extracted = path.join(outDir, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js')
  if (!fs.existsSync(extracted)) {
    fs.mkdirSync(outDir, { recursive: true })
    execFileSync(process.execPath, [path.join(here, 'asar-extract.cjs'), locateAsar(), outDir, THEME_FILE], {
      stdio: 'ignore',
    })
  }
  if (!fs.existsSync(extracted)) throw new Error(`theme bundle not found after extraction: ${extracted}`)
  return fs.readFileSync(extracted, 'utf8')
}

const client = fs.readFileSync(path.join(repo, 'client.js'), 'utf8')
const start = client.indexOf('const STYLES = [')
const open = client.indexOf('[', start)
const close = client.indexOf("].join('')", open)
const STYLES = eval(client.slice(open, close + 1)).join('')

const theme = themeSource()
const literals = [...theme.matchAll(/"((?:[^"\\]|\\.)*--dsw-[^"]*)"/g)].map((match) =>
  match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
)
const platformSheet = literals.find(
  (sheet) => sheet.includes('--dsw-static-neutral-bluish-00') && sheet.includes('--dsw-menu-surface-fill'),
)
const radiusSheet = literals.find((sheet) => sheet.includes('--dsw-radius-xs:'))
if (platformSheet === undefined) throw new Error('could not find the design-platform sheet')
if (radiusSheet === undefined) throw new Error('could not find the radius scale')

// `body{…}` — the light palette. The dark palette is the `body[data-ds-dark-theme]`
// block that follows it, kept for the dark screenshot.
const lightAt = platformSheet.indexOf('body{--dsw-alias-bg-base')
const darkAt = platformSheet.indexOf('body[data-ds-dark-theme]', lightAt)
const lightSheet = platformSheet.slice(lightAt, darkAt)
const darkSheet = platformSheet.slice(darkAt, platformSheet.indexOf('}', platformSheet.indexOf('--dsw-specific-tip', darkAt)) + 1)

const staticSheet = platformSheet.slice(0, lightAt)

/** The elevation scale, which the theme declares outside the palette sheets. */
const ELEVATION = `
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l4);
  --dsw-elevation-stroke: 0 0 0 .5px var(--dsw-elevation-stroke-color);
  --dsw-elevation-prominent: var(--dsw-elevation-stroke), 0 3px 8px 0 #0000000a, 0 0 20px 0 #0000000d;
`

/** Assemble a page's token block for one palette. */
function tokenBlock(palette) {
  return `${staticSheet}\n${palette}\n${radiusSheet}\n${ELEVATION}`
}


const MARK = `<svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4D6BFE" d="M12 2c-3 4-7 6.5-7 11a7 7 0 0014 0c0-4.5-4-7-7-11z"/></svg>`

const panel = `
<div class="dsh-model-allowance-root" data-service="operational" data-loading="false">
  <div class="dsh-model-allowance-panel">
    <div class="dsh-model-allowance-switcher-wrap">
      <div class="dsh-model-allowance-switcher">
        <button class="dsh-model-allowance-tab" data-active="false">${MARK}</button>
        <button class="dsh-model-allowance-tab" data-active="true">${MARK}</button>
        <button class="dsh-model-allowance-tab" data-active="false">${MARK}</button>
        <button class="dsh-model-allowance-more">&#8943;</button>
      </div>
    </div>
    <div class="dsh-model-allowance-window" data-first="true">
      <div class="dsh-model-allowance-window-head">
        <span class="dsh-model-allowance-window-title">5 小时额度</span>
        <span class="dsh-model-allowance-usage">1,240 / 2,000</span>
      </div>
      <div class="dsh-model-allowance-percent">38% 已使用</div>
      <div class="dsh-model-allowance-bar"><div class="dsh-model-allowance-bar-fill" style="width:62%"></div></div>
    </div>
    <div class="dsh-model-allowance-window">
      <div class="dsh-model-allowance-window-head">
        <span class="dsh-model-allowance-window-title">每周额度</span>
        <span class="dsh-model-allowance-usage">10,071 / 12,000</span>
      </div>
      <div class="dsh-model-allowance-percent">16% 已使用</div>
      <div class="dsh-model-allowance-bar"><div class="dsh-model-allowance-bar-fill" style="width:16%"></div></div>
      <div class="dsh-model-allowance-foot"><span>04.02:59:59 后重置</span><span>2026-11-10 20:49:12</span></div>
    </div>
    <div class="dsh-model-allowance-actions">
      <span class="dsh-model-allowance-status-wrap">
        <a class="dsh-model-allowance-status"><span class="dsh-model-allowance-status-dot"></span><span class="dsh-model-allowance-status-label">运行正常</span><span class="dsh-model-allowance-status-arrow">&#8599;</span></a>
      </span>
      <span class="dsh-model-allowance-updated">更新于 17:49:12</span>
      <button class="dsh-model-allowance-icon-button"><svg width="16" height="16" viewBox="0 0 20 20"><path d="M16 10a6 6 0 11-1.8-4.2M16 3v4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      <a class="dsh-model-allowance-icon-button"><svg width="16" height="16" viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 9l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></a>
    </div>
  </div>
  <button class="dsh-model-allowance-badge"><span class="dsh-model-allowance-dot"></span><span class="dsh-model-allowance-label">剩余 62%</span></button>
</div>`

/**
 * One preview page. The card normally positions itself above the badge
 * (`bottom: calc(100% + 6px)`, right-aligned); a screenshot of that would have
 * to reproduce the composer's geometry to keep the card inside the frame. The
 * anchoring is neutralised here so the card renders in normal flow and the whole
 * surface is visible — every colour, radius, shadow, and border still comes from
 * the shipping stylesheet and the harness's own tokens.
 */
function pageFor(palette, dark) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${tokenBlock(palette)}
html,body{margin:0}
body{background:var(--dsw-alias-bg-module-platform);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  color:var(--dsw-alias-label-primary);padding:16px}
${STYLES}
.stage{display:inline-block}
/* Stand the card above its badge, the way it opens in the composer. */
.dsh-model-allowance-root{flex-direction:column;align-items:flex-end;gap:10px}
.dsh-model-allowance-panel{position:static;bottom:auto;right:auto}
</style></head><body${dark ? ' data-ds-dark-theme' : ''}><div class="stage">${panel}</div></body></html>`
}

const previewDir = path.join(here, '..', '.preview')
fs.mkdirSync(previewDir, { recursive: true })

/** The first Chromium-family binary on this host, or undefined to skip the screenshot. */
function locateChrome() {
  if (process.env.CHROME_PATH !== undefined) return process.env.CHROME_PATH
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((candidate) => fs.existsSync(candidate))
}

const chrome = locateChrome()

for (const [name, palette, dark] of [
  ['panel-light', lightSheet, false],
  ['panel-dark', darkSheet, true],
]) {
  const html = path.join(previewDir, `${name}.html`)
  fs.writeFileSync(html, pageFor(palette, dark))
  console.log('wrote', html)

  if (chrome === undefined) continue
  const png = path.join(previewDir, `${name}.png`)
  execFileSync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      '--window-size=400,440',
      `--screenshot=${png}`,
      `file:///${html.replace(/\\/g, '/')}`,
    ],
    { stdio: 'ignore' },
  )
  console.log('wrote', png)
}

if (chrome === undefined) {
  console.log('no Chromium found; open the .html files directly, or set CHROME_PATH')
}

