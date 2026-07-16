> [中文更新日志](CHANGELOG.md)

# Changelog

## 1.0.4 (2026-07-16)

### Fixes

- **Test script damaged production**: `tests/attack.sh` now defaults to dev container; `setup`/`cleanup` use `docker cp` for reliable config backup/restore; added environment guard (container name must end with `-dev`), preventing accidental production damage
- **Browser password fill confusion**: Access password and admin login password fields shared the same `name="password"`, making the browser unable to distinguish between the two passwords. Changed access password form to use `name="access_pwd"`; sync updated test scripts. Login page password field changed to `type="text"` + CSS `-webkit-text-security:disc`, so Chrome no longer recognizes it as a password field, completely bypassing the password manager
- **Tab key stuck on eye toggle**: The password reveal button (`<button>`) was in the Tab order, preventing Tab from reaching the next input. Added `tabindex="-1"` to all `.pwd-toggle` buttons
- **Settings form JSON parse failure**: `submitSettingsForm` used `new FormData(form)`, encoding as `multipart/form-data`, which `URLSearchParams` on the backend couldn't parse. Changed to submit `Content-Type: application/json`
- **addRoute error not shown**: Route validation failures redirected to `/?error=...` but the error only rendered in edit mode, silently discarding add-route errors. Changed to show errors at page top in non-edit mode too
- **Settings form field name conflict**: The "new access password" field in settings used `name="password"`, same as the admin password field, causing Chrome autofill confusion. Changed to `name="new_access_pwd"`

### Improvements

- **Settings save no longer triggers browser password manager**: `submitSettingsForm` temporarily changes all `input[type="password"]` to `type="text"` before fetch, preventing Chrome's "update login" prompt; restores after submission
- **URL params no longer contain Chinese characters**: Redirect URL `error`/`msg` params now use English codes (e.g. `?msg=cleared&count=3`), decoded back to Chinese by `decodeUrlMsg` on the server side

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
