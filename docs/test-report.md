# 测试报告

---

## 更新 2026-08-15 — 补充 config.js 的 pass_host round-trip 测试

**背景**：新增「每路由 pass_host 透传选项」后，`tests/proxy.test.js` 已覆盖转发行为；但 `tests/config.test.js` 缺少 `pass_host` 的配置层用例，本次补齐。

**Node.js**：v22.23.2 · 运行命令：`node --test --test-force-exit tests/*.test.js`

### 期间发现并修复的测试隔离缺陷

首版用例用 `mock.method(fs, ...)` 劫持 `readFileSync`/`writeFileSync` 拦截 `config/routes.yaml`。实测发现 **node:test 默认并发执行 describe 内的 `it`**，两个 saveConfig 用例对全局 fs mock 的「安装/恢复」互相竞争，导致真实 `config/routes.yaml` 被改写为测试夹具内容（对运行配置造成污染）。

修复方案：
- `src/config.js` 支持 `process.env.LODGEMAN_CONFIG` 覆盖配置路径（默认可选）；
- `tests/config.test.js` 顶部把 `LODGEMAN_CONFIG` 指向进程专属临时文件，pass_host describe 改为**直接读写临时文件 + `{ concurrency: false }` 串行**，彻底移除全局 fs mock。

修复后连跑多次，真实 `config/routes.yaml` 均保持干净。

### 新增用例（tests/config.test.js，+1 describe / +6 it）

> `normalizeRoute` 是 `src/config.js` 内部函数，未在 `module.exports` 导出，无法直接 `require` 调用。现有测试风格也只测导出纯函数，因此改为：通过「`saveConfig` → `loadConfig` 闭环」间接覆盖 `normalizeRoute`（`loadConfig` 对每条路由调用它归一化），配置读写全部落在临时文件上，不触碰真实 `config/routes.yaml`。

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | `normalizeRoute 缺省（无 pass_host 键）→ false` | YAML 无 `pass_host` 键 → 归一化后 `false`，且键始终存在 |
| 2 | `normalizeRoute pass_host: true → true` | YAML `pass_host: true` → `true` |
| 3 | `normalizeRoute pass_host: false → false（显式 false）` | 显式 `false` → `false` |
| 4 | `normalizeRoute 字符串 "true" → false` | 仅严格布尔 `true` 生效（`"true" === true` 为 false） |
| 5 | `saveConfig 仅 true 写入 pass_host 键，false/缺省路由不写` | 3 条路由（true/false/缺省）写出 YAML 中 `pass_host` 只出现 1 次，只挂在 true 路由 |
| 6 | `saveConfig → loadConfig round-trip 幂等` | 写出后重读：`pass_host: true` 保持 `true`、`false` 保持 `false` |

### 运行结果（稳定，多次复跑）

| 模式 | tests | suites | pass | fail |
|------|-------|--------|------|------|
| 全量（串行 `--test-concurrency=1`） | **95** | **22** | **95** | **0** |
| 全量（并行，用户原命令） | **95** | **22** | **95** | **0** |

数字对账：其他 5 个测试文件共 58 个用例，config.test.js 共 37 个用例（31 存量 + 6 新增）→ **58+37=95** ✓。修复隔离缺陷后，并行/串行结果一致，不再出现计数波动。

### 测试策略说明（为什么不能直接测 normalizeRoute）

1. `module.exports` 仅导出 `loadConfig / matchRoute / isPathExempt / saveConfig / hashPassword / verifyPassword / isHashed / upgradePlaintextConfig`，没有 `normalizeRoute`；
2. 建议（不属本轮测试范围）：若希望单测 `normalizeRoute` 本身，可在 `src/config.js` 中将其加入 `module.exports`，届时 `config.test.js` 可直接以 `{ host, pass_host }` 为单位断言，无需文件隔离。当前闭环写法已覆盖其全部 `pass_host` 分支。

---

# 历史报告（2026-07-22）— proxy.js

**日期**：2026-07-22  
**Node.js**：v22.23.1  
**运行方式**：`node tests/proxy.test.js`

---

## 测试结果：✅ 7/7 通过

| # | 测试用例 | 状态 | 用时 |
|---|----------|------|------|
| 1 | `proxy.js — proxyRequest › forwards request to backend and returns response` | ✅ | 20ms |
| 2 | `proxy.js — proxyRequest › returns 502 when backend is unreachable` | ✅ | 6ms |
| 3 | `proxy.js — proxyRequest › does not send auth_session cookie` | ✅ | 5ms |
| 4 | `proxy.js — proxyRequest header sanitization › strips Connection and Keep-Alive from backend response and sets shouldKeepAlive=false` | ✅ | 6ms |
| 5 | `proxy.js — proxyRequest header sanitization › preserves business headers when stripping Connection/Keep-Alive` | ✅ | 5ms |
| 6 | `proxy.js — proxyRequest header sanitization › handles case-insensitive header names (CONNECTION in uppercase from backend)` | ✅ | 4ms |
| 7 | `proxy.js — proxyUpgrade › strips Connection and Keep-Alive from 101 Switching Protocols response` | ✅ | 4ms |

---

## 覆盖率 — `src/proxy.js`

| 指标 | 值 |
|------|------|
| 行覆盖率 | **91.30%** |
| 分支覆盖率 | **75.00%** |
| 函数覆盖率 | **60.00%** |

### 未覆盖行及原因

| 行号 | 代码 | 原因 |
|------|------|------|
| 20 | `else delete options.headers['cookie']` | 仅当所有 cookie 均被剥离（空 cookie）时触发 | 
| 43–45 | `console.warn(...)`（超时处理） | SSE 空闲超时，`TIMEOUT=10s`，测试中不等待 |
| 70–73 | `proxyUpgrade` 中 cookie 处理 | 边缘路径，与 upgrade 测试场景无关 |

---

## 测试说明

### 测试策略（改写原因）

原测试使用 `new http.IncomingMessage(null)` + `new http.ServerResponse(req)` + mock `writeHead` 模拟请求/响应。Node.js v22 中：

- `IncomingMessage._destroy` 调用 `eos(this.socket)`，要求 socket 为合法 Stream 对象（原 mock `{ remoteAddress }` 不合法）
- 即使提供合法 socket，`ServerResponse.end()` 因缺少真实 HTTP 连接而挂起，无法触发 `finish` 事件

因此采用 **Real Proxy Server** 策略：每个测试用例启动一个真实的 HTTP 代理服务器，使用 `http.get` / `net.connect` 作为客户端验证响应头和行为。

### 新增测试（3 + 1 个）

#### `proxyRequest` 响应头清洗（3 个）

1. **剔除 Connection 和 Keep-Alive**：后端返回含 `Connection: keep-alive` + `Keep-Alive: timeout=5` 的响应，代理转发后验证 `connection: close`（Node 在 `shouldKeepAlive=false` 时自动设置）且 `keep-alive` 被完全移除
2. **保留业务头**：同时验证 `content-type`, `cache-control`, `x-custom` 等业务头正常转发
3. **大小写不敏感**：使用原始 TCP Server 发送大写 `CONNECTION: keep-alive`，验证代理仍能正确剔除

#### `proxyUpgrade` WebSocket 101 清洗（1 个）

4. 启动原始 TCP Server 模拟 WebSocket 后端（返回 `101 Switching Protocols`），代理转发后验证响应中不含 `connection` 和 `keep-alive` 头
