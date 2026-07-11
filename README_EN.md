<p align="center">
  <img src="assets/lodgemans-banner.png" alt="门房大爷LodgeManS" width="720">
</p>

<p align="center">
  <a href="README.md">中文</a> · <strong>English</strong>
</p>

# LodgeManS — Unified Auth Gateway

**One login to secure multiple backend services**.

Many self-hosted services lack built-in authentication. Exposing them directly to the internet raises security concerns. Setting up Nginx Basic Auth for each service is tedious, and constantly re-entering passwords on mobile Home Screen shortcuts is frustrating.

LodgeManS puts a single authentication gate in front of those services. Log in once (cookie-based session), and all protected browser requests pass through automatically — protecting privacy while reducing repetitive logins.

## 📋 Prerequisites

LodgeManS routes traffic based on the **Host header**; direct IP access is not supported.

**Option 1: Reverse proxy (recommended)**  
Nginx / Caddy / Cloudflare Tunnel listens on 80/443, forwards wildcard domain traffic to `:4082`. No port number needed in URLs.

**Option 2: DNS + port**  
Point `*.example.com` to your server IP, access via `http://svc.example.com:4082` (port 4082 must be open).

Once traffic reaches LodgeManS, add routing rules via the admin panel (`/_admin`) to dispatch requests to different backends by domain.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Host routing** | Route by domain (`svc1.example.com → :8080`) |
| **Cookie auth** | Log in once, access all protected services |
| **Auth toggle** | Per-route control — let already-secured backends pass through |
| **Path exemption** | Skip auth for specific paths (`/api/*`, `/health`) |
| **WebSocket** | Full WebSocket proxy support |
| **Admin panel** | Manage routes, view active sessions, kick users, reload config in browser |
| **Password security** | Auto-hashed with scrypt at startup, no plaintext in config |
| **Audit log** | Logs logins, logouts, route changes, session operations |
| **Session duration** | 15 min to permanent, selectable on login page |
| **Session note** | Optional label on login for easy identification in admin panel |
| **Docker support** | Ready-to-use Docker images |
| **Frontend-agnostic** | Works behind Cloudflare Tunnel, Caddy, Nginx, or directly |

## 🚀 Quick Start

### Bare Metal

```bash
git clone https://github.com/sopyk/lodgeman-s.git
cd lodgeman-s
npm install

cp config/routes.example.yaml config/routes.yaml
# Edit routes.yaml, set a password, add your routes

node src/server.js
```

### Docker

```bash
# Build image
docker build -t lodgeman-s -f docker/Dockerfile .

# Run (bridge mode, recommended)
docker run -d \
  --name lodgeman-s \
  -p 4082:4082 \
  --add-host host.docker.internal:host-gateway \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  lodgeman-s
```

> In bridge mode, `127.0.0.1` in routes.yaml cannot reach host services.  
> Use `host.docker.internal` instead (resolved via `--add-host`),  
> e.g. `target: http://host.docker.internal:8080`.  
> You can also use `--network host` mode to use `127.0.0.1` directly, but with weaker isolation.

Docker Compose is recommended (see [`docker/compose.yaml`](docker/compose.yaml)):

```bash
docker compose -f docker/compose.yaml up -d
```

### Verify

```bash
curl http://127.0.0.1:4082/_login
curl http://127.0.0.1:4082/_admin      # requires admin_password to be set
```

## 🏗️ Architecture

```
User → *.example.com
        │ HTTPS
        ▼
  ┌──────────────┐
  │ Cloudflare   │  Wildcard CNAME → Tunnel / Nginx / Caddy
  │ Tunnel       │  TLS pass-through only, no routing
  └──────┬───────┘
         │ HTTP :4082
         ▼
  ┌─────────────────────────────────┐
  │    LodgeManS (:4082)            │  Unified auth gateway
  │                                  │
  │  svc1.example.com  → auth → :8080│
  │  svc2.example.com  → auth → :3001│
  │  svc3.example.com  → open → :9000│
  └─────────────────────────────────┘
```

Request flow:

