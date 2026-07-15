#!/bin/bash
# LodgeManS 安全攻击模拟 & 功能测试
# 用法: TARGET=http://host:port CONTAINER=容器名 ./tests/attack.sh
# 默认目标: dev 容器 (lodgeman-s-dev:4081)，避免误伤生产
# 生产容器: TARGET=http://localhost:4082 CONTAINER=lodgeman-s

set -eo pipefail

TARGET="${TARGET:-http://localhost:4081}"
CONTAINER="${CONTAINER:-lodgeman-s-dev}"
PASS="${PASS:-testpass}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"

PASSED=0; FAILED=0; TOTAL=0

setup() {
  # 备份原配置到宿主机临时文件（容器内 bind mount 会直接写入宿主机路径）
  local bak="$(dirname "$0")/.routes.yaml.bak"
  docker cp "$CONTAINER:/app/config/routes.yaml" "$bak" 2>/dev/null || true
  # 容器内设测试配置
  docker exec "$CONTAINER" sh -c "cat > /app/config/routes.yaml << 'YAML'
port: 4082
password: testpass
admin_username: admin
admin_password: admin123
session_max_age: 2592000
timezone: Asia/Shanghai
routes:
  - host: test.example.com
    target: http://127.0.0.1:4082
    auth: true
    description: Loopback
  - host: noauth.example.com
    target: http://127.0.0.1:4082
    auth: false
    description: NoAuth
YAML" 2>/dev/null || true
  docker restart "$CONTAINER" >/dev/null 2>&1
  sleep 3
}

cleanup() {
  local bak="$(dirname "$0")/.routes.yaml.bak"
  if [ -f "$bak" ]; then
    docker cp "$bak" "$CONTAINER:/app/config/routes.yaml" 2>/dev/null || true
    rm -f "$bak"
  fi
  docker restart "$CONTAINER" >/dev/null 2>&1
}

ok()   { PASSED=$((PASSED+1)); echo "  ✅ $1"; }
fail() { FAILED=$((FAILED+1)); echo "  ❌ $1 (期望 $2, 实际 $3)"; }

check_status() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL+1))
  [ "$actual" = "$expected" ] && ok "$desc" || fail "$desc" "$expected" "$actual"
}

check_contains() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL+1))
  echo "$actual" | grep -q "$expected" && ok "$desc" || fail "$desc" "(contains $expected)" "$(echo "$actual" | head -c 100)"
}

get_user_cookie() {
  curl -s -X POST -d "password=$PASS&duration=$1" -D - "$TARGET/_login" 2>/dev/null | grep -o 'auth_session=[^;]*' | head -1 || true
}

get_admin_cookie() {
  curl -s -X POST -d "username=$ADMIN_USER&password=$ADMIN_PASS" -D - "$TARGET/_admin/login" 2>/dev/null | grep -o 'admin_session=[^;]*' | head -1 || true
}

get_sessions_json() {
  docker exec "$CONTAINER" sh -c 'cat /app/data/sessions.json' 2>/dev/null || echo "[]"
}

echo ""
echo "═══════════════════════════════════════"
echo " LodgeManS 攻击模拟 & 功能测试"
echo " Target: $TARGET"
echo "═══════════════════════════════════════"

setup

# ──────────────────────────────────────────
# 1. 路径穿越 (#2)
# ──────────────────────────────────────────
echo ""
echo "── 1. 路径穿越攻击 (#2) ──"

check_status "#2a 穿越读 /etc/passwd" "403" \
  "$(curl -s --path-as-is -o /dev/null -w "%{http_code}" "$TARGET/assets/../../../etc/passwd")"

check_status "#2b 穿越读 routes.yaml" "403" \
  "$(curl -s --path-as-is -o /dev/null -w "%{http_code}" "$TARGET/assets/../../../config/routes.yaml")"

check_status "#2c URL 编码穿越" "404" \
  "$(curl -s -o /dev/null -w "%{http_code}" "$TARGET/assets/..%2f..%2f..%2fetc%2fpasswd")"

check_status "#2d 正常 assets" "200" \
  "$(curl -s -o /dev/null -w "%{http_code}" "$TARGET/assets/favicon.png")"

# ──────────────────────────────────────────
# 2. CSRF (#3)
# ──────────────────────────────────────────
echo ""
echo "── 2. CSRF 攻击 (#3) ──"

