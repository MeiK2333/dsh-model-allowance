# @local/dsh-model-balance

在 DSH Web 界面的输入框工具行显示**当前会话所用模型的厂商余额或剩余额度**。

```
输入框:  [权限] [计划]   ……   [◉ 剩余 0%] [模型 ▾] [发送]
```

点击徽章展开详情，然后点卡片以外的任何位置或按 `Esc` 收起。

卡片默认显示**当前模型所用厂商**，顶部是一行厂商图标，属于同一行、不换行：

```
[ D ][ M ][ Z ]                    ← 图标，激活项带描边
──────────────────────────────────
5 小时额度                0 / 2,000
0% 已使用
[░░░░░░░░░░░░░░░░░░]              ← 空条，绿色

每周额度           10,071 / 10,000
100% 已使用
[██████████████████]              ← 满条，红色
04.02:59:59 后重置        2026-11-10 16:52:01
──────────────────────────────────
[刷新]  [打开厂商控制台]
```

图标是**原创字母标记**，不是厂商 logo（避免商标与授权问题）：字母取自厂商名，
配色区分品牌，**实心 = 已登录账号、描边 = 你持有的 Key**——所以两条 DeepSeek 路由
（账号 / API Key）既看得出是同一家，也分得清是哪一条。完整名称在 `title` 与
`aria-label` 里，悬停可见。

图标放不下时**不换行、不裁切**：实时测量这一行的宽度，放不下的移到右侧 `⋯`
按钮后的下拉菜单里；当前正在查看的厂商**永远保留在行内**，不会被挤进菜单。

注意 5 小时额度那块**没有重置那一行**——该窗口尚未开始使用，Provider 不返回重置时间，
于是整行不渲染，而不是印一句「无重置时间」占位置。

只列出**本机确实有凭证**的厂商（没配 Key 的不会出现，避免点了必然失败）。
只有一家时退化为一行「厂商 + 名字」，不显示切换器。切换是临时的：模型一变，
卡片自动回到当前模型所属的厂商。

订阅制（GLM / MiniMax）每个窗口一块，文字尽量少，主要靠进度条：

- 标题是「窗口长度 + 额度」，右上角是有可数单位时的 `已用 / 总额`
- 一行「N% 已使用」
- 进度条按**已用比例**填充，颜色随用量升级：
  `<60%` 绿、`60–85%` 黄、`≥85%` 红（都用主题 token，明暗自动跟随）
- 底部一行：**左边**是 `dd.HH:MM:SS 后重置` 的秒级倒计时，**右边**是目标重置时间
  （`YYYY-mm-dd HH:MM:SS`）。不足一天时倒计时省略 `dd.` 前缀，写成 `HH:MM:SS`。
  **Provider 没给重置时间时整行不渲染**（例如窗口还没开始使用）

倒计时只在卡片打开时每秒走一次，收起即停。

余额型（DeepSeek）则是一行金额：

```
厂商      deepseek-account
余额      ¥46.71
更新时间  13:28
```

徽章本身只显示**最紧的那个窗口**——即剩余百分比最低的那个。卡片里才展开全部窗口，
因为一个数字表达不了「五小时窗已用尽、周窗还剩一半」。

---

## 为什么需要它

DSH 内置的「账户」设置页只显示 **DeepSeek 官方账号**余额。当会话切到第三方 provider
（MiniMax、智谱等）时，界面没有任何地方能看到当前正在消耗的额度。

这个插件补上这一块：**读取会话当前的 provider，再向该 provider 查询余额/额度**。

---

## 支持的路由

| Provider 路由 | 数据来源 | 量纲 | 凭证 |
|---|---|---|---|
| `deepseek-account` | Host 内置 `ctx.deepseekAccount.getBalance()` | 金额（CNY/USD） | DSH 账号 |
| `deepseek` | `GET https://api.deepseek.com/user/balance` | 金额（CNY） | `DEEPSEEK_API_KEY` |
| `minimax-cn` | `GET https://api.minimaxi.com/v1/token_plan/remains` | 双窗口额度 | `MINIMAX_CN_API_KEY` |
| `zai` / `zai-coding-cn` | `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit` | 双窗口配额 | `ZAI_API_KEY` |

凭证**不新增配置**：插件复用 `dsh-llm-pi-ai` 已声明的 `apiKeyEnv` 引用，
通过 `ctx.credentials.resolve()` 解析同一把 Key。

> **量纲很重要。** MiniMax 的 coding-plan Key 返回的是**订阅剩余额度**（时间/百分比），
> 不是充值余额；智谱只返回配额。所以 UI 用 `kind` 区分「金额」和「额度」，
> 文案也不同。用 `GET` + `Bearer` 才是订阅额度的正确调用方式
> （第三方常见的 `POST {key}` 形式对本类 Key 返回 404）。

### 两个窗口的真实形状

两家都按两个窗口计量，**都是 5 小时 + 每周**，但字段含义不同，两边都不是「一个数字」能概括的：

