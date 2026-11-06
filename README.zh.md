# dsh-model-allowance

[English](README.md)

在 DeepSeek Harness 输入框旁，显示当前会话所用模型对应厂商的余额或剩余额度。

## 为什么

DSH 自带的账户页只显示 DeepSeek 官方账号余额。会话切到 MiniMax、智谱等第三方
厂商时，界面上没有任何地方能看到正在消耗的额度。这个插件补上这一块：一个跟随
会话模型的徽标，读取该厂商的余额或套餐剩余额度。

## 功能

- 徽标位于模型选择器旁，跟随当前会话的模型：DeepSeek 显示余额（如 `¥46.71`），
  Coding Plan 显示剩余百分比或剩余时长；多窗口套餐以最短窗口（编程套餐的
  5 小时窗）为准，任一窗口耗尽即显示 `剩余 0%`；MiniMax 按会话模型匹配
  `model_remains` 条目，未匹配时优先 `general` 计划
- 每轮对话结束自动刷新，并短暂显示读数的变化（如 `↓0.90`）
- 点击徽章查看详情：分窗口进度条、重置倒计时、手动刷新、直达厂商控制台
- 可切换查看本机已配置的其他厂商；未配置凭证的厂商不会出现
- 显示厂商官方的平台状态（读取其状态页），把"读数拿不到"和"平台故障"区分开来：
  徽章左侧圆点绿色表示服务可用，红色表示状态页报告异常；无状态源的路由显示灰点
- 按时段定价的厂商（DeepSeek：工作日 9:00–12:00、14:00–18:00 为高峰，法定节假日
  除外；智谱：工作日 14:00–18:00 为高峰）在卡片上显示时段表、当前处于高峰还是
  低谷，以及距离切换的实时倒计时
- 凭证只在本机进程内使用，网页端只看到读数

## 支持的厂商

| 厂商                | 显示内容                   | 凭证                        |
| ------------------- | -------------------------- | --------------------------- |
| DeepSeek 账号       | 余额                       | 无需配置（DSH 登录）        |
| DeepSeek API Key    | 余额                       | `DEEPSEEK_API_KEY`          |
| MiniMax Coding Plan | 5 小时窗 + 每周窗剩余额度  | `MINIMAX_CN_API_KEY`        |
| 智谱 Coding Plan    | 5 小时窗 + 每周窗剩余配额  | `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` |
| Kimi for Coding     | 每周窗 + 5 小时窗剩余额度  | `KIMI_API_KEY`              |
| OpenCode Go         | 5 小时窗 + 每周窗 + 每月窗 | `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY` |

插件复用 DSH 已有的凭证配置：它会向 harness 询问每条厂商路由用的是哪个凭证，
这些 Key 只要配过，装完即用；profile 里自定义了 `apiKeyEnv` 的路由也能覆盖。
上表列出的是默认凭证名。

平台状态取自各厂商自己的状态页：DeepSeek（`status.deepseek.com`）、
MiniMax（`status.minimaxi.com`）、Moonshot/Kimi（`status.moonshot.cn`）、
OpenCode（`status.opencode.ai`）；智谱没有机器可读的状态页，其卡片不显示状态行。

## 安装

### 前置条件

- DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`。
- 需要在 DSH 中配置好要查看的厂商凭证：
  DeepSeek 登录或 `DEEPSEEK_API_KEY`、`MINIMAX_CN_API_KEY`、
  `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY`、`KIMI_API_KEY`、
  `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY`。

### 从 npm 安装（推荐）

1. 打开 DSH 侧边栏的 **Plugins（插件）** 页面。
2. 点击 **Install（安装）**，填入：

   ```
   dsh-model-allowance@1.0.0
   ```

   如果已有更新版本，请把 `1.0.0` 换成最新的精确版本。
3. 确认安装。如果 DSH 提示需要重启，重启 DSH；否则刷新页面即可。

通过 npm 安装的版本可以在 Plugin Manager 中使用 **Update** 更新。

### 从 GitHub 安装

npm 不可用时，可以安装打了 tag 的 GitHub Release：

```
git+https://github.com/MeiK2333/dsh-model-allowance.git#v1.0.0
```

Git 安装不受 Plugin Manager 的 **Update** 管理；更新时需要先移除旧版本，
再安装新的 tag。

### 更新

- **npm 安装**：在 Plugins 页面点击 **Update**，或安装新的精确版本。
- **GitHub 安装**：移除旧 bundle，再安装新的 tag。

### 卸载

打开 **Plugins（插件）** 页面，选中该 bundle，点击 **Remove**。如果提示
需要重启，重启 DSH。

### 本地开发

直接链接本地目录：

```
link:F:\DSH\model-balance-plugin
```

修改 Host 代码后重启 DSH；修改 Client 代码后执行 `npm run build` 并刷新页面。

## 开发

```bash
npm ci
npm test          # node:test 单元测试 + 集成验证脚本
npm run typecheck # 对 Host 半侧和 Client 纯逻辑模块执行 tsc --checkJs
npm run lint      # Biome
npm run build     # 从 src/client 重新生成 client.js
npm run check:dist # client.js 与源码不一致时失败
```

浏览器半侧在 `src/client/` 下编写，由 `tools/build-client.mjs` 构建为
`client.js`。DSH 直接安装该包，所以构建产物需要提交；`check:dist` 保证它
不会悄悄过期。

各厂商的 fixture 随适配器一起维护；当 DeepSeek 的法定节假日列表不再覆盖
当前年份时，`npm test` 会失败——下一份通知发布后更新
`lib/providers/deepseek.js` 的 `SCHEDULE.holidays` 即可。

## 兼容性

DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`。

## 许可

[MIT](LICENSE)。各厂商图标为其所有者的商标，仅用于标识对应厂商。
