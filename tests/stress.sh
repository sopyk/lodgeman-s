#!/bin/bash
# LodgeManS 压力测试 — 无 ab/wrk 依赖

TARGET="${TARGET:-http://localhost:4082}"
CONCURRENT="${CONCURRENT:-10}"
PASS="${PASS:-testpass}"

failures=0
total_test=0

run_concurrent() {
  local desc="$1" expected="$2" total="$CONCURRENT"
  shift 2
  local tmpf=$(mktemp)
  local pids=()

  for i in $(seq 1 "$total"); do
    (curl -s -o /dev/null -w "%{http_code}\n" "$@" >> "$tmpf" 2>/dev/null) &
    pids+=($!)
  done

  wait "${pids[@]}" 2>/dev/null || true

  local ok=$(grep -c "^${expected}$" "$tmpf" 2>/dev/null || echo 0)
  local fail=$(( total - ok ))
  rm -f "$tmpf"
  total_test=$((total_test+1))

  if [ "$fail" -eq 0 ]; then
    echo "  ✅ $desc ($ok/$total → $expected)"
  else
    echo "  ❌ $desc ($ok/$total → $expected, $fail 异常)"
    failures=$((failures+1))
  fi
}

echo ""
echo "═══════════════════════════════════════"
echo " 压力测试: $CONCURRENT 并发"
echo " Target: $TARGET"
echo "═══════════════════════════════════════"

# 预取 cookie
COOKIE=$(curl -s -X POST -d "password=$PASS&duration=3600" -D - "$TARGET/_login" 2>/dev/null | grep -o 'auth_session=[^;]*' | head -1)
ADMIN_COOKIE=$(curl -s -X POST -d "username=admin&password=admin123" -D - "$TARGET/_admin/login" 2>/dev/null | grep -o 'admin_session=[^;]*' | head -1)

run_concurrent "登录" "302" -X POST -d "password=$PASS&duration=3600" "$TARGET/_login"
run_concurrent "管理页" "200" --cookie "$ADMIN_COOKIE" "$TARGET/_admin"
run_concurrent "静态资源" "200" "$TARGET/assets/favicon.png"
run_concurrent "静态+管理混合" "200" --cookie "$ADMIN_COOKIE" "$TARGET/_admin"
run_concurrent "未认证代理" "302" -H "Host: test.example.com" "$TARGET/"
run_concurrent "404 路径" "404" "$TARGET/nonexistent"

echo ""
echo "═══════════════════════════════════════"
echo " 结果: $((total_test-failures))/$total_test 通过 | $failures 失败"
echo "═══════════════════════════════════════"
exit $failures