```
Request arrives → Host header matched to a route
         ├─ No match → 404
         ├─ auth: false → proxy directly to backend
         ├─ auth: true + path exempted → proxy
         ├─ auth: true + valid session → proxy (Cookie header stripped)
         └─ auth: true + no session
              ├─ Accept: application/json → 401 JSON
               └─ Browser → 302 /_login
```

> **When using Cloudflare Tunnel**: Configure the tunnel with a wildcard domain `*.example.com` forwarding to `localhost:4082`, and create a CNAME record for `*.example.com` pointing to the tunnel. See [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/).

## ⚙️ Configuration

Edit `config/routes.yaml`:

```yaml
port: 4082
password: "your-password"      # Unified login password, auto-hashed on first start
admin_username: admin           # Admin panel username
admin_password: ""              # Admin password, leave empty to disable panel
session_max_age: 2592000        # Default session TTL (seconds, 30 days)

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
    auth: false                # No auth
    description: My Service 2
```

On first startup, `password` and `admin_password` are automatically upgraded from plaintext to scrypt hash (irreversible), and the config file is rewritten.

> **Note**: After startup, passwords in routes.yaml become `scrypt:...` format. To change later, edit the plaintext value and restart — it will be re-hashed automatically. Or use `node scripts/hash-password.js <password>` to pre-hash.

### Admin Panel

> **Note**: Backend targets only support HTTP (`http://`), not HTTPS or other protocols.

When `admin_password` is non-empty, visit `/_admin`:

- Dashboard: overview of route count and active sessions
- Route management: view, add, edit, delete routes (inline editing, no page jump)
- Session management: view online users (IP, device, note, duration), kick, clear all
- Settings: change access password and admin credentials
- Config import/export (YAML merge)
- Config reload: re-read from YAML file without restart

### Path Exemption

Paths set in `auth_exempt` bypass session checks. Useful for:

- API endpoints (`/api/*`): let JWT/API Key handle auth
- WebSocket (`/ws`): some WS clients don't carry cookies
- Health checks (`/health`): monitoring probes

### Docker Build

```bash
# Build from project root (assets/ required)
docker build -t lodgeman-s -f docker/Dockerfile .

# Use pre-built image
docker compose -f docker/compose.yaml up -d
```

Pre-built images are available on GitHub Container Registry:

```yaml
image: ghcr.io/sopyk/lodgeman-s:latest
```

## 🛠️ Tech Stack

- **Core**: Node.js native http module, zero runtime dependencies
- **Config**: YAML (parsed via `js-yaml`)
- **Auth**: scrypt password hashing + in-memory server sessions + HttpOnly cookies
- **Proxy**: Native http.request + pipe (WebSocket via upgrade event)

## 🔒 Security

- Passwords stored as scrypt hashes, no plaintext in config
- Cookies: HttpOnly + SameSite=Lax
- Admin panel and user auth are separate, with independent passwords
- Admin panel can be fully disabled (`admin_password: ""`)
- Proxy strips Cookie headers to avoid leaking sessions to backends
- Wildcard path matching for exemptions, preventing accidental bypasses

## 📁 Directory

```
lodgeman-s/
├── src/
│   ├── server.js      # Entry point, route dispatcher
│   ├── auth.js        # Login page, sessions, cookies
│   ├── admin.js       # Admin panel
│   ├── config.js      # Config loading, YAML, password hashing
│   ├── proxy.js       # HTTP/WebSocket reverse proxy
│   └── audit.js       # Audit logging
├── config/
│   ├── routes.yaml         # Runtime config (gitignored)
│   └── routes.example.yaml # Example config
├── data/
│   └── audit.log     # Audit log
├── docker/
│   ├── Dockerfile
│   └── compose.yaml
├── assets/
│   ├── lodgemans-banner.png
│   ├── lodgemans-logo.png
│   └── favicon.png
├── scripts/
│   └── hash-password.js
├── docs/
│   ├── architecture.md
│   ├── requirements.md
│   └── progress.md
├── package.json
├── LICENSE
├── .dockerignore
├── .gitignore
├── CHANGELOG.md
├── README.md
└── README_EN.md
```

## 📄 License

MIT © [SopyK](https://github.com/sopyk)
