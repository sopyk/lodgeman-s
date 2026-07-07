# Unified Auth Proxy — 架构文档

## 系统定位

统一认证反向代理，为多个内部服务提供统一的 cookie 登录入口。

- **前端无关**：前面可以是 Cloudflare Tunnel、Caddy、Nginx、或裸连开发
- **Host 分发**：根据域名将流量路由到不同后端
- **路径豁免**：API 路径可跳过 session 检查，靠后端自身鉴权

## 网络架构

```
浏览器访问 *.example.com
        │ HTTPS
        ▼
Cloudflare Tunnel / Caddy / Nginx（TLS 透传）
        │ HTTP
        ▼
┌─────────────────────────────────────┐
│        Auth Proxy (:4082)            │
│                                     │
│  svc1.example.com → 鉴权 → :8080    │
│  svc2.example.com → 鉴权 → :3001    │
│  svc3.example.com → 免检 → :9000    │
│  _admin            → 管理面板        │
└─────────────────────────────────────┘
```

## 请求处理流程

```
接收请求
  │
  ├─ 路径 /_login    → handleAuth: GET 显示登录页，POST 验证密码创建 session
  ├─ 路径 /_logout   → 清除 cookie + session，302 到登录页
  ├─ 路径 /_admin/*  → handleAdmin: 管理面板
  │
  └─ Host 匹配路由表
      ├─ 无匹配 → 404
      └─ 匹配成功
          ├─ auth: false → 直接代理
          ├─ auth: true + 路径在 auth_exempt → 直接代理
          ├─ auth: true + 有效 session → 代理（自动删 Cookie 头）
          └─ auth: true + 无 session
              ├─ Accept: application/json → 401
              └─ 浏览器请求 → 302 /_login
```

## Session

服务端内存 Map，key 为 256 位随机 hex。

```json
{
  "id": "a1b2c3...",
  "username": "user",
  "createdAt": 1700000000000,
  "expiresAt": 1702592000000,
  "userAgent": "Mozilla/5.0...",
  "ip": "127.0.0.1",
  "host": "svc1.example.com",
  "label": "星辰42",
  "duration": 3600
}
```

- Cookie 名 `auth_session`，HttpOnly + SameSite=Lax
- 每小时清理过期 session
- 管理员 session 独立存储，4 小时过期

## 密码安全

- 启动时自动检测明文密码并升级为 scrypt 哈希
- 哈希格式 `scrypt:<salt>:<hash>`，写入 routes.yaml
- 验证时先检查前缀，兼容未升级的明文

## 管理面板

路径 `/_admin`，需独立管理账号登录。

- 仪表盘：路由数 + 会话数卡片统计
- 路由管理：行内编辑（不跳转独立编辑页），添加时查重，删除需确认
- 会话管理：用户会话与管理员会话合并显示，管理员会话标绿色 badge，无踢下线按钮
- 会话操作：踢人（按 session ID 前缀匹配）、清空所有
- 配置重载：从 YAML 重新读取，不重启进程
- 自动刷新：每 10 秒整页重载（编辑模式下暂停）

## 审计日志

文件 `data/audit.log`，追加写入，每条记录：

```
[2025-01-01T00:00:00.000Z] LOGIN_OK ip=127.0.0.1
[2025-01-01T00:00:00.000Z] ROUTE_ADD ip=127.0.0.1 host=svc.example.com target=:8080
```

8 类事件：LOGIN_OK / LOGIN_FAIL / LOGOUT / ADMIN_LOGIN_OK / ADMIN_LOGOUT / ROUTE_ADD / ROUTE_EDIT / ROUTE_DEL / SESSION_KICK / SESSION_CLEAR / CONFIG_RELOAD / CONFIG_RELOAD_FAIL

## 登录页面

- 简约风格，零外部依赖
- 支持选择会话时长（15min ~ 永久，默认 1h）
- 支持填写备注名（预填随机中文词 + 数字）
- "保持登录" + 公共场所安全提示
- 不使用"会话"等术语，用通俗语言

## 安全设计

- Cookie HttpOnly + SameSite=Lax
- 管理面板与用户登录独立密码
- 管理面板可完全禁用（`admin_password: ""`）
- 代理转发时删除 Cookie 头，不向后端泄露 session
- 通配符路径匹配豁免

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/server.js` | 入口，HTTP 服务器 + 路由分发 |
| `src/auth.js` | 登录页渲染、session 管理 |
| `src/admin.js` | 管理面板 UI 和操作逻辑 |
| `src/config.js` | YAML 加载、密码哈希、配置读写 |
| `src/proxy.js` | HTTP/WebSocket 反向代理 |
| `src/audit.js` | 审计日志追加写入 |
| `config/routes.yaml` | 运行时配置 |
