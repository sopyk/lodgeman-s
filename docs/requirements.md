# Unified Auth Proxy — 需求文档

## 概述

轻量统一认证反向代理，为多个无鉴权或鉴权不便的内部服务提供统一的 cookie 认证入口。

## 功能需求

### F1: Host 路由
- 根据请求的 Host 头（二级域名）将流量路由到对应后端
- 每个路由独立配置 target 地址

### F2: 鉴权开关
- 每个路由可独立设置 `auth: true/false`
- `auth: true` 时默认所有路径受保护
- `auth_exempt` 列表声明免鉴权路径（如 `/api/*`、`/health`）
- 免鉴权路径直接透传，凭后端自身鉴权

### F3: 统一登录
- 所有受保护的后端共享一个登录入口
- 一次登录，cookie 在所有受保护域名下通用

### F4: 记住我 / 不记住我
- 登录页提供 checkbox
- 勾选 → 保存 30 天（可配置）
- 不勾选 → session cookie（关闭浏览器即失效）
- 勾选时提示："建议仅在私人设备上勾选保存"

### F5: 退出登录
- `/_logout` 端点
- 清除当前 session + cookie
- 明确提示已退出

### F6: 管理面板
- `/admin` 管理页面（需独立管理员账号登录）
- 路由管理：查看、添加、编辑、删除路由
- Session 管理：查看活跃 session、踢人、全局清空
- 服务发现：扫描本机端口推荐新服务

### F7: 安全性
- Cookie HttpOnly + SameSite=Lax
- 密码哈希存储
- 登录失败短时锁定
- 管理员与普通用户独立密码

## 部署位置

- Auth Proxy 监听 4082 端口
- 本机部署，仅 localhost 或 Tunnel 可访问
- systemd 用户服务

## 非功能需求

- 前端无关：兼容 Cloudflare Tunnel / Caddy / Nginx / 裸连
- 零外部依赖核心（仅 js-yaml 用于配置文件）
- 内存占用 < 50MB
- WebSocket 支持
