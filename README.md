# Unified Auth Proxy

统一认证反向代理——**一个登录入口，保护多个后端服务**。

让多个没有登录功能的内部 Web 服务（Open WebUI、AnythingLLM、Code Server……）共用一套 cookie 认证，一次登录到处用。

## 为什么需要这个？

```
服务搭建多了之后：

┌─ Open WebUI (:8080)      ─→ 无鉴权，裸奔
├─ Code Server (:8443)     ─→ 自带密码但每次都要输
├─ AnythingLLM (:3001)     ─→ 无鉴权，靠反向代理 Basic Auth
└─ pgAdmin (:5050)         ─→ 也有一套自己的登录
                          ─→ 暴露到公网就要分别保护
```

每一个都配 Nginx Basic Auth 很麻烦，iPhone 桌面快捷方式每次都要输密码更痛苦。
**Unified Auth Proxy** 在前端部署一个统一入口，根据域名分派到不同的后端，登录一次管全部。

## 功能

| 功能 | 说明 |
|------|------|
| **Host 路由** | 根据域名分发到不同后端（`svc1.example.com → :8080`） |
| **Cookie 认证** | 一次登录，所有受保护服务通用 |
| **路径豁免** | 部分路径跳过鉴权（`/api/*`、`/health`），让后端自管 |
| **WebSocket** | 完整 WebSocket 代理支持 |
| **管理面板** | 浏览器内管理路由、查看活跃会话、踢人、重载配置 |
| **密码安全** | 启动时自动 scrypt 哈希，配置文件不存明文 |
| **审计日志** | 记录登录、登出、路由变更、会话操作等事件 |
| **会话时长** | 支持 15 分钟 ~ 永久，登录页下拉可选 |
| **会话备注** | 登录时可填备注名，方便管理后台识别 |
| **Docker 部署** | 支持 Docker 容器化运行 |
| **前端无关** | 可放在 Cloudflare Tunnel、Caddy、Nginx 后面，或裸连使用 |

## 架构

```
用户访问 *.example.com
        │ HTTPS
        ▼
  ┌──────────────┐
  │ Cloudflare   │  泛域名 CNAME → Tunnel / Nginx / Caddy
  │ Tunnel       │  只做 TLS 透传，不参与路由
  └──────┬───────┘
         │ HTTP :4082
         ▼
  ┌─────────────────────────────────┐
  │   Unified Auth Proxy (:4082)     │
  │                                  │
  │  svc1.example.com  → 鉴权 → :8080│
  │  svc2.example.com  → 鉴权 → :3001│
  │  svc3.example.com  → 免检 → :9000│
  └─────────────────────────────────┘
```

请求流：

```
请求到达 → Host 头匹配路由
         ├─ 无匹配 → 404
         ├─ auth: false → 直接代理到后端
         ├─ auth: true + 路径在豁免列表 → 代理
         ├─ auth: true + 有效 session → 代理（删除 Cookie 头）
         └─ auth: true + 无 session
              ├─ Accept: application/json → 401 JSON
              └─ 浏览器访问 → 302 /_login
```

## 快速开始

### 裸机运行

```bash
git clone <repo>
cd unified-auth-proxy
npm install

cp config/routes.example.yaml config/routes.yaml
# 编辑 routes.yaml，设置 password，添加你的路由

node src/server.js
```

### Docker 运行

```bash
# 构建
docker build -t unified-auth-proxy .

# 运行（挂载配置和数据目录）
docker run -d \
  --name auth-proxy \
  -p 4082:4082 \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  unified-auth-proxy
```

推荐使用 Docker Compose：

```yaml
services:
  auth-proxy:
    build: .
    ports:
      - "4082:4082"
    volumes:
      - ./config:/app/config
      - ./data:/app/data
    restart: unless-stopped
```

### 验证

```bash
# 测试登录页
curl http://127.0.0.1:4082/_login

# 测试管理面板（需先配置 admin_password）
curl http://127.0.0.1:4082/_admin
```

## 配置

编辑 `config/routes.yaml`：

