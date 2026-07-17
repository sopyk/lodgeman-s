> [中文更新日志](CHANGELOG.md)

# Changelog

## 1.0.5 (2026-07-16)

> **Note**: This section consolidates all changes from 1.0.3 through 1.0.5 (including improvements originally intended for 1.0.4). The intermediate 1.0.4 release has been deprecated — see note below.

### Fixes

- **Registration and password change broken**: Fixed field-name mismatch between forms and backend `params.get()` in `admin.js`; admin first-time registration and settings-page access-password change now work
- **Settings access-password form auto-fill**: The confirm field now uses `type=text` + pwd-mask + non-standard field name, fully preventing the browser from cross-form auto-filling saved admin credentials
- **Password display**: Login password fields use `type=text` + CSS `-webkit-text-security:disc`, so no blue auto-fill dots appear; settings forms convert password fields to plain text before submit to avoid the browser saving plaintext password history
- **Message encoding hardening**: Error/success messages use short-key encoding with decode-on-render, avoiding encoding issues from Chinese text directly in URL params

### Improvements

- **Password toggle buttons**: All password toggle buttons get `tabindex="-1"` to keep Tab navigation from stopping on the show/hide icon
- **`attack.sh` test script**: Only runs when the container name contains `-dev` suffix (prevents hitting production); uses `docker cp` instead of `docker exec` to write config
- **Proxy test**: Fixed `proxy.test.js` failures caused by missing methods on the mock object

---

## ⚠️ 1.0.4 Deprecated

**v1.0.4 has been deprecated due to unintentionally introduced crashing bugs.** We apologize to anyone affected by this release. This release is no longer available for download or use; its changes were merged and corrected into 1.0.5. All users should upgrade directly to 1.0.5.

---

## 1.0.3 (2026-07-15)

### Security

- **Path traversal**: Path sanitization with whitelist check for `/assets/`, unauthorized access returns 403
- **CSRF**: `deleteRoute`/`clearSessions`/`reloadConfig`/`kickSession` restricted to POST only
- **Body size limit**: Request body capped at 1MB, returns 413 if exceeded
- **Host header leak**: Strip `host`/`connection` headers before proxying to prevent Host Header Injection
- **Log injection**: Escape `\n`/`\r` in Label field before writing audit logs
- **Password change invalidates sessions**: Clear all admin sessions on password change, preventing old cookies from lingering

### Fixes

- **Session persistence**: New `src/session.js`, sessions persisted to `data/sessions.json`, auto-restored on container restart
- **uncaughtException**: Changed to `process.exit(1)` to avoid hung state; added `unhandledRejection` logging
- **Audit log callback**: Errors now logged via `console.error` instead of silent failure
- **WebSocket headers**: Forward all backend response headers on WebSocket upgrade, not just set-cookie
- **adminSessions leak**: Periodic cleanup of expired admin sessions every hour
- **Config load failure**: Throw on error instead of returning defaults, ensuring admin awareness
- **Duration validation**: Invalid duration values fall back to default 1 hour
- **Proxy timeout**: Backend proxy connections set to 10s timeout, returns 502 on timeout
- **SID prefix matching**: `kickSession`/`updateSessionLabel` use explicit `endsWith('...')` check instead of fragile `.replace('...', '')`

### Improvements

- **Docker dev experience**: `compose.yaml` adds `src/` bind mount, code changes apply without rebuild
- **Code consistency**: Removed spurious inline `require()` calls in `admin.js`, unified with top-level imports

## 1.0.2 (2026-07-14)

### Fixes

- **Asset crash**: Missing `return` after sending static file response, causing `ERR_HTTP_HEADERS_SENT` crash when auth logic tries to write headers again
- **Default timezone**: Timezone defaults to `Asia/Shanghai` so session timestamps display correctly out of the box

### Improvements

- **Configurable timezone**: Added timezone selection in Admin → Settings, affecting session timestamps and audit log display

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
