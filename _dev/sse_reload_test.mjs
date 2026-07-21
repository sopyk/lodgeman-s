/**
 * SSE 页面重载测试 v3 — 真实浏览器登录
 *
 * code.9997664.xyz  — 经过门房，模拟真实用户登录
 * coded.9997664.xyz — 直连 OpenCodeUI
 *
 * Usage:
 *   GATEHOUSE_PWD=Songsir2026# node _dev/sse_reload_test.mjs
 *   OBSERVE_SEC=120 GATEHOUSE_PWD=Songsir2026# node _dev/sse_reload_test.mjs
 */

import { chromium } from 'playwright';

const OBSERVE_SEC = parseInt(process.env.OBSERVE_SEC || '180', 10); // 3 minutes
const GATEHOUSE_PWD = process.env.GATEHOUSE_PWD || '';

if (!GATEHOUSE_PWD) {
  console.error('ERROR: Set GATEHOUSE_PWD environment variable');
  process.exit(1);
}

async function testGatehouse(label, url, password) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TEST: ${label}`);
  console.log(`  URL:  ${url}`);
  console.log(`${'='.repeat(60)}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  const startTime = Date.now();
  function ts() { return ((Date.now() - startTime) / 1000).toFixed(1); }
  function log(tag, msg) { console.log(`[t=${ts()}s][${tag}] ${msg}`); }

  const metrics = {
    pageLoads: 0,
    hardReloads: 0,
    reloadCalls: 0,
    sseTimeouts: 0,
    sseDisconnects: 0,
    sseReconnects: 0,
    sseHeartbeats: 0,
    consoleSSE: [],
    consoleAll: [],
  };

  // 注入监控脚本
  await page.addInitScript(() => {
    window.__testData = {
      reloadCalls: 0,
      lastHeartbeatTime: 0,
      heartbeatCount: 0,
    };
    // 检测 location.reload 调用
    const origReload = window.location.reload.bind(window.location);
    window.location.reload = function() {
      window.__testData.reloadCalls++;
      console.log(`[SSE-TEST] window.location.reload() called (#${window.__testData.reloadCalls})`);
      return origReload();
    };
  });

  // console 捕获
  page.on('console', msg => {
    const text = msg.text();
    metrics.consoleAll.push(`[t=${ts()}s] ${text}`);
    if (text.includes('[SSE]')) {
      metrics.consoleSSE.push(`[t=${ts()}s] ${text}`);
      if (text.includes('Heartbeat timeout')) { metrics.sseTimeouts++; }
      if (text.includes('reconnecting') || text.includes('disconnected') || text.includes('connection appears dead')) {
        metrics.sseDisconnects++;
      }
      if (text.includes('server.connected')) { metrics.sseReconnects++; }
    }
    if (text.includes('[SSE-TEST]')) {
      metrics.consoleSSE.push(`[t=${ts()}s] ${text}`);
    }
  });

  // 页面导航
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      metrics.pageLoads++;
      log('NAV', `Page load #${metrics.pageLoads}: ${frame.url().substring(0,90)}`);
    }
  });

  // 页面错误
  page.on('pageerror', err => {
    log('JS_ERR', err.message.substring(0,120));
  });

  // 请求失败
  page.on('requestfailed', req => {
    const u = req.url();
    if (u.includes('event') || u.includes('api')) {
      log('REQ_FAIL', `${u.substring(0,80)}: ${req.failure()?.errorText}`);
    }
  });

  // ====== 步骤1: 访问页面 → 应被重定向到 /_login ======
  log('STEP', 'Navigating to ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // 检查是否在登录页
  const currentUrl = page.url();
  log('URL', `After goto: ${currentUrl}`);

  if (currentUrl.includes('/_login')) {
    log('STEP', 'Detected login page, filling in password...');

    // 截个登录页面的截图
    await page.screenshot({ path: `/tmp/opencode/login_page_${Date.now()}.png` });
    log('SCREENSHOT', 'Login page captured');

    // 填写密码 - 门房的登录框 name 是 "access_pwd"
    await page.fill('input[name="access_pwd"]', password);
    log('STEP', 'Password filled');

    // 点击登录按钮（不要勾选"保持登录"，让它用 session cookie）
    await page.click('button[type="submit"]');
    log('STEP', 'Login submitted');

    // 等待登录完成，重定向回首页
    await page.waitForTimeout(2000);
    const urlAfterLogin = page.url();
    log('URL', `After login: ${urlAfterLogin}`);

    if (urlAfterLogin.includes('/_login')) {
      log('LOGIN_ERR', 'Still on login page — password may be wrong');
    } else {
      log('LOGIN_OK', 'Login successful!');
    }
  } else {
    log('STEP', 'No login redirect — already at app');
  }

  // ====== 步骤2: 等待应用加载 ======
  try {
    await page.waitForSelector('#root', { timeout: 5000 });
    log('LOAD', 'React root mounted');
  } catch {
    log('LOAD', 'Waiting for app to initialize...');
    await page.waitForTimeout(3000);
  }

  // 检查页面标题
  try {
    const title = await page.title();
    log('TITLE', `Page title: ${title}`);
  } catch {}

  // ====== 步骤3: 观察阶段 ======
  log('WATCH', `Observing for ${OBSERVE_SEC}s...`);

  // 定期检查页面状态
  const perfInterval = setInterval(async () => {
    try {
      // 检查 performance navigation type
      const info = await page.evaluate(() => {
        const entries = performance.getEntriesByType('navigation');
        const navType = entries.length > 0 ? entries[0].type : 'unknown';
        const testData = window.__testData || {};
        return {
          navType,
          reloadCalls: testData.reloadCalls,
          heartbeatCount: testData.heartbeatCount,
        };
      });
      if (info.navType === 'reload' && metrics.hardReloads < 999) {
        // Avoid counting duplicates
        if (metrics.lastNavType !== 'reload') {
          metrics.hardReloads++;
          log('PERF', `HARD RELOAD detected! (performance nav type = reload)`);
        }
      }
      metrics.lastNavType = info.navType;
      if (info.reloadCalls > metrics.reloadCalls) {
        metrics.reloadCalls = info.reloadCalls;
        log('PERF', `window.location.reload() called (total: ${info.reloadCalls})`);
      }
    } catch (e) {
      // page might have navigated away
    }
  }, 2000);

  // 等待观察时间
  await new Promise(r => setTimeout(r, OBSERVE_SEC * 1000));
  clearInterval(perfInterval);

  // ====== 步骤4: 收集最终数据 ======
  try {
    const finalData = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation');
      return {
        navType: entries.length > 0 ? entries[0].type : 'unknown',
        reloadCalls: window.__testData?.reloadCalls || 0,
        heartbeatCount: window.__testData?.heartbeatCount || 0,
      };
    });
    metrics.finalNavType = finalData.navType;
    metrics.reloadCalls = Math.max(metrics.reloadCalls, finalData.reloadCalls);
    log('FINAL', `Navigation type: ${finalData.navType}, reload() calls: ${finalData.reloadCalls}`);
  } catch (e) {
    log('COLLECT_ERR', e.message);
  }

  await browser.close();

  // ====== 输出结果 ======
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const hasReload = metrics.pageLoads > 1 || metrics.hardReloads > 0 || metrics.reloadCalls > 0;
  const hasSSEIssue = metrics.sseDisconnects > 0 || metrics.sseTimeouts > 0;

  console.log(`\n┌────────────────────────────────────────────────┐`);
  console.log(`│  RESULTS: ${label.padEnd(39)}│`);
  console.log(`├────────────────────────────────────────────────┤`);
  console.log(`│  Duration:         ${String(duration).padStart(8)}s              │`);
  console.log(`│  Page loads:       ${String(metrics.pageLoads).padStart(8)}              │`);
  console.log(`│  Hard reloads:     ${String(metrics.hardReloads).padStart(8)}              │`);
  console.log(`│  window.reload():  ${String(metrics.reloadCalls).padStart(8)}              │`);
  console.log(`│  SSE disconnects:  ${String(metrics.sseDisconnects).padStart(8)}              │`);
  console.log(`│  SSE timeouts:     ${String(metrics.sseTimeouts).padStart(8)}              │`);
  console.log(`│  SSE reconnects:   ${String(metrics.sseReconnects).padStart(8)}              │`);
  console.log(`└────────────────────────────────────────────────┘`);

  if (hasReload) {
    console.log(`\n  ❌ PAGE RELOAD(S) DETECTED`);
  } else if (hasSSEIssue) {
    console.log(`\n  ⚠️ SSE instability (no page reload)`);
  } else {
    console.log(`\n  ✅ STABLE — no issues detected`);
  }

  // 打印 SSE 相关日志
  if (metrics.consoleSSE.length > 0) {
    console.log(`\n  --- SSE/Test console events ---`);
    metrics.consoleSSE.forEach(l => console.log(`  ${l}`));
  }

  return { ...metrics, duration, hasReload, hasSSEIssue };
}