| | 短窗 | 长窗 | 额度字段 | 重置字段 |
|---|---|---|---|---|
| MiniMax | 5 小时 | **7 天** | 仅百分比（`*_remaining_percent`） | `end_time` / `weekly_end_time` |
| 智谱 | 5 小时（`unit:3,number:5`） | **1 周**（`unit:6,number:1`） | `usage`=总量、`currentValue`=已用 | `nextResetTime` |

三个容易踩错的点：

- **智谱的 `unit:6` 是「周」，不是「月」。** 按日历月渲染会把一个 4 天后就重置的窗口
  说成月窗；`nextResetTime` 与周窗吻合，不是月结日。
- **智谱的 `number` 是窗口长度，不是额度。** 额度是 `usage`，已用是 `currentValue`；
  把 `number` 当额度会把 5 小时看成「额度 5」。
- **MiniMax 的 `*_count` 字段对 coding-plan Key 恒为 0**，只有百分比是真的。
  所以适配器不编造总量，UI 退化为「已用 18%」而不是「已用 0 / 0」。

MiniMax 的长窗按实测时长报成 `7 天`，智谱报成 `1 周`——两者是同一节奏，
客户端把这两种形状统一渲染为「每周额度」。

### 控制台链接

「打开厂商控制台」指向各家的**用量/额度**页，不是 API Key 页——卡片展示的是额度，
链过去应该看到同一组数字。链接集中定义在 `lib/providers.js` 的 `CONSOLE` 常量里：

| Provider | 链接 |
|---|---|
| DeepSeek | `https://platform.deepseek.com/top_up` |
| MiniMax | `https://platform.minimax.cn/console/usage` |
| 智谱 | `https://bigmodel.cn/coding-plan/personal/overview` |

这些路径会变。已知的一次：智谱 2026-10-16 把标准 API Key 与套餐 Key 拆开管理，
`open.bigmodel.cn/usercenter/apikeys` 已作废（标准 Key 迁到
`bigmodel.cn/usercenter/proj-mgmt/apikeys`，套餐用量在 coding-plan 页面下）；
MiniMax 的 `platform.minimaxi.com` 会 302 到 `platform.minimax.cn`。

HTTP 状态码对这类 SPA 没有意义（任意路径都返回 200），所以链接正确性只能靠官方文档
确认。测试里有一条断言禁止退回上述已废弃路径。

未注册的 provider 路由显示「无余额接口」，不报错。

---

## 刷新策略

| 触发 | 实现位置 |
|---|---|
| 切换模型 | 客户端订阅 `modelSelection` 投影，`provider` 变化即重开订阅 |
| 每轮对话结束 | Host 监听 `session/event` 的 `turn/end`，刷新活跃路由 |
| 5 分钟轮询 | Host `ctx.timer.interval`，周期 = 缓存的 TTL |
| 手动 | 详情浮层的「刷新」按钮，绕过缓存 |

Host 是唯一持有 Key 的地方：微浏览器的数据里没有凭证，只有读数。
轮询和轮询频率都在 Host，与开着的会话数解耦。

---

## 设计要点

**模型身份不自己判断。** 会话当前模型来自 DSH 已有的 `modelSelection` session
projection（源自日志的 `request/header` 事件），客户端用标准 slot prop
`useProjection('modelSelection')` 订阅，不解析日志、不 import DSH 内部包。

**插槽选 `conversation.input.right`。** 它是增量 `list` 插槽（`replaceRisk: none`），
在同一组里**紧接在模型选择器之前**渲染，所以徽章正好落在模型名左边：

```
左侧组:  [权限] [计划]
右侧组:  [余额徽章] [模型▾] [activity]
```

早先放在 `conversation.input.left`（左侧组末尾），但那里在权限、计划控件之后，
离模型名隔了两个控件，看不出关联。`conversation.input.model.label` 虽然直接嵌在
模型按钮内部，但它是 `single` 且已被内置占用（`shadows-shipped-ui`），注册会顶掉
内置模型名渲染。

详情浮层锚定徽章自身的**右边缘**（`right: 0`）向左展开——徽章靠近 composer 右边，
若锚定左边缘会溢出屏幕。

**代理不需要写代码。** DSH 启动时就装好了进程级代理 dispatcher，普通 `fetch()`
自动走 `http_proxy` / `https_proxy` / `all_proxy`。想走本地 clash 代理，
在 `$DSH_HOME/.env` 里写：

```
https_proxy=http://127.0.0.1:7890
http_proxy=http://127.0.0.1:7890
```

然后重启 DSH。回环地址永远直连。

---

## 结构

```
index.js              Host 插件：注册 modelBalance 服务、刷新触发
lib/providers.js      各 provider 的余额适配器注册表
lib/balance.js        凭证解析、抓取、缓存、TTL、并发去重、订阅
lib/remote.js         Remote 控制器（balance 命名空间）
client.js             浏览器半：徽章、详情浮层、Remote 描述符
locale/*.json         Plugin Manager 标题/描述
icon.svg              图标
```

