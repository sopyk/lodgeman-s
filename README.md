<p align="center">
  <img src="assets/lodgemans-banner.png" alt="门房大爷LodgeManS" width="720">
</p>

# 门房大爷 LodgeManS

统一认证网关——**一个登录入口，保护多个后端服务**。

很多自建服务本身不带鉴权，反代后直接暴露在公网，有信息泄露之顾虑。逐个配 Nginx Basic Auth 很麻烦，iPhone 桌面快捷方式每次都要输密码更痛苦。

门房大爷就是在这些服务前面加一道大门——统一认证网关。登录一次后（基于 cookie 的 session），所有受保护的浏览器请求自动通过，保护隐私的同时也减少反复登录的麻烦。一个入口，保护多个后端。

## 使用前提

门房大爷基于 Host 头进行路由分发，**不支持直接通过 IP 访问**。

**方式一：前置反代（推荐）**  
Nginx / Caddy / Cloudflare Tunnel 监听 80/443，将泛域名流量转发到 `:4082`，访问无需端口号。

**方式二：DNS + 端口**  
DNS `*.example.com` 解析到服务器 IP，直接 `http://svc.example.com:4082` 访问（需开放 4082 端口）。

流量到达门房大爷后，在管理面板（`/_admin`）中添加路由规则即可按域名分发到不同后端。

## 功能

| 功能 | 说明 |
|------|------|
| **Host 路由** | 根据域名分发到不同后端（`svc1.example.com → :8080`） |
| **Cookie 认证** | 一次登录，所有受保护服务通用 |
| **认证开关** | 每条路由独立控制是否启用统一认证——本身带鉴权的服务可直接放行 |
| **路径豁免** | 部分路径跳过鉴权（`/api/*`、`/health`），让后端自管 |
| **WebSocket** | 完整 WebSocket 代理支持 |
| **管理面板** | 浏览器内管理路由、查看活跃会话、踢人、重载配置 |
| **密码安全** | 启动时自动 scrypt 哈希，配置文件不存明文 |
| **审计日志** | 记录登录、登出、路由变更、会话操作等事件 |
| **会话时长** | 支持 15 分钟 ~ 永久，登录页下拉可选 |
| **会话备注** | 登录时可填备注名，方便管理后台识别 |
| **Docker 部署** | 支持 Docker 容器化运行 |
| **前端无关** | 可放在 Cloudflare Tunnel、Caddy、Nginx 后面，或裸连使用 |

## 快速开始

### 裸机运行

```bash
git clone https://github.com/sopyk/lodgeman-s.git
cd lodgeman-s
npm install

cp config/routes.example.yaml config/routes.yaml
# 编辑 routes.yaml，设置 password，添加你的路由

node src/server.js
```

### Docker 运行

```bash
# 构建镜像
docker build -t lodgeman-s -f docker/Dockerfile .

# 运行（桥接模式，推荐）
docker run -d \
  --name lodgeman-s \
  -p 4082:4082 \
  --add-host host.docker.internal:host-gateway \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  lodgeman-s
```

> 桥接模式下，routes.yaml 中的 `127.0.0.1` 地址无法访问宿主机服务。
> 需将目标地址改为 `host.docker.internal`（已通过 `--add-host` 解析），
> 如 `target: http://host.docker.internal:8080`。
> 也可用 `--network host` 模式直接使用 `127.0.0.1`，但隔离性较差。

推荐使用 Docker Compose（详见 [`docker/compose.yaml`](docker/compose.yaml)）：

```bash
docker compose -f docker/compose.yaml up -d
```

### 验证

```bash
curl http://127.0.0.1:4082/_login
curl http://127.0.0.1:4082/_admin      # 需先配置 admin_password
```

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
  │   门房大爷 LodgeManS (:4082)     │  统一认证网关
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

> **使用 Cloudflare Tunnel 时**：Tunnel 端必须配置泛域名 `*.example.com` 转发到 `localhost:4082`，同时 DNS 中 `*.example.com` 需创建 CNAME 记录指向 Tunnel。具体配置参考 [Cloudflare Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)。

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
- 设置：修改访问密码和管理员账号
- 配置导入导出（YAML 合并导入）
- 配置重载：从 YAML 文件重新加载（无需重启进程）

### 路径豁免

设置 `auth_exempt` 的路径不受 session 检查，直接透传。适用于：

- API 端点（`/api/*`）：靠 JWT/API Key 自管鉴权
- WebSocket（`/ws`）：部分 WS 客户端不方便带 cookie
- 健康检查（`/health`）：监控系统探测

### Docker 构建说明

```bash
# 从项目根目录构建（需要 assets/ 目录）
docker build -t lodgeman-s -f docker/Dockerfile .

# 使用预制镜像
docker compose -f docker/compose.yaml up -d
```

预制镜像可在 GitHub Container Registry 获取（待配置）：

```yaml
image: ghcr.io/sopyk/lodgeman-s:latest
```

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
lodgeman-s/
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
├── docker/
│   ├── Dockerfile
│   └── compose.yaml
├── assets/
│   ├── lodgemans-banner.png
│   ├── lodgemans-logo.png
│   └── favicon.png
├── scripts/
│   └── hash-password.js
├── LICENSE
└── README.md
```

## 协议

MIT © [SopyK](https://github.com/sopyk)
