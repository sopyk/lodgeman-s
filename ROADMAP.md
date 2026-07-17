# LodgeManS 开发计划 / ROADMAP

> 维护约定：
> - **待办条目**：实现/修复前保留 `- [ ]`，完成后改为 `- [x]` 并补 `实现于` / `修复于` 版本号。
> - **版本号**取自关于页显示值（当前 `v1.0.5`）。
> - **enhancement（功能/改进）**：标注「发现于」版本，完成后补「实现于」版本。
> - **bug（缺陷）**：标注「发现于」版本，修复后补「修复于」版本。

---

> ## ⚠️ v1.0.4 已作废
>
> **v1.0.4 因意外引入造成崩溃性错误，已作废。** 对于受此版本影响的朋友，我们深表歉意。该版本不再提供下载与使用，其变更已合并、修正后体现在 **v1.0.5** 中（即 1.0.5 汇总了 1.0.3 → 1.0.5 的全部变更）。请所有用户直接升级到 v1.0.5，不要使用 1.0.4。

---

## 待办 / 计划 (Planned)

- [x] 未配置域名返回友好提示页，而非裸 404
  - 类型: enhancement
  - 发现于: v1.0.0
  - 实现于: v1.0.1
  - 描述: `matchRoute` 匹配不上 host 时，仅当 `admin_password` 为空才 302 跳到
    `/_admin/login`；一旦 `admin_password` 已设置，所有未登记域名一律返回 `404 Not Found`
    （如 `port.9997664.xyz` 的情况）。
  - 方案: `admin_password` 已设置且 host 未匹配时，返回友好页面「该域名未在 LodgeManS
     中配置，请联系管理员添加路由」（可复用 `/_admin` 样式），状态码保留 404，仅替换响应体。
     可选：页面上放一个指向 `/_admin` 的入口。

- [x] 密码输入框增加「显示/隐藏」切换按钮
  - 类型: enhancement
  - 发现于: v1.0.0
  - 实现于: v1.0.1
  - 描述: 登录页、管理员设置等涉及密码输入的表单，目前密码为 `type="password"`
     掩码显示，输错或核对时无法查看明文。
  - 方案: 在密码框旁增加眼睛图标/「显示」按钮，点击在 `password` 与 `text` 之间
     切换 `input.type`，便于核对输入。

- [x] `/assets/` 静态文件响应后未 return，导致后续 auth 逻辑二次写 headers 崩溃
  - 类型: bug
  - 发现于: v1.0.1
  - 修复于: v1.0.2
  - 描述: 浏览器请求 `/assets/` 下静态资源时，`fs.readFileSync` 成功发送 200 响应后没有
    `return`，执行继续落到 auth 重定向逻辑，再次 `res.writeHead` 触发
    `ERR_HTTP_HEADERS_SENT`，服务 crash 重启，页面白屏。
  - 修复方案: `server.js:62` 的 `res.end(data)` 后加一行 `return;`

---

## 已修复 Bug (Fixed)

- [x] `#2` 路径穿越漏洞: `/assets/` 未对 URL 路径做规范化检查，`../../../etc/passwd` 可越权读取任意文件
  - 类型: bug (安全)
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `server.js:65-71` 加入 `path.resolve(path.join(__dirname, '..', req.url))` 后检查
    `filePath.startsWith(resolved)`，越界返回 403 Forbidden

- [x] `#3` CSRF 漏洞: `clearSessions`、`deleteRoute`、`reloadConfig`、`kickSession` 四个管理端接口未校验
    HTTP Method，恶意网站可通过 GET 请求诱导已登录管理员执行操作
  - 类型: bug (安全)
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `admin.js` 在各函数入口增加 `if (req.method !== 'POST') return rd(res, '/_admin')`

- [x] `#4` Duration 参数缺失校验: `login?duration=abc` 传入非数字时 `parseInt` 返回 `NaN`，session
    创建后 `expiresAt` 为 `NaN`（等于 `Date.now() + NaN * 1000`），session 立即可用但永不过期
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `auth.js:119` 在 `parseInt` 后增加 `if (!DURATIONS.some(d => d.value === dur)) dur = 3600`
    回退到默认值

- [x] `#5` Body 大小无限制: 登录和管理端未限制请求 body 大小，攻击者可发数十 MB 数据耗尽服务器内存
  - 类型: bug (安全)
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `auth.js:101` + `admin.js` 定义 `MAX_BODY = 1048576`（1MB），`data` 事件中累计 `size`，
    `end` 时检查 `size > MAX_BODY` 返回 413，`readBody` 函数同步限制