### 一个实现细节

Host 的 `@Remote` 标记通过 `markRemote()` 在构造期写入原型——这是 `@Remote`
装饰器在纯 JavaScript 下的等价写法，绕开了装饰器语法。Host 的 Gateway 会用
「源码模式」从这些标记推导端点契约。

浏览器半需要一份匹配的描述符才能挂载命名空间，所以 `client.js` 手写了与
构建管线生成物同形的 `strict` codec 描述符。参数名必须与 Host 方法签名一致
（`balance(provider)`、`refresh(provider)`、`watch(provider, signal)`）。

---

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `ttlMs` | `300000`（5 分钟） | 一次读数的缓存寿命，也是轮询周期 |
| `requestTimeoutMs` | `15000` | 单次 provider 请求超时 |

在 `cordis.patch.yml` 里覆盖：

```yaml
- id: model-balance
  name: '@local/dsh-model-balance'
  config:
    ttlMs: 120000
```

---

## 安装

```powershell
# 通过 Plugin Manager 安装本地目录
# target: <本仓库绝对路径>
```

安装后需要**刷新页面**（Host 改动需要重启 DSH）才能加载新的模块代。

### 与 DSH 版本的兼容声明

```json
"engines": { "dsh": ">=0.2.1-rc.5 <0.3.0" }
```

只有这一处版本声明。**不要改回 `peerDependencies` 钉版本**：DSH 的兼容门
（`dsh-app-boot` 的 `evaluatePluginCompatibility`）规则是——

1. 存在 `engines.dsh` 时它**独占判定**，`peerDependencies` 完全被忽略；
2. 否则只检查名字以 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-` 开头的 peer，
   `cordis` / `schemastery` 这类**从来不参与判定**；
3. 比较用 `semver.satisfies(..., { includePrerelease: true })`，所以预发布区间可用。

早先写成 `"@deepseek-ai/dsh-typert-protocol": "0.2.1-rc.5"` 精确钉版，
DSH 升到 0.2.2-rc.1 后插件立刻被判不兼容并被禁用。用次版本区间后，
0.2.x 内的任何 rc 都能继续用，0.3.0 仍会被正确拦下。

已实测通过的组合：**DSH 0.2.1-rc.5 / 0.2.2-rc.1**（cordis 4.0.5 → 4.1.0、
schemastery 3.18.5 → 3.19.0、typert-protocol 0.2.1-rc.5 → 0.2.2-rc.1）。

---

## 验证

```powershell
# 客户端：沙箱加载 bundle、跑 apply、渲染金额与额度两条路径
node tools/verify-client.mjs

# Host：用真实记录的响应形状跑全部适配器
node tools/verify-providers.mjs

# Remote 控制器：@Remote 标记、流契约、刷新、服务方法
node tools/verify-remote.mjs

# 余额服务：用「拒绝未声明属性」的代理上下文模拟 Cordis，跑完整读取路径
node tools/verify-service.mjs
```

`verify-remote.mjs` 需要 `@deepseek-ai/cordis`、`schemastery`、`dsh-typert-protocol`
可被解析。插件在 DSH 里运行时这些由宿主提供；在仓库里独立跑测试时，
先把它们放进 `node_modules/@deepseek-ai/`（`node_modules/` 已被 gitignore）：

```powershell
# 从安装的 DSH 里取（路径见运行时 checkout）
node tools/asar-extract.cjs <app.asar> .deps `
  "/dsh/node_modules/@deepseek-ai/dsh-typert-protocol/" `
  "/dsh/node_modules/@deepseek-ai/cordis/" `
  "/dsh/node_modules/@deepseek-ai/cosmokit/" `
  "/dsh/node_modules/@deepseek-ai/schemastery/"
Copy-Item .deps/dsh/node_modules/@deepseek-ai node_modules -Recurse
```

三个脚本都用录制/桩数据离线运行，不触网。

### 排错

打开 `debug` 后，插件会在激活时把每条路由试读一次，并把结果追加到
`$DSH_HOME/model-balance-debug.log`：

```yaml
- id: model-balance
  name: '@local/dsh-model-balance'
  config:
    debug: true
```

```
=== probe: 4 adapters ===
deepseekAccount present: true
adapter=deepseek-account route=deepseek-account status=ready kind=amount amount=45.26 error=-
adapter=minimax-token-plan route=minimax-cn status=ready kind=quota percent=0 error=-
=== probe done ===
```

失败读数也会记录在案（`read route=... status=failed error=...`）。
调试结束后把 `debug` 去掉或设为 `false`，不再写文件。

---

## 已知限制

- 智谱的 `unit` 字段含义未公开，按「额度单位」原样渲染。
- 同一 provider 会重新查询的地方没有做跨进程共享缓存；多开 DSH 会各查各的。
- `minimax`（国际站）路由未实现：本地该 Key 与 CN 区是同一把，国际站返回
  `invalid api key`。需要时可照 `minimax-cn` 的适配器加一条。