ADMIN_COOKIE=$(get_admin_cookie)

check_status "#3a GET clearSessions" "302" \
  "$(curl -s -o /dev/null -w "%{http_code}" --cookie "$ADMIN_COOKIE" "$TARGET/_admin/clear")"

check_status "#3b GET deleteRoute" "302" \
  "$(curl -s -o /dev/null -w "%{http_code}" --cookie "$ADMIN_COOKIE" "$TARGET/_admin/routes/delete/0")"

check_status "#3c GET reloadConfig" "302" \
  "$(curl -s -o /dev/null -w "%{http_code}" --cookie "$ADMIN_COOKIE" "$TARGET/_admin/config/reload")"

check_status "#3d GET kickSession" "302" \
  "$(curl -s -o /dev/null -w "%{http_code}" --cookie "$ADMIN_COOKIE" "$TARGET/_admin/kick")"

# POST clearSessions 验证 POST 不被误杀
REDIR=$(curl -s -X POST -o /dev/null -w "%{redirect_url}" --cookie "$ADMIN_COOKIE" "$TARGET/_admin/clear")
check_contains "#3e POST clearSessions" "msg=" "$REDIR"

# ──────────────────────────────────────────
# 3. Duration 参数 (#4)
# ──────────────────────────────────────────
echo ""
echo "── 3. Duration 参数 (#4) ──"

COOKIE_ABC=$(get_user_cookie "abc")
check_contains "#4a duration=abc 创建 session" "auth_session=" "$COOKIE_ABC"
DUR=$(get_sessions_json | python3 -c "import sys,json; s=json.load(sys.stdin); print(s[-1].get('duration','?'))" 2>/dev/null || echo "?")
check_status "#4b duration=abc → 3600" "3600" "$DUR"

COOKIE_NEG=$(get_user_cookie "-1")
check_contains "#4c duration=-1 创建 session" "auth_session=" "$COOKIE_NEG"
DUR=$(get_sessions_json | python3 -c "import sys,json; s=json.load(sys.stdin); print(s[-1].get('duration','?'))" 2>/dev/null || echo "?")
check_status "#4d duration=-1 → 3600" "3600" "$DUR"

COOKIE_365=$(get_user_cookie "31536000")
check_contains "#4e duration=31536000 创建 session" "auth_session=" "$COOKIE_365"
DUR=$(get_sessions_json | python3 -c "import sys,json; s=json.load(sys.stdin); print(s[-1].get('duration','?'))" 2>/dev/null || echo "?")
check_status "#4f duration=31536000 → 31536000" "31536000" "$DUR"

# ──────────────────────────────────────────
# 4. Body 大小 (#5)
# ──────────────────────────────────────────
echo ""
echo "── 4. Body 过大 (#5) ──"

check_status "#5a 1MB+ → 413" "413" \
  "$(python3 -c "import sys; sys.stdout.buffer.write(b'password=$PASS&x=' + b'a'*1048576)" | curl -s -X POST --data-binary @- -o /dev/null -w "%{http_code}" "$TARGET/_login" 2>/dev/null)"

# 略低于 1MB 应正常
NEARLY_1MB_CODE=$(python3 -c "import sys; sys.stdout.buffer.write(b'password=$PASS&x=' + b'a'*(1048576 - 100))" | curl -s -X POST --data-binary @- -o /dev/null -w "%{http_code}" "$TARGET/_login" 2>/dev/null || echo "000")
check_contains "#5b ~1MB 正常登录" "302" "$NEARLY_1MB_CODE"

# ──────────────────────────────────────────
# 5. 日志注入 (#12)
# ──────────────────────────────────────────
echo ""
echo "── 5. 日志注入 (#12) ──"

LABEL_INJECT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('foo\nFAKE_INJECT'))" 2>/dev/null)
get_user_cookie "3600" &>/dev/null  # ignore, just do the login
curl -s -X POST -d "password=$PASS&duration=3600&label=$LABEL_INJECT" "$TARGET/_login" >/dev/null 2>&1 || true
FAKE=$(docker exec "$CONTAINER" sh -c 'cat /app/data/audit.log' 2>/dev/null | grep -c 'FAKE_INJECT' || true)
check_status "#12 日志注入 (FAKE_INJECT=0)" "0" "$FAKE"

