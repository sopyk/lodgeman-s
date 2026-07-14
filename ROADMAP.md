# LodgeManS 开发计划 / ROADMAP

> 维护约定：
> - **待办条目**：实现/修复前保留 `- [ ]`，完成后改为 `- [x]` 并补 `实现于` / `修复于` 版本号。
> - **版本号**取自关于页显示值（当前 `v1.0.2`）。
> - **enhancement（功能/改进）**：标注「发现于」版本，完成后补「实现于」版本。
> - **bug（缺陷）**：标注「发现于」版本，修复后补「修复于」版本。

---

## 待办 / 计划 (Planned)

- [x] 未配置域名返回友好提示页，而非裸 404
  - 类型: enhancement
  - 发现于: v1.0.0
  - 实现于: v1.0.1
  - 描述: `matchRoute` 匹配不上 host 时，仅当 `admin_password` 为空才 302 跳到
    `/_admin/login`；一旦 `admin_password` 已设置，所有未登记域名一律返回 `404 Not Found`
    （如 `port.9997664.xyz` 的情况）。
  - 方案: `admin_password` 已设置且 host 未匹配时，返回友好页面「该域名未在 LodgeManS
     中配置，请联系管理员添加路由」（可复用 `/_admin` 样式），状态码保留 404，仅替换响应体。
     可选：页面上放一个指向 `/_admin` 的入口。

- [x] 密码输入框增加「显示/隐藏」切换按钮
  - 类型: enhancement
  - 发现于: v1.0.0
  - 实现于: v1.0.1
  - 描述: 登录页、管理员设置等涉及密码输入的表单，目前密码为 `type="password"`
     掩码显示，输错或核对时无法查看明文。
  - 方案: 在密码框旁增加眼睛图标/「显示」按钮，点击在 `password` 与 `text` 之间
     切换 `input.type`，便于核对输入。

- [x] `/assets/` 静态文件响应后未 return，导致后续 auth 逻辑二次写 headers 崩溃
  - 类型: bug
  - 发现于: v1.0.1
  - 修复于: v1.0.2
  - 描述: 浏览器请求 `/assets/` 下静态资源时，`fs.readFileSync` 成功发送 200 响应后没有
    `return`，执行继续落到 auth 重定向逻辑，再次 `res.writeHead` 触发
    `ERR_HTTP_HEADERS_SENT`，服务 crash 重启，页面白屏。
  - 修复方案: `server.js:62` 的 `res.end(data)` 后加一行 `return;`

---

## 已修复 Bug (Fixed)

（暂无）

---

## 已实现功能 (Done)

（暂无）
