import { createElement as h } from 'react'

/**
 * The refresh glyph: an arc with a filled arrowhead, so it reads as
 * "rotate" rather than a hook.
 * @param {number} size Rendered size in pixels.
 * @returns {object} The icon element.
 */
export function refreshGlyph(size) {
  return h(
    'svg',
    { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    h('path', {
      d: 'M12.05 4.36A6 6 0 1 1 7.95 4.36',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
    }),
    h('path', {
      d: 'M15.05 5.45L10.48 6.35L12.12 1.83Z',
      fill: 'currentColor',
      stroke: 'currentColor',
      strokeWidth: 0.6,
      strokeLinejoin: 'round',
    }),
  )
}

/**
 * The console glyph: a window with its title bar.
 *
 * A terminal prompt and a monitor on a stand were drawn alongside this one
 * and compared at true size; the prompt's chevron and cursor merged into a
 * smudge, and the monitor read as a display rather than as the console the
 * button opens.
 *
 * @param {number} size Rendered size in pixels.
 * @returns {object} The icon element.
 */
export function consoleGlyph(size) {
  return h(
    'svg',
    { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    h('rect', {
      x: 3.4,
      y: 4.2,
      width: 13.2,
      height: 11.6,
      rx: 2,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
    h('path', {
      d: 'M3.4 8.1h13.2',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
  )
}

/**
 * The artwork this build can draw, keyed by the hint a route's Host
 * metadata carries.
 *
 * All three are the vendors' own artwork, taken from what each site
 * publishes: DeepSeek serves a standalone square icon SVG, MiniMax and
 * Zhipu serve wordmarks with the mark as the leading path. Neither of the
 * latter ships the mark on its own — their square PNGs are a jellyfish and
 * a letter tile respectively — so the glyph is lifted from the wordmark.
 * All three are trademarks of their owners and identify the provider here.
 *
 * Routes that share a vendor share a hint; the two DeepSeek entries look
 * alike on purpose, and the difference between the signed-in account and a
 * stored key is carried by the name. A hint this build has no artwork for
 * falls back to the route's initial over its brand colour, so adding a
 * vendor never requires touching this file.
 */

/** DeepSeek's own square icon, 50x50, filled #4D6BFE. */
const DEEPSEEK_PATH =
  'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z'

/**
 * MiniMax's waveform, the leading path of its official wordmark, which
 * spans 0..36.91 of the 129-wide lockup. The lettering that follows is
 * dropped.
 */
const MINIMAX_PATH =
  'M17.5802 3.08155C17.5802 2.35036 16.987 1.75702 16.2589 1.75702C15.5309 1.75702 14.9377 2.35171 14.9377 3.08155V25.0348C14.9377 26.7337 13.5586 28.1164 11.8639 28.1164C10.1693 28.1164 8.79008 26.7337 8.79008 25.0348V10.9503C8.79008 10.2191 8.19688 9.62575 7.46886 9.62575C6.74085 9.62575 6.14765 10.2204 6.14765 10.9503V16.9201C6.14765 18.619 4.76846 20.0016 3.07381 20.0016C1.37915 20.0016 0 18.619 0 16.9201V14.7563C0 14.2711 0.392318 13.8778 0.876312 13.8778C1.36031 13.8778 1.75262 14.2711 1.75262 14.7563V16.9201C1.75262 17.6513 2.34579 18.2446 3.07381 18.2446C3.80182 18.2446 4.39502 17.6499 4.39502 16.9201V10.9503C4.39502 9.25138 5.77421 7.86874 7.46886 7.86874C9.16352 7.86874 10.5427 9.25138 10.5427 10.9503V25.0348C10.5427 25.766 11.1359 26.3593 11.8639 26.3593C12.5919 26.3593 13.1851 25.7646 13.1851 25.0348V16.4227V3.08155C13.1851 1.38265 14.5643 0 16.2589 0C17.9536 0 19.3328 1.38265 19.3328 3.08155V21.2599C19.3328 21.7451 18.9405 22.1384 18.4565 22.1384C17.9725 22.1384 17.5802 21.7451 17.5802 21.2599V3.08155ZM33.8405 7.86874C32.1458 7.86874 30.7666 9.25138 30.7666 10.9503V22.7155C30.7666 23.4467 30.1734 24.0401 29.4454 24.0401C28.7174 24.0401 28.1242 23.4454 28.1242 22.7155V3.08155C28.1242 1.38265 26.745 0 25.0504 0C23.3557 0 21.9766 1.38265 21.9766 3.08155V28.0042C21.9766 28.7354 21.3834 29.3287 20.6553 29.3287C19.9273 29.3287 19.3341 28.734 19.3341 28.0042V24.9186C19.3341 24.4334 18.9418 24.0401 18.4578 24.0401C17.9738 24.0401 17.5815 24.4334 17.5815 24.9186V28.0042C17.5815 29.7031 18.9607 31.0857 20.6553 31.0857C22.35 31.0857 23.7292 29.7031 23.7292 28.0042V3.08155C23.7292 2.35036 24.3224 1.75702 25.0504 1.75702C25.7784 1.75702 26.3716 2.35171 26.3716 3.08155V22.7155C26.3716 24.4144 27.7508 25.7971 29.4454 25.7971C31.1401 25.7971 32.5193 24.4144 32.5193 22.7155V10.9503C32.5193 10.2191 33.1125 9.62575 33.8405 9.62575C34.5685 9.62575 35.1617 10.2204 35.1617 10.9503V21.2599C35.1617 21.7451 35.554 22.1384 36.038 22.1384C36.522 22.1384 36.9143 21.7451 36.9143 21.2599V10.9503C36.9143 9.25138 35.5351 7.86874 33.8405 7.86874Z'

/**
 * The waveform's official paint: brand magenta sweeping to orange across
 * the mark. Coordinates stay in the wordmark's own space, which still lines
 * up after the viewBox is cropped because the waveform starts at x=0.
 *
 * The id is fixed. The mark can be on screen twice, in the strip and in the
 * overflow menu, so two definitions may coexist; both are identical, and a
 * `url(#…)` resolves to the first, which paints the same either way.
 */
const MINIMAX_GRADIENT = {
  id: 'dsh-balance-minimax-wave',
  x1: 0,
  y1: 15.5,
  x2: 36.9143,
  y2: 15.5,
  stops: [
    ['#E21680', '0'],
    ['#FF633A', '1'],
  ],
}

/**
 * Zhipu's glyph: the four blocks of the official wordmark, with their
 * gradients flattened to mid tones so the mark can be drawn twice in one
 * document without duplicating gradient ids.
 *
 * The wordmark also draws the star between the blocks as a shape filled
 * #f7f8fa. That is negative space, not part of the mark, and painting it
 * put a near-white star on the panel, which read as the icon having a white
 * background. Leaving it out lets the panel show through instead.
 */
const ZHIPU_PATHS = [
  {
    d: 'M21.0517 11.7895V5.91559C21.0517 5.89816 21.0422 5.88207 21.0268 5.87346L10.5497 0.00632824C10.5422 0.00210946 10.5338 2.92206e-08 10.5254 0V2.45801C10.5254 7.22726 14.5109 11.784 19.4278 11.784C19.3287 11.784 19.2299 11.7858 19.1316 11.7895H21.0517Z',
    fill: '#5b6fe8',
  },
  {
    d: 'M-0.000925064 11.7895V17.8731C-0.000925064 17.8912 0.00857449 17.9079 0.0239525 17.9168L10.5011 23.9934C10.5086 23.9978 10.517 24 10.5254 24V21.4542C10.5254 16.5146 6.53987 11.7952 1.62302 11.7952C1.72212 11.7952 1.82085 11.7933 1.91917 11.7895H-0.000925064Z',
    fill: '#57a4ee',
  },
  {
    d: 'M-0.000925064 11.7895V5.91559C-0.000925064 5.89816 0.00857449 5.88207 0.0239525 5.87346L10.5011 0.00632824C10.5086 0.00210946 10.517 2.92206e-08 10.5254 0V2.45801C10.5254 7.22726 6.53987 11.784 1.62302 11.784C1.72212 11.784 1.82085 11.7858 1.91917 11.7895H-0.000925064Z',
    fill: '#5b6fe8',
  },
  {
    d: 'M21.0517 11.7895V17.8731C21.0517 17.8912 21.0422 17.9079 21.0268 17.9168L10.5497 23.9934C10.5422 23.9978 10.5338 24 10.5254 24V21.4542C10.5254 16.5146 14.5109 11.7952 19.4278 11.7952C19.3287 11.7952 19.2299 11.7933 19.1316 11.7895H21.0517Z',
    fill: '#5a84ee',
  },
]

/**
 * Each mark's viewBox and the ink it draws, in viewBox units.
 *
 * Every viewBox is cropped to its own glyph, so the ink fills it and the
 * two pairs agree. The split is kept because the sizing rule is about ink,
 * not about the file: a mark whose viewBox carried padding would otherwise
 * be drawn smaller than its neighbours for no visible reason. Matching ink
 * height is what gives all three the same top and bottom breathing room.
 */
const ICON_GEOMETRY = {
  // DeepSeek's square icon draws 1..49.35 across and 7..43.35 down.
  deepseek: { x: 1, y: 7, vbW: 48.35, vbH: 36.35, inkW: 48.35, inkH: 36.35 },
  // MiniMax's waveform occupies 0..37.02 by 0..31.10 of the wordmark.
  minimax: { x: 0, y: 0, vbW: 37.023, vbH: 31.097, inkW: 37.023, inkH: 31.097 },
  zhipu: { x: 0, y: 0, vbW: 21.052, vbH: 24, inkW: 21.052, inkH: 24 },
}

/**
 * The mark for one route: its Host-declared artwork hint and brand colour,
 * or the route's initial in grey when this installation named neither.
 * @param {{iconHint?: string, color?: string} | undefined} entry Directory entry.
 * @param {string} route Provider route.
 * @returns {{icon?: string, letter?: string, color: string}} The mark.
 */
export function markOf(entry, route) {
  const color = typeof entry?.color === 'string' && entry.color !== '' ? entry.color : '#6b7280'
  if (typeof entry?.iconHint === 'string' && entry.iconHint !== '') {
    return { icon: entry.iconHint, color }
  }
  return { letter: route.slice(0, 1).toUpperCase(), color }
}

/**
 * The svg for one mark, sized so every mark draws the same ink height.
 *
 * A hint this build has no artwork for draws the route's initial instead:
 * a blank chip would be worse than a letter.
 *
 * @param {string} route Provider route.
 * @param {number} inkHeight Drawn height of the ink, in pixels.
 * @param {{icon?: string, letter?: string, color: string}} mark The mark.
 * @returns {object} The icon element.
 */
export function providerIcon(route, inkHeight, mark) {
  const geo = mark.icon === undefined ? undefined : ICON_GEOMETRY[mark.icon]
  if (mark.letter !== undefined || geo === undefined) {
    return h(
      'span',
      { className: 'dsh-model-allowance-tab-letter' },
      mark.letter ?? route.slice(0, 1).toUpperCase(),
    )
  }
  // Both dimensions must land on whole, even pixels.
  //
  // A fractional box is placed by flooring it against the chip's centre:
  // Zhipu's 12.28px box was laid out at 6 instead of the ideal 6.86, so
  // the mark sat a pixel left of centre while the vertical axis, whose box
  // happened to be exactly 14px, stayed perfect. Rounding to even makes
  // (chip - box) / 2 a whole number for the 26px and 20px chips.
  const even = (value) => Math.max(2, Math.round(value / 2) * 2)
  const boxH = even((inkHeight * geo.vbH) / geo.inkH)
  const boxW = even((inkHeight * geo.vbW) / geo.inkH)
  let content
  if (mark.icon === 'zhipu') {
    content = ZHIPU_PATHS.map((path, index) =>
      h('path', { key: `z-${String(index)}`, d: path.d, fill: path.fill }),
    )
  } else if (mark.icon === 'minimax') {
    // The waveform carries its own brand gradient rather than a flat tint.
    content = [
      h(
        'defs',
        { key: 'defs' },
        h(
          'linearGradient',
          {
            id: MINIMAX_GRADIENT.id,
            x1: MINIMAX_GRADIENT.x1,
            y1: MINIMAX_GRADIENT.y1,
            x2: MINIMAX_GRADIENT.x2,
            y2: MINIMAX_GRADIENT.y2,
            gradientUnits: 'userSpaceOnUse',
          },
          ...MINIMAX_GRADIENT.stops.map(([color, offset]) =>
            h('stop', { key: offset, offset, stopColor: color }),
          ),
        ),
      ),
      h('path', {
        key: 'wave',
        d: MINIMAX_PATH,
        fill: `url(#${MINIMAX_GRADIENT.id})`,
      }),
    ]
  } else {
    content = [h('path', { key: 'mark', d: DEEPSEEK_PATH, fill: 'currentColor' })]
  }
  return h(
    'svg',
    {
      viewBox: `${String(geo.x)} ${String(geo.y)} ${String(geo.vbW)} ${String(geo.vbH)}`,
      width: boxW,
      height: boxH,
      preserveAspectRatio: 'xMidYMid meet',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...content,
  )
}
