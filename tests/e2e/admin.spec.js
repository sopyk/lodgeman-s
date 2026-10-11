// 管理面板 UI 冒烟测试（E2E，本机 Playwright + headless Chromium）
//
// 覆盖本次改动的 UI 面：路由表格「豁免路径」列展示、add/edit 表单「透传 Host」
// 复选框开/关及其「透传」徽标、删除路由。均在隔离配置（端口 4090）上运行。
// 鉴权：admin 登录走 /_admin/login（POST username/password），会话为内存 Map。
const { test, expect } = require('playwright/test');

const ADMIN = { username: 'e2eadmin', password: 'e2e-admin-pass' };
const HOST = `e2e-${Date.now()}`; // 每轮唯一 host，避免与历史遗留行冲突

async function loginAdmin(page) {
  await page.goto('/_admin/login');
  await page.fill('input[name="username"]', ADMIN.username);
  await page.fill('input[name="password"]', ADMIN.password);
  await Promise.all([
    page.waitForURL('**/_admin'),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
  // 确认登录成功已进入仪表盘
  await expect(page.getByRole('link', { name: '仪表盘' })).toBeVisible();
}

test('登录页时长下拉包含「1 年」选项（365 天）且不再有「永久」', async ({ page }) => {
  await page.goto('/_login');
  const sel = page.locator('select[name="duration"]');
  await expect(sel.locator('option[value="31536000"]')).toHaveText('1 年');
  // 「永久」措辞应已移除
  await expect(sel.locator('option', { hasText: '永久' })).toHaveCount(0);
});

test('仪表盘会话时间格式为 YYYY/M/D HH:mm:ss（24 小时制、无前导零、无 AM/PM）', async ({ page }) => {
  await loginAdmin(page);
  // 管理员登录本身产生一条会话，其创建/过期时间由 fmtTs 渲染
  const cells = page.locator('td[style*="nowrap"]');
  await expect(cells.first()).toBeVisible();
  const texts = await cells.allInnerTexts();
  expect(texts.length).toBeGreaterThan(0);
  for (const t of texts) {
    // 严格断言：年份 4 位、月/日去前导零、24 小时制
    expect(t).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}$/);
    expect(t).not.toMatch(/AM|PM/);
  }
});

// 通过添加路由表单新建一条路由（勾选 pass_host 与否由参数决定）
async function addRoute(page, { host, exempt = '', passHost = false, description = 'e2e route' }) {
  await page.getByRole('button', { name: /添加路由/ }).first().click(); // #addRouteToggle
  const form = page.locator('#addRouteForm');
  await expect(form).toBeVisible();
  await form.locator('input[name="host"]').fill(host);
  await form.locator('input[name="target"]').fill('127.0.0.1:8080');
  await form.locator('input[name="auth_exempt"]').fill(exempt);
  await form.locator('input[name="description"]').fill(description);
  if (passHost) await form.locator('input[name="pass_host"]').check();
  await Promise.all([
    page.waitForURL(/\/_admin$/),
    form.getByRole('button', { name: '添加' }).click(),
  ]);
}

function routeRow(page, host) {
  return page.locator('tr', { has: page.locator('a.route-host', { hasText: host }) });
}

test('管理员登录并进入仪表盘', async ({ page }) => {
  await loginAdmin(page);
  // 种子路由 e2e-seed.example 应出现在路由表
  await expect(page.locator('a.route-host', { hasText: 'e2e-seed.example' })).toBeVisible();
});

test('添加路由（透传 Host + 豁免路径）后表格正确展示', async ({ page }) => {
  await loginAdmin(page);
  const host = `${HOST}-add.example`;
  await addRoute(page, { host, exempt: '/api/*,/health', passHost: true, description: 'e2e add' });

  const row = routeRow(page, host);
  await expect(row).toBeVisible();
  // 列内容：Host / 目标 / 鉴权徽标+透传徽标 / 豁免路径 / 描述
  await expect(row.locator('a.route-host')).toHaveText(host);
  await expect(row.locator('span.badge', { hasText: '透传' })).toBeVisible();
  await expect(row.locator('.route-exempt')).toHaveText('/api/*, /health');
  await expect(row.locator('.route-desc')).toHaveText('e2e add');
});

test('豁免路径列为空的路由显示占位符 —', async ({ page }) => {
  await loginAdmin(page);
  // 种子路由 e2e-seed.example 未配置 auth_exempt → 显示「—」
  const row = routeRow(page, 'e2e-seed.example');
  await expect(row.locator('.route-exempt')).toHaveText('—');
  // 且种子路由未开启透传，不应出现「透传」徽标
  await expect(row.locator('span.badge', { hasText: '透传' })).toHaveCount(0);
});

test('编辑路由关闭透传 Host 后「透传」徽标消失', async ({ page }) => {
  await loginAdmin(page);
  const host = `${HOST}-edit.example`;
  await addRoute(page, { host, passHost: true });
  let row = routeRow(page, host);
  await expect(row.locator('span.badge', { hasText: '透传' })).toBeVisible();

  await row.getByRole('link', { name: '编辑' }).click();
  await page.waitForURL(/\?_edit=\d+/);
  const editForm = page.locator('form[action*="/_admin/routes/edit/"]');
  await editForm.locator('input[name="pass_host"]').uncheck();
  await Promise.all([
    page.waitForURL(/\/_admin$/),
    editForm.getByRole('button', { name: '保存' }).click(),
  ]);

  row = routeRow(page, host);
  await expect(row.locator('span.badge', { hasText: '透传' })).toHaveCount(0);
});

test('删除路由后行从表格消失（确认弹窗）', async ({ page }) => {
  await loginAdmin(page);
  const host = `${HOST}-del.example`;
  await addRoute(page, { host });
  const row = routeRow(page, host);
  await expect(row).toBeVisible();

  // 删除按钮的 onsubmit 里 confirm('确定删除「host」?')，需接受弹窗
  page.once('dialog', d => d.accept());
  await Promise.all([
    page.waitForURL(/\/_admin$/),
    row.getByRole('button', { name: '删除' }).click(),
  ]);
  await expect(page.locator('a.route-host', { hasText: host })).toHaveCount(0);
});