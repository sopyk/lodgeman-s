> [English Changelog](CHANGELOG_EN.md)

# 更新日志

## 1.0.7 (2026-07-22)

### 修复

- **代理响应头泄漏 Keep-Alive 误导 Cloudflare edge 切断 SSE 长连接**
  - 用户体验：手机上通过主域名访问时，页面每隔约 5 分钟突然全白后刷新，
    对话位置有时回退到最新消息。电脑上如果用直连路径则完全正常。
  - 根因：Node.js http.Server 默认给每个 HTTP 响应附加 `Connection: keep-alive` +
    `Keep-Alive: timeout=5`。门房直连 cloudflared，不似 Caddy 会剥离这两个头，
    Cloudflare edge 收到后对 SSE 长连接错误应用连接级超时，约 5 分钟时取消流。
  - 修复：从转发响应头中剔除 `connection` 和 `keep-alive`（大小写不敏感），
    并设 `res.shouldKeepAlive = false` 阻止 Node.js 重新注入。WebSocket 101 响应同步清洗。

### 改进

- **门房主动注入 SSE 心跳，防止网络层空闲超时切断流**
  - 用户体验：移除 `Keep-Alive` 头后问题依旧——手机端仍然每隔约 5 分钟全白刷新一次。
  - 原因：Cloudflare edge 有独立于 HTTP 头的空闲超时管理，仅修响应头不够。
  - 方案：使用 Transform 流在门房层面注入 `:keepalive\n\n` 注释行。每 10 秒检查上游数据
    活跃度，上游 20 秒无数据时由门房自行续命。前端 EventSource 忽略 `:` 开头行，完全无感。

## 1.0.6 (2026-07-21)

### 修复

- **代理超时切断 SSE 长连接**：门房 `proxy.js` 的 10 秒空闲超时（`TIMEOUT = 10000`）在超时后调用 `proxyReq.destroy()` 切断连接。当后端为 SSE (Server-Sent Events) 长连接时，Cloudflare Tunnel 的 HTTP/2 流控（flow control）可能使门房到后端的 socket 短暂空闲，触发超时 destroy，导致 SSE 断连。前端 60s 心跳看门狗发现无事件后触发重连，应用重新初始化，用户看到"页面全白再刷新"，对话位置回退到最新消息。
  - 修复方案：`proxy.js:28-30` 将 `timeout` 事件处理器从 `proxyReq.destroy()` 改为仅 `console.warn` 日志记录，不销毁连接。正常 HTTP 请求响应快不会触发 timeout；SSE 连接即使短暂空闲也只是等待流控恢复，连接本身未死。去掉 destroy 后连接会自然存活，下一个心跳到达后重置 socket 定时器。

### 改进

- **Docker 镜像精简**：移除容器内不需要的 `scripts/` 目录（开发工具）和重复的 `COPY package.json`，镜像更小更干净
- **配置模板规范化**：`config/routes.yaml` 改为公共模板文件随库发布，私人配置更名为 `config/routes.prod.yaml` 并排除在版本控制外，克隆即可使用

## 1.0.5 (2026-07-16)

> **说明**：本节汇总从 1.0.3 到 1.0.5 的全部变更（含 1.0.4 本应包含的改进）。中间的 1.0.4 版本因引入过多错误已作废，详见下方说明。

### 修复

- **注册和修改密码功能不可用**：修复 `admin.js` 中表单字段名与后端 `params.get()` 不一致的 Bug，管理员首次注册和设置页修改访问密码恢复正常
- **设置页访问密码表单误填充**：「修改访问密码」的确认框改为 `type=text` + pwd-mask + 非标准字段名，彻底断开浏览器对管理员凭据的跨表单自动填充
- **密码显示优化**：登录页密码框改用 `type=text` + CSS `-webkit-text-security:disc` 组合方案，自动填充时不再显示小蓝点（密码查看按钮同时生效）；管理端设置页表单提交前自动将密码框转为明文，避免浏览器保存明文密码历史
- **错误消息编码加固**：错误/成功消息改用短 Key 编码后解码渲染，避免中文直接出现在 URL 参数中可能导致的编码问题

### 改进

- **密码切换按钮**：所有密码切换按钮增加 `tabindex="-1"`，防止 Tab 导航焦点停留在显示/隐藏按钮上
- **`attack.sh` 测试脚本**：容器名必须包含 `-dev` 后缀才允许执行，防止误伤生产环境；改用 `docker cp` 替代 `docker exec` 写入配置
- **代理测试**：修复 `proxy.test.js` 中因 mock 对象缺少方法导致的测试失败

---

## ⚠️ 1.0.4 已作废

**v1.0.4 因意外引入造成崩溃性错误，已作废。** 对于受此版本影响的朋友，我们深表歉意。该版本不再提供下载与使用，其变更已合并、修正后体现在 1.0.5 中。请所有用户直接升级到 1.0.5。

---

## 1.0.3 (2026-07-15)

### 安全修复

