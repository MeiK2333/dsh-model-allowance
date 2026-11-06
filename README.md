# dsh-model-allowance

[中文](README.zh.md)

Shows the balance or remaining allowance of the provider behind the current
conversation model, right beside the composer in DeepSeek Harness.

## Why

DSH's account page only shows your official DeepSeek account balance. Switch a
session to a third-party provider such as MiniMax or Zhipu, and nothing on
screen tells you how much allowance is left. This plugin fills that gap with a
badge that follows the session's model and reads that provider's balance or
plan allowance.

## Features

- A badge beside the model selector follows the session's model: a money
  balance (e.g. `¥46.71`) for DeepSeek, remaining percent or time for coding plans.
  A plan with several windows speaks through the shortest one (the 5-hour
  window on coding plans), and shows `0%` as soon as any window runs out.
  MiniMax reports one bucket per model; the session's model picks the bucket,
  with the canonical `general` plan as the fallback
- Refreshes automatically after every turn, briefly showing the change
  (e.g. `↓0.90`)
- Click the badge for details: per-window progress bars, reset countdowns,
  manual refresh, and a link to the provider's console
- Switch between the providers configured on this machine; ones without a
  credential stay out of the way
- Shows the provider's own platform status, read from its official status
  page, so a bad reading can be told apart from a bad day: the dot on the
  badge is green while the service is available, red when its status page
  says otherwise, and grey when no status source exists for the route
- Vendors that price by the wall clock get a schedule block: DeepSeek's peak
  windows (weekdays 09:00–12:00 and 14:00–18:00 Beijing time, holidays
  excluded) and Zhipu's (weekdays 14:00–18:00), the phase the clock is in
  now, and a live countdown to the flip
- Credentials never leave the host process — the web UI only ever sees readings

## Supported providers

| Provider              | Shows                          | Credential                  |
| --------------------- | ------------------------------ | --------------------------- |
| DeepSeek account      | Balance                        | none (DSH login)            |
| DeepSeek API key      | Balance                        | `DEEPSEEK_API_KEY`          |
| MiniMax coding plan   | 5-hour + weekly allowance      | `MINIMAX_CN_API_KEY`        |
| Zhipu coding plan     | 5-hour + weekly quota          | `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` |
| Kimi for Coding       | weekly + 5-hour allowance      | `KIMI_API_KEY`              |
| OpenCode Go           | 5-hour + weekly + monthly      | `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY` |

The plugin reuses the credentials DSH already has: it asks the harness which
credential each provider route uses, so if these keys are configured, it works
out of the box — including routes whose profile names a non-default
`apiKeyEnv`. The names above are the defaults.

Platform status comes from the vendors' own pages where they publish one:
DeepSeek (`status.deepseek.com`), MiniMax (`status.minimaxi.com`),
Moonshot/Kimi (`status.moonshot.cn`), and OpenCode (`status.opencode.ai`).
Zhipu publishes no machine-readable status page, so its card shows no status
row.

## Installation

### Requirements

- DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`.
- Credentials for the providers you want to see, configured in DSH:
  DeepSeek login or `DEEPSEEK_API_KEY`, `MINIMAX_CN_API_KEY`,
  `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY`, `KIMI_API_KEY`, and
  `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY`.

### Install from npm (recommended)

1. Open the **Plugins** page in the DSH sidebar.
2. Choose **Install** and enter:

   ```
   dsh-model-allowance@1.0.0
   ```

   Use the latest published version instead of `1.0.0` when a newer one
   exists.
3. Confirm the installation. If DSH reports **restart required**, restart
   DSH; otherwise refresh the page.

The npm installation is eligible for the Plugin Manager's **Update** action.

### Install from GitHub

A tagged GitHub release is an alternative when npm is unavailable:

```
git+https://github.com/MeiK2333/dsh-model-allowance.git#v1.0.0
```

Git installations are not covered by the Plugin Manager's **Update** action.
Install the new tag after removing the old version.

### Update

- **npm install**: use **Update** on the Plugins page, or install the new
  exact version.
- **GitHub install**: remove the bundle, then install the new tag.

### Uninstall

Open the **Plugins** page, select this bundle, and choose **Remove**. Restart
DSH if the page asks for it.

### Local development

Install the checkout directly:

```
link:F:\DSH\model-balance-plugin
```

After changing Host code, restart DSH; after changing client code, run
`npm run build` and refresh the page.

## Development

```bash
npm ci
npm test          # node:test unit tests plus the integration verifiers
npm run typecheck # tsc --checkJs over the Host half and the Client's pure modules
npm run lint      # Biome
npm run build     # regenerate client.js from src/client
npm run check:dist # fail when client.js is out of date with its source
```

The browser half is authored under `src/client/` and built into `client.js` by
`tools/build-client.mjs`. The built file is committed because DSH installs the
package directly; `check:dist` keeps it honest.

Provider fixtures are part of each adapter, and `npm test` fails when
DeepSeek's statutory-holiday list no longer covers the current year — extend
`SCHEDULE.holidays` in `lib/providers/deepseek.js` when the next notice is
published.

## Compatibility

DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`.

## License

[MIT](LICENSE). Provider icons are trademarks of their respective owners,
used only to identify them.
