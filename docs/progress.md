# 进度记录

## Phase 1 — 核心路由 + 认证 [已完成]

- [x] Host 头路由匹配
- [x] auth / auth_exempt 鉴权控制
- [x] 配置文件加载（YAML）
- [x] HTTP 反向代理
- [x] 登录页（密码 + 记住我 + 安全提示）
- [x] Session 创建与管理
- [x] /_logout（清除 cookie + session）
- [x] WebSocket 代理

## Phase 2 — 管理面板 [已完成]

- [x] 管理面板独立模块（src/admin.js）
- [x] 管理员登录（独立账号 + 独立 session）
- [x] 仪表盘（路由列表、session 列表、踢人、清空）
- [x] 路由添加表单（Host + 目标 + 鉴权 + 豁免路径）
- [x] 路由删除
- [x] 配置重载（从 YAML 重新读取）
- [x] 写回 routes.yaml（CRUD 持久化）

## Phase 3 — 安全加固 [已完成]

- [x] 密码自动哈希（scrypt，启动时自动升级明文密码）
- [x] CLI 工具（node scripts/hash-password.js <password>）
- [ ] ~~登录失败锁定~~（用户不要求限制尝试次数）
- [x] 审计日志（data/audit.log）
  - 认证事件：LOGIN_OK / LOGIN_FAIL / LOGIN_LOCK / LOGOUT
  - 管理事件：ADMIN_LOGIN_OK / ADMIN_LOGOUT
  - 路由操作：ROUTE_ADD / ROUTE_DEL
  - Session 操作：SESSION_KICK / SESSION_CLEAR
  - 配置操作：CONFIG_RELOAD

## Phase 4 — 后续扩展 [待定]

- [ ] 多用户
- [ ] OAuth/OIDC 登录
- [ ] Session 持久化（文件/Redis）
- [ ] 前端页面交互优化