- **路径穿越**：`/assets/` 路径规范化白名单检查，越权访问返回 403
- **CSRF**：`deleteRoute`/`clearSessions`/`reloadConfig`/`kickSession` 限制仅 POST 方法
- **Body 大小限制**：登录和管理端请求 body 上限 1MB，超限返回 413
- **Host 请求头泄漏**：转发前清理 `host`/`connection` 请求头，防止 Host Header Injection
- **审计日志注入**：写入日志前转义 Label 中的 `\n`/`\r`
- **密码变更失效会话**：修改管理员密码后清除所有已有管理端会话，防止旧 cookie 仍可访问

### 修复

- **Session 持久化**：新增 `src/session.js`，session 写入 `data/sessions.json`，容器重启后自动恢复
- **uncaughtException**：改为 `process.exit(1)`，避免半死不活状态；新增 `unhandledRejection` 日志
- **审计日志写入回调**：失败时 `console.error` 输出错误，不再静默丢失
- **WebSocket 响应头**：升级时全量转发后端响应头，不止保留 set-cookie
- **adminSessions 内存泄漏**：每小时定时清理过期管理端 session
- **配置加载降级**：失败时 `throw` 而非返回默认值，确保管理员感知错误
- **Duration 参数校验**：非法值回退到默认 1 小时
- **代理超时**：后端代理连接设 10 秒超时，超时返回 502
- **SID 前缀匹配**：`kickSession`/`updateSessionLabel` 中 `sid` 匹配改用显式 `endsWith('...')` 判断

### 改进

- **Docker 开发体验**：`compose.yaml` 增加 `src/` bind mount，修改代码无需重建镜像
- **代码一致性**：`admin.js` 移除多余的内联 `require`，统一使用顶部导入的模块变量

## 1.0.2 (2026-07-14)

### 修复

- **Asset 响应导致崩溃**：`/assets/` 静态文件发送响应后缺少 `return`，执行继续落到 auth 重定向逻辑，二次写 headers 触发 `ERR_HTTP_HEADERS_SENT`，服务 crash 重启
- **默认时区**：时区默认值改为 `Asia/Shanghai`，无需手动配置即可正确显示会话时间

### 改进

- **可配置时区**：管理面板「设置」页面新增时区选择，影响会话时间戳、审计日志等时间显示

## 1.0.1 (2026-07-12)

### 修复

- **Assets 拦截导致白屏**：`/assets/` 静态文件处理器找不到本地文件时不再直接 404，而是 fallthrough 到路由代理，修复 OpenCode SPA 的 JS/CSS 资源被错误拦截的问题
- **Cookie 误删**：代理不再删除全部 Cookie，只过滤 `auth_session` 项，保留业务 Cookie（如 API token），避免后端认证异常

### 改进

- **友好 404 页面**：未配置域名不再返回裸文本 `Not Found`，改为带样式的提示页「该域名未在门房大爷中配置，请联系管理员添加路由」，附带管理面板入口
- **密码显示切换**：所有密码输入框（登录页、管理员注册/登录、设置页面）增加「显示/隐藏」按钮，方便校对输入

## 1.0.0 (2026-07-12)

门房大爷 LodgeManS 正式发布。统一认证网关，一个登录入口保护多个后端服务。

### 功能

- **Host 路由**：根据域名分发到不同后端
- **Cookie 认证**：一次登录，所有受保护服务通用
- **认证开关**：每条路由独立控制是否启用统一认证
- **路径豁免**：部分路径跳过鉴权（`/api/*`、`/health`），让后端自管
- **WebSocket**：完整 WebSocket 代理支持
- **管理面板**（`/_admin`）：
  - 路由管理：查看、添加、编辑、删除
  - 会话管理：在线用户（IP、设备、备注、时长），踢人，清空
  - 设置：修改访问密码和管理员账号
  - 配置导入导出（YAML 合并导入）
  - 配置重载，无需重启进程
- **首次注册**：初次访问管理面板时提供注册表单设置管理员账号
- **审计日志**：记录登录、登出、路由变更等事件
- **会话时长**：支持 15 分钟 ~ 永久
- **会话备注**：登录时可填备注名，方便管理后台识别
- **密码安全**：启动时自动 scrypt 哈希，配置文件不存明文
- **Docker 支持**：提供 Dockerfile 和 Compose 配置

### 变更

- 项目结构整理：清除根目录重复文件和松散资源，统一归入 `docker/`、`assets/` 等目录
- 路由目标地址改为 `host.docker.internal`，适配 Docker 桥接模式
- 路由表目标字段简化为 `<scheme> + <address:port>` 组合输入框
- 管理面板/登录页语言统一为中文
- 管理密码最低要求改为 6 位

### 修复

- 修复无管理密码时 `/_admin/login` 返回 403 的问题，改为展示注册表单

### 文档

- 新增英文版 README（`README_EN.md`）
- 补充管理面板使用说明
- 补充路由配置示例注释
