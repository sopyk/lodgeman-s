# 测试报告 — proxy.js

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