# ──────────────────────────────────────────
# 6. Session 持久化 (#1)
# ──────────────────────────────────────────
echo ""
echo "── 6. Session 持久化 (#1) ──"

BEFORE=$(get_sessions_json | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
COOKIE_PERSIST=$(get_user_cookie "3600")

docker restart "$CONTAINER" >/dev/null 2>&1
sleep 3

AFTER=$(get_sessions_json | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

# 重启后 session 数应不低于重启前（持久化生效）
if [ "$AFTER" -ge "$BEFORE" ] 2>/dev/null; then
  ok "#6a 重启后 session 数≥重启前 ($AFTER ≥ $BEFORE)"
else
  fail "#6a 重启后 session 数不足 ($AFTER < $BEFORE)" "≥$BEFORE" "$AFTER"
fi

# cookie 持久化验证：检查 sessions.json 中含有该 cookie 对应的 session
SESSION_FOUND=$(get_sessions_json | python3 -c "
import sys, json
sessions = json.load(sys.stdin)
cid = '$(echo "$COOKIE_PERSIST" | sed 's/auth_session=//')'
for s in sessions:
    if s.get('id', '').startswith(cid[:16] if len(cid) > 16 else cid):
        print('found')
        break
" 2>/dev/null || echo "not_found")
check_contains "#6b session 持久化到文件" "found" "$SESSION_FOUND"

# ──────────────────────────────────────────
# 7. 管理端 CRUD
# ──────────────────────────────────────────
echo ""
echo "── 7. CRUD ──"

ADMIN_COOKIE=$(get_admin_cookie)

REDIR=$(curl -s -X POST -o /dev/null -w "%{redirect_url}" --cookie "$ADMIN_COOKIE" \
  -d "host=crud.example.com&target=192.168.1.1:3000&auth=true&description=CRUDTest" "$TARGET/_admin/routes/add")
check_contains "#7a addRoute" "/_admin" "$REDIR"

# 重复 host
REDIR=$(curl -s -X POST -o /dev/null -w "%{redirect_url}" --cookie "$ADMIN_COOKIE" \
  -d "host=crud.example.com&target=127.0.0.1:5000" "$TARGET/_admin/routes/add")
check_contains "#7b addRoute 重复" "error" "$REDIR"

# 编辑
REDIR=$(curl -s -X POST -o /dev/null -w "%{redirect_url}" --cookie "$ADMIN_COOKIE" \
  -d "host=crud.example.com&target=192.168.1.1:4000&auth=false" "$TARGET/_admin/routes/edit/2")
check_contains "#7c editRoute" "/_admin" "$REDIR"

# 删除
REDIR=$(curl -s -X POST -o /dev/null -w "%{redirect_url}" --cookie "$ADMIN_COOKIE" "$TARGET/_admin/routes/delete/2")
check_contains "#7d deleteRoute" "/_admin" "$REDIR"

# ──────────────────────────────────────────
# 8. 路由导出
# ──────────────────────────────────────────
echo ""
echo "── 8. 路由导出 ──"

EXPORT=$(curl -s --cookie "$ADMIN_COOKIE" "$TARGET/_admin/routes/export")
check_contains "#8a 导出含 test.example.com" "test.example.com" "$EXPORT"

# ──────────────────────────────────────────
# 9. 认证保护
# ──────────────────────────────────────────
echo ""
echo "── 9. 认证保护 ──"

# 受保护路由未认证 → 302 (通过传入 cookie 验证 header)
check_status "#9a 未认证→受保护路由→302" "302" \
  "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: test.example.com" "$TARGET/")"

# JSON 请求未认证→401
check_status "#9b JSON 未认证→401" "401" \
  "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: test.example.com" -H "Accept: application/json" "$TARGET/")"

# 免鉴权路由：不返回 302（loopback 自身返回 404，是测试设计问题，非代码缺陷）
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: noauth.example.com" "$TARGET/")
if [ "$STATUS" != "302" ]; then
  ok "#9c 免鉴权路由返回 $STATUS 而非 302"
else
  TOTAL=$((TOTAL+1))
  fail "#9c 免鉴权路由不应 302" "非 302" "$STATUS"
fi

# ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo " 测试结果: $PASSED 通过 | $FAILED 失败 | $TOTAL 总用例"
echo "═══════════════════════════════════════"

cleanup
exit $FAILED
