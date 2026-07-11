> [中文更新日志](CHANGELOG.md)

# Changelog

## 1.0.0 (2026-07-12)

LodgeManS — Unified Auth Gateway. One login to secure multiple backend services.

### Features

- **Host routing**: dispatch traffic by domain to different backends
- **Cookie authentication**: log in once, access all protected services
- **Per-route auth toggle**: each route independently controls whether unified auth is required
- **Path exemption**: skip session checks for specific paths (`/api/*`, `/health`)
- **WebSocket**: full WebSocket proxy support
- **Admin panel** (`/_admin`):
  - Route management: view, add, edit, delete routes (inline editing)
  - Session management: online users (IP, device, note, duration), kick, clear all
  - Settings: change access password and admin credentials
  - Config import/export (YAML merge import)
  - Config reload without restart
- **First-time setup**: registration form on first visit when no admin password is set
- **Audit log**: records logins, logouts, route changes, session operations
- **Session duration**: 15 minutes to permanent, selectable on login page
- **Session note**: optional label on login for easy identification in admin panel
- **Password security**: auto scrypt-hashed at startup, no plaintext in config
- **Docker support**: Dockerfile and Compose configuration included

### Changes

- Project structure cleanup: removed duplicate files and loose assets, organized into `docker/`, `assets/` directories
- Route targets changed to `host.docker.internal` for Docker bridge mode
- Target input field simplified to `<scheme> + <address:port>` combo
- Admin password minimum length raised to 6 characters

### Fixes

- Fixed `/_admin/login` returning 403 when no admin password was set; now shows a registration form instead

### Documentation

- New English README (`README_EN.md`)
- Admin panel usage instructions added
- Route config example annotated with notes
