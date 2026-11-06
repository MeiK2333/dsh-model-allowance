# dsh-model-allowance

在 DSH（DeepSeek Harness）Web 界面的输入框工具行，显示**当前会话所用模型**的厂商余额或剩余额度。

```
输入框:  [权限] [计划]   ……   [◉ 剩余 0%] [模型 ▾] [发送]
```

DSH 自带的账户页只显示 DeepSeek 官方账号余额。会话切到第三方 provider（MiniMax、智谱等）时，界面上没有任何地方能看到正在消耗的额度。这个插件补上这一块：读取会话当前的 provider，再向该 provider 查询余额/额度。

## 显示

**徽章**只显示最紧的那个窗口 —— 额度型看剩余百分比最低的窗口，金额型看当前余额。一个数字表达不了「5 小时窗已用尽、周窗还剩一半」，所以完整信息放在详情里。

**详情卡片**：点徽章展开，点卡片以外的任何位置或按 `Esc` 收起。

- 顶部一排厂商图标，点一下可以临时查看另一家；模型一变，自动回到当前模型所属的厂商
- 额度型：每个窗口一块 —— 标题、`已用 / 总额`、百分比、进度条（`<60%` 绿、`60–85%` 黄、`≥85%` 红）、`dd.HH:MM:SS 后重置` 倒计时与重置时刻
- 金额型：一行余额，如 `¥46.71`
- 页脚：读数时间、刷新按钮、打开厂商控制台的按钮

重置时间由 provider 提供；没给的窗口（例如还没开始使用）不渲染那一行，而不是印一句「无重置时间」占位置。

**变化提示**：只要读数变了，徽章就在数字旁短暂显示这次变化，10 秒后自动恢复。差值永远是「上一次读数 → 这一次读数」，与它由哪个时机拉起无关 —— 一轮对话结束、手动刷新、定时轮询都一样。

```
¥99.10 ↓0.90      余额少了 0.9 元
¥349.10 ↑10.07    充值到账，涨了 10.07
剩余 82% ↓1%      额度掉了 1 个百分点
剩余 100% ↑18%    5 小时窗口重置了
```

箭头描述**被展示的那个值**的移动方向，所以向下永远是消耗、向上永远是充值或重置。取整后为 0 就不显示。

只列出**本机确实有凭证**的厂商，没配 Key 的不会出现。未注册的 provider 路由显示「无余额接口」，不报错。

## 支持的路由

| Provider 路由 | 数据来源 | 量纲 | 凭证 |
|---|---|---|---|
| `deepseek-account` | DSH 账号服务 | 金额（CNY/USD） | DSH 登录 |
| `deepseek` | `GET https://api.deepseek.com/user/balance` | 金额（CNY） | `DEEPSEEK_API_KEY` |
| `minimax-cn` | `GET https://api.minimaxi.com/v1/token_plan/remains` | 5 小时 + 每周额度 | `MINIMAX_CN_API_KEY` |
| `zai` / `zai-coding-cn` | `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit` | 5 小时 + 每周配额 | `ZAI_API_KEY` |

凭证**不需要新增配置**：插件复用各 provider 已声明的 `apiKeyEnv`，Key 只在宿主进程内使用，不会到达浏览器。

> 量纲很重要。MiniMax 的 coding-plan Key 返回的是**订阅剩余额度**（百分比），不是充值余额；智谱只返回配额。所以卡片用「金额」和「额度」两种形态呈现，文案也不同。

## 安装

```powershell
git clone https://github.com/MeiK2333/dsh-model-allowance.git
```

然后用 Plugin Manager 安装**本地目录**，`target` 填克隆出来的绝对路径。安装后**刷新页面**；Host 侧的改动需要重启 DSH 才会加载新的模块代。

如果访问各厂商接口需要代理，在 `$DSH_HOME/.env` 里配置后重启 DSH（回环地址永远直连）：

```
https_proxy=http://127.0.0.1:7890
http_proxy=http://127.0.0.1:7890
```

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `ttlMs` | `300000`（5 分钟） | 一次读数的缓存寿命，也是轮询周期 |
| `requestTimeoutMs` | `15000` | 单次 provider 请求超时 |
| `debug` | `false` | 调试模式，见下 |

在 `cordis.patch.yml` 里覆盖：

```yaml
- id: model-allowance
  name: 'dsh-model-allowance'
  config:
    ttlMs: 120000
```

### 刷新时机

| 触发 | 行为 |
|---|---|
| 切换模型 | 立刻读取新 provider 的读数；新路由没有上次读数可比，不显示变化 |
| 每轮对话结束 | 刷新活跃路由 |
| 定时轮询 | 每 `ttlMs` 一次 |
| 手动 | 卡片右下角的刷新按钮，绕过缓存 |

### 排错

把 `debug` 设为 `true`，插件会在激活时试读每条路由，并把结果追加到 `$DSH_HOME/model-allowance-debug.log`：

```yaml
- id: model-allowance
  name: 'dsh-model-allowance'
  config:
    debug: true
```

失败读数也会记录在案。调试结束后把 `debug` 去掉或设为 `false`，不再写文件。

## 要求

```json
"engines": { "dsh": ">=0.2.1-rc.5 <0.3.0" }
```

已实测 DSH `0.2.1-rc.5` / `0.2.2-rc.1`。

## 已知限制

- 智谱的 `unit` 字段含义未公开，按「额度单位」原样渲染。
- 同一 provider 的查询没有跨进程共享缓存；多开 DSH 会各查各的。
- `minimax`（国际站）路由未实现。
- 变化是按「上一次读数 → 这一次读数」的跨度算的，不是按某次对话精确切分：同一把 Key 在别的工具里也在用时，那段消耗会算进这次变化；两次读数之间的空档里发生的消耗也一样。

## 许可

[MIT](LICENSE)。三家厂商图标为其所有者的商标，仅用于标识对应的 provider。