async function testDirect(label, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TEST: ${label}`);
  console.log(`  URL:  ${url}`);
  console.log(`${'='.repeat(60)}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  const startTime = Date.now();
  function ts() { return ((Date.now() - startTime) / 1000).toFixed(1); }
  function log(tag, msg) { console.log(`[t=${ts()}s][${tag}] ${msg}`); }

  const metrics = {
    pageLoads: 0, hardReloads: 0, reloadCalls: 0,
    sseTimeouts: 0, sseDisconnects: 0, sseReconnects: 0, sseHeartbeats: 0,
    consoleSSE: [], consoleAll: [],
  };

  await page.addInitScript(() => {
    window.__testData = { reloadCalls: 0, lastHeartbeatTime: 0, heartbeatCount: 0 };
    const origReload = window.location.reload.bind(window.location);
    window.location.reload = function() {
      window.__testData.reloadCalls++;
      console.log(`[SSE-TEST] window.location.reload() called (#${window.__testData.reloadCalls})`);
      return origReload();
    };
  });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[SSE]')) {
      metrics.consoleSSE.push(`[t=${ts()}s] ${text}`);
      if (text.includes('Heartbeat timeout')) metrics.sseTimeouts++;
      if (text.includes('reconnecting') || text.includes('disconnected') || text.includes('connection appears dead')) metrics.sseDisconnects++;
      if (text.includes('server.connected')) metrics.sseReconnects++;
    }
    if (text.includes('[SSE-TEST]')) metrics.consoleSSE.push(`[t=${ts()}s] ${text}`);
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      metrics.pageLoads++;
      log('NAV', `Page load #${metrics.pageLoads}: ${frame.url().substring(0,90)}`);
    }
  });

  page.on('pageerror', err => log('JS_ERR', err.message.substring(0,120)));

  log('STEP', 'Navigating to ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  log('URL', `After goto: ${page.url()}`);

  try {
    await page.waitForSelector('#root', { timeout: 5000 });
    log('LOAD', 'React root mounted');
  } catch { await page.waitForTimeout(3000); }

  try { log('TITLE', `Page title: ${await page.title()}`); } catch {}

  log('WATCH', `Observing for ${OBSERVE_SEC}s...`);

  const perfInterval = setInterval(async () => {
    try {
      const info = await page.evaluate(() => {
        const entries = performance.getEntriesByType('navigation');
        return {
          navType: entries.length > 0 ? entries[0].type : 'unknown',
          reloadCalls: window.__testData?.reloadCalls || 0,
        };
      });
      if (info.navType === 'reload' && metrics.lastNavType !== 'reload') {
        metrics.hardReloads++;
        log('PERF', `HARD RELOAD detected!`);
      }
      metrics.lastNavType = info.navType;
      if (info.reloadCalls > metrics.reloadCalls) {
        metrics.reloadCalls = info.reloadCalls;
        log('PERF', `window.location.reload() called (total: ${info.reloadCalls})`);
      }
    } catch {}
  }, 2000);

  await new Promise(r => setTimeout(r, OBSERVE_SEC * 1000));
  clearInterval(perfInterval);

  try {
    const finalData = await page.evaluate(() => ({
      navType: performance.getEntriesByType('navigation').length > 0 ? performance.getEntriesByType('navigation')[0].type : 'unknown',
      reloadCalls: window.__testData?.reloadCalls || 0,
    }));
    metrics.reloadCalls = Math.max(metrics.reloadCalls, finalData.reloadCalls);
  } catch {}

  await browser.close();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const hasReload = metrics.pageLoads > 1 || metrics.hardReloads > 0 || metrics.reloadCalls > 0;
  const hasSSEIssue = metrics.sseDisconnects > 0 || metrics.sseTimeouts > 0;

  console.log(`\n┌────────────────────────────────────────────────┐`);
  console.log(`│  RESULTS: ${label.padEnd(39)}│`);
  console.log(`├────────────────────────────────────────────────┤`);
  console.log(`│  Duration:         ${String(duration).padStart(8)}s              │`);
  console.log(`│  Page loads:       ${String(metrics.pageLoads).padStart(8)}              │`);
  console.log(`│  Hard reloads:     ${String(metrics.hardReloads).padStart(8)}              │`);
  console.log(`│  window.reload():  ${String(metrics.reloadCalls).padStart(8)}              │`);
  console.log(`│  SSE disconnects:  ${String(metrics.sseDisconnects).padStart(8)}              │`);
  console.log(`│  SSE timeouts:     ${String(metrics.sseTimeouts).padStart(8)}              │`);
  console.log(`│  SSE reconnects:   ${String(metrics.sseReconnects).padStart(8)}              │`);
  console.log(`└────────────────────────────────────────────────┘`);

  if (hasReload) {
    console.log(`\n  ❌ PAGE RELOAD(S) DETECTED`);
  } else if (hasSSEIssue) {
    console.log(`\n  ⚠️ SSE instability (no page reload)`);
  } else {
    console.log(`\n  ✅ STABLE — no issues detected`);
  }

  if (metrics.consoleSSE.length > 0) {
    console.log(`\n  --- SSE/Test console events ---`);
    metrics.consoleSSE.forEach(l => console.log(`  ${l}`));
  }

  return { ...metrics, duration, hasReload, hasSSEIssue };
}

