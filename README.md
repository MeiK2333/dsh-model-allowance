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
  balance (e.g. `¥46.71`) for DeepSeek, remaining percent or time for coding plans
- Refreshes automatically after every turn, briefly showing the change
  (e.g. `↓0.90`)
- Click the badge for details: per-window progress bars, reset countdowns,
  manual refresh, and a link to the provider's console
- Switch between the providers configured on this machine; ones without a
  credential stay out of the way
- Credentials never leave the host process — the web UI only ever sees readings

## Supported providers

| Provider              | Shows                          | Credential            |
| --------------------- | ------------------------------ | --------------------- |
| DeepSeek account      | Balance                        | none (DSH login)      |
| DeepSeek API key      | Balance                        | `DEEPSEEK_API_KEY`    |
| MiniMax coding plan   | 5-hour + weekly allowance      | `MINIMAX_CN_API_KEY`  |
| Zhipu coding plan     | 5-hour + weekly quota          | `ZAI_API_KEY`         |

The plugin reuses the credentials DSH already has: if these keys are
configured, it works out of the box.

## Installation

Install from this repository via DSH's plugin manager, with the target:

```
git+https://github.com/MeiK2333/dsh-model-allowance.git
```

Refresh the page after installing.

## Compatibility

DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`.

## License

[MIT](LICENSE). Provider icons are trademarks of their respective owners,
used only to identify them.