- [x] `#6` `uncaughtException` 未退出进程: Node.js 默认行为在 `uncaughtException` 后会保持进程运行，
    但 HTTP 服务器无法正常处理新请求，造成半死不活状态（Silent Fail）
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `server.js:133-136` 改为 `process.exit(1)` 确保进程 crash，Docker 自动重启恢复；
    新增 `unhandledRejection` 处理器记录日志

- [x] `#7` 审计日志写入失败静默忽略: `audit.js` `fs.appendFile` 的回调为空函数，磁盘满或权限错误时
    日志丢失且无人知晓
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `audit.js` 回调改为 `err => err && console.error('audit log error', err)`

- [x] `#8` Host 请求头转发泄漏: 反向代理转发请求时未清理原始 Host 头，后端服务可能收到错误的 Host 值
    或被利用进行 Host Header Injection
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `proxy.js:12-13` 转发前 `delete options.headers['host']` 和 `['connection']`

- [x] `#9` WebSocket 升级丢失后端响应头: WebSocket upgrade 转发只保留了 `'set-cookie'` 一个响应头，
    Cookie 可能被保留但其他响应头（后端认证 token 等）丢失
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `proxy.js:52-56` 将固定头列表改为 `for` 循环遍历 `proxyRes.headers` 全部转发

- [x] `#10` `adminSessions` 内存泄漏: `admin_login` 创建 session 到 `adminSessions` Map 后永不清除，
    session 总数持续增长
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `admin.js` 增加 `setInterval` 定时器（每 1 小时）清理过期 admin session

- [x] `#11` 配置加载失败静默降级: `config.js` 中 catch 错误后只返回硬编码默认值，管理员不会收到任何
    告警，生产环境路由可能意外失效（Silent Degrade）
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `config.js:56-58` catch 中改为 `throw` 而非返回默认值，让 `uncaughtException` 捕获 -> 进程 crash
    重启

- [x] `#12` 审计日志注入: `admin.js:710` `kickSession` 日志记录用户输入的 Label 未做转义，包含
    `\n` 的 Label 可伪造审计日志条目（Log Injection）
  - 类型: bug (安全)
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: 写入审计日志前对 `label.replace(/[\n\r]/g, '\\n')`

- [x] 代理后端无超时: `proxy.js` 中 `http.request` 未设超时，后端挂死时请求会永远挂起
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: `proxy.js` 设 `timeout: 10000`，超时触发 `destroy()` 返回 502 Bad Gateway

- [x] 管理员密码变更未失效已有会话: `changeAdmin` 更新密码后 `adminSessions` 中旧会话仍有效
  - 类型: bug (安全)
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: 密码变更成功时调用 `adminSessions.clear()` 踢掉所有旧会话

- [x] 会话 ID 前缀匹配不严谨: `kickSession`/`updateSessionLabel` 中 `sid.replace('...', '')` 无差别移除三段点，可能误匹配
  - 类型: bug
  - 发现于: v1.0.2
  - 修复于: v1.0.3
  - 修复方案: 改为显式判断 `sid.endsWith('...') ? sid.slice(0, -3) : sid`

- [x] 内联 `require` 不一致: `admin.js` 多处使用 `require('./config.js').hashPassword()` 而非顶部已 import 的变量
  - 类型: enhancement
  - 发现于: v1.0.2
  - 实现于: v1.0.3
  - 修复方案: 顶部 import 补 `loadConfig`，替换全部 4 处内联 `require` 为变量引用

---

## 已实现功能 (Done)

- [x] `#1` Session 持久化: 所有用户 session 写入 `data/sessions.json`，容器重启后 session 自动恢复
  - 类型: enhancement
  - 发现于: v1.0.2
  - 实现于: v1.0.3
  - 描述: 之前所有 session 仅存于内存 Map，容器重建/重启全部丢失，永久登录需重新认证。
  - 实现方案: 新增 `src/session.js`（`loadSessions`/`saveSessions`），`server.js` 启动时从 JSON 加载，
    `set` / `delete` / `clear` 操作后自动写回磁盘

- [x] Docker 开发体验改进: compose.yaml 增加 `src/` bind mount，开发时修改代码无需重建镜像
  - 类型: enhancement
  - 发现于: v1.0.2
  - 实现于: v1.0.3
  - 描述: 之前 `docker/Dockerfile` 将 `src/` 复制到镜像内，修改代码需 `docker compose build` + restart，
    构建过程因网络问题容易超时失败。
  - 实现方案: `docker/compose.yaml` volumes 增加 `- ../src:/app/src`