// =====================================
// MAIN
// =====================================
console.log(`\nSSE Page Reload Test v3`);
console.log(`Observation: ${OBSERVE_SEC}s per URL`);

const r1 = await testGatehouse(
  'code.9997664.xyz (via gatehouse, real login)',
  'https://code.9997664.xyz',
  GATEHOUSE_PWD,
);

const r2 = await testDirect(
  'coded.9997664.xyz (direct)',
  'https://coded.9997664.xyz',
);

console.log(`\n${'='.repeat(60)}`);
console.log(`  FINAL COMPARISON`);
console.log(`${'='.repeat(60)}`);
console.log(``);
console.log(`                    Gatehouse     Direct`);
console.log(`                    (code)        (coded)`);
console.log(`──────────────────────────────────────────────`);
console.log(`Page loads:        ${String(r1.pageLoads).padStart(8)}    ${String(r2.pageLoads).padStart(8)}`);
console.log(`Hard reloads:      ${String(r1.hardReloads).padStart(8)}    ${String(r2.hardReloads).padStart(8)}`);
console.log(`window.reload():   ${String(r1.reloadCalls).padStart(8)}    ${String(r2.reloadCalls).padStart(8)}`);
console.log(`SSE disconnects:   ${String(r1.sseDisconnects).padStart(8)}    ${String(r2.sseDisconnects).padStart(8)}`);
console.log(`SSE timeouts:      ${String(r1.sseTimeouts).padStart(8)}    ${String(r2.sseTimeouts).padStart(8)}`);
console.log(``);

const summary = [];
if (r1.hasReload) summary.push('❌ Gatehouse: PAGE RELOADS');
else if (r1.hasSSEIssue) summary.push('⚠️ Gatehouse: SSE unstable');
else summary.push('✅ Gatehouse: Stable');

if (r2.hasReload) summary.push('❌ Direct: PAGE RELOADS');
else if (r2.hasSSEIssue) summary.push('⚠️ Direct: SSE unstable');
else summary.push('✅ Direct: Stable');

console.log(`VERDICT: ${summary.join(' | ')}`);