```yaml
port: 4082
password: "your-password"      # 统一登录密码，首次启动自动哈希
admin_username: admin           # 管理面板用户名
admin_password: ""              # 管理面板密码，留空则禁用面板
session_max_age: 2592000        # 默认 session 有效期（秒，30 天）

routes:
  - host: svc1.example.com
    target: http://127.0.0.1:8080
    auth: true
    auth_exempt:
      - /api/*
      - /health
    description: My Service 1

  - host: svc2.example.com
    target: http://127.0.0.1:3001
    auth: false                # 免鉴权
    description: My Service 2
```

首次启动时，`password` 和 `admin_password` 会自动从明文升级为 scrypt 哈希（不可逆），配置文件会被重写。

> **注意**：启动后 routes.yaml 中的密码会变成 `scrypt:...` 格式。以后改密码可以直接改明文值，重启后自动再哈希；也可以用 `node scripts/hash-password.js <密码>` 预先生成哈希。

### 管理面板

`admin_password` 非空时，访问 `/_admin` 进入管理面板：

- 仪表盘：总览路由数和活跃会话数
- 路由管理：查看、添加、编辑、删除路由（编辑在原位行内切换为表单，不跳页）
- 会话管理：查看在线用户（含 IP、设备、备注、时长），踢人，清空
- 配置重载：从 YAML 文件重新加载（无需重启进程）

### 路径豁免

设置 `auth_exempt` 的路径不受 session 检查，直接透传。适用于：

- API 端点（`/api/*`）：靠 JWT/API Key 自管鉴权
- WebSocket（`/ws`）：部分 WS 客户端不方便带 cookie
- 健康检查（`/health`）：监控系统探测

## 登录页面

- 纯简约风格，无外部依赖
- 支持选择**会话时长**（15 分钟 / 1 小时 / 6 小时 / 24 小时 / 7 天 / 15 天 / 30 天 / 永久）
- 支持填写**备注名**（随机预填一个中文词 + 数字，方便后台识别）
- "保持登录"复选框（不勾选则关闭浏览器后 session 失效）
- 公共场所安全提示

## 审计日志

所有关键事件记录在 `data/audit.log`：

| 事件 | 说明 |
|------|------|
| `LOGIN_OK` | 用户登录成功 |
| `LOGIN_FAIL` | 用户登录失败 |
| `LOGOUT` | 用户退出登录 |
| `ADMIN_LOGIN_OK` | 管理员登录成功 |
| `ADMIN_LOGOUT` | 管理员退出 |
| `ROUTE_ADD` | 新增路由 |
| `ROUTE_EDIT` | 编辑路由 |
| `ROUTE_DEL` | 删除路由 |
| `SESSION_KICK` | 踢下线 |
| `SESSION_CLEAR` | 清空所有会话 |
| `CONFIG_RELOAD` | 重载配置 |
| `CONFIG_RELOAD_FAIL` | 重载配置失败 |

## 技术栈

- **核心**：Node.js 原生 http 模块，零外部依赖
- **配置**：YAML（使用 `js-yaml` 解析）
- **认证**：scrypt 密码哈希 + 服务端内存 session + HttpOnly Cookie
- **代理**：原生 http.request + pipe（WebSocket 通过 upgrade 事件）

## 安全

- 密码 scrypt 哈希存储，配置文件不存明文
- Cookie HttpOnly + SameSite=Lax
- 管理面板与用户登录分离，独立密码
- 管理面板可完全禁用（`admin_password: ""`）
- 代理转发时自动删除 Cookie 头，不向后端泄露 session
- 通配符路径匹配豁免，避免误放行

## 目录

```
unified-auth-proxy/
├── src/
│   ├── server.js      # 入口，路由分发
│   ├── auth.js        # 登录页、session、Cookie
│   ├── admin.js       # 管理面板
│   ├── config.js      # 配置加载、YAML 读写、密码哈希
│   ├── proxy.js       # HTTP/WebSocket 反向代理
│   └── audit.js       # 审计日志
├── config/
│   ├── routes.yaml         # 运行时配置（不提交 git）
│   └── routes.example.yaml # 配置示例
├── data/
│   └── audit.log     # 审计日志
├── scripts/
│   └── hash-password.js # 密码哈希 CLI
├── docs/
│   └── architecture.md
├── Dockerfile
├── package.json
└── README.md
```

## 协议

MIT
