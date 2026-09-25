# 看过一次，就不会忘

**Cyberboss Gallery** 是本地视觉记忆管理页。Cyberboss 负责真实对话和图片接收；Gallery 保存图片、按 SHA-256 去重，并展示中性画面描述、首次印象和首次出现时的上下文。

页面只管理视觉记忆：浏览图片、看记忆字段、改标题，以及配置中性视觉描述模型。它没有聊天输入、图片上传、登录或“带去聊天”流程。

## 本地数据

默认数据目录是仓库根目录下的 `.cyberboss-state/gallery/`，可用 `CYBERBOSS_GALLERY_ROOT` 指定其他位置：

```text
<gallery-root>/
├── images/<sha256>.<ext>
├── meta/<sha256>.json
├── claims/<sha256>.json
├── candidates/<uuid>.json
└── settings.json
```

相同文件内容只会有一条记录。标题、首次印象和首次上下文由 Cyberboss 当前真实对话写入；中性视觉 worker 只写 `first_description`。Gallery 页面改名只覆盖 `title`。

## 运行

```bash
cp examples/server/.env.example examples/server/.env
npm install
npm run dev:server
```

另开终端启动 Vite：

```bash
npm run dev:web
```

访问 `http://127.0.0.1:5173`。开发服务器把 `/api` 转发到 `127.0.0.1:8787`。服务端默认只监听回环地址；可用 `CYBERBOSS_GALLERY_WEB_HOST` 和 `CYBERBOSS_GALLERY_WEB_PORT` 调整。

生产静态页面使用同一个 Express 服务：

```bash
npm run build
npm --workspace @gallery-example/server start
```

## 视觉描述模型

可以在设置页填写 API Base URL、API Key、Model 和 Timeout。设置保存到 `<gallery-root>/settings.json`；API Key 不会返回给浏览器。每次视觉请求都会读取当前设置，更新模型后无需重启 Gallery 或 Cyberboss。

也可以只用环境变量，不开设置页：

```dotenv
CYBERBOSS_GALLERY_VISION_BASE_URL=
CYBERBOSS_GALLERY_VISION_API_KEY=
CYBERBOSS_GALLERY_VISION_MODEL=
CYBERBOSS_GALLERY_VISION_TIMEOUT_MS=30000
```

环境变量作为默认值，`settings.json` 中已保存的值优先。

## 接入 Cyberboss

Gallery Core 是 Cyberboss 的可选集成。Cyberboss 仍负责 Telegram、QQ、微信等渠道的真实对话和 runtime；Gallery 不会启动第二个模型会话，也不会复制 Cyberboss 的人格提示词。

### 运行位置与共享目录

Cyberboss 和 Gallery Core 必须能访问同一台机器上的 Gallery Core 文件及 Gallery 数据目录。建议把图库放在 Cyberboss state 目录下：

```text
<CYBERBOSS_STATE_DIR>/gallery/
├── images/
├── meta/
├── claims/
├── candidates/
└── settings.json
```

`CYBERBOSS_GALLERY_CORE_PATH` 指向本仓库公开入口所在目录，也就是 `examples/server/src/gallery/`；不要指向仓库根目录，也不要把 Gallery 源码复制进 Cyberboss。

在 Cyberboss 的运行环境中配置：

```dotenv
CYBERBOSS_GALLERY_ENABLED=true
CYBERBOSS_GALLERY_CORE_PATH=/absolute/path/to/bunnyhome-gallery-tutorial/examples/server/src/gallery
CYBERBOSS_GALLERY_ROOT=/absolute/path/to/cyberboss-state/gallery
```

Windows 示例：

```dotenv
CYBERBOSS_GALLERY_CORE_PATH=X:/path/to/bunnyhome-gallery-tutorial/examples/server/src/gallery
CYBERBOSS_GALLERY_ROOT=X:/path/to/cyberboss-state/gallery
```

Linux 示例：

```dotenv
CYBERBOSS_GALLERY_CORE_PATH=/path/to/bunnyhome-gallery-tutorial/examples/server/src/gallery
CYBERBOSS_GALLERY_ROOT=/path/to/cyberboss-state/gallery
```

把 `CYBERBOSS_GALLERY_ROOT` 改成该 Cyberboss 实例实际使用的 state 目录下的 `gallery` 路径。不要照抄示例路径。Gallery Web Server 也必须设置完全相同的 `CYBERBOSS_GALLERY_ROOT`，否则网页和 Cyberboss 会读写两份不同的图库。

未启用时（默认 `CYBERBOSS_GALLERY_ENABLED=false`），Cyberboss 不加载 Gallery Core，也不检查 Core 路径；Gallery 仓库可以不存在。启用后如果 Core 路径无效或加载失败，Gallery 操作会告警并让 Cyberboss 的正常消息处理继续。

### 启动本地图库页面

在 Gallery 仓库的 `examples/server/.env` 中设置 Web Server 配置，并让它使用与 Cyberboss 完全一致的 Gallery root：

```dotenv
CYBERBOSS_GALLERY_ROOT=/absolute/path/to/cyberboss-state/gallery
CYBERBOSS_GALLERY_WEB_HOST=127.0.0.1
CYBERBOSS_GALLERY_WEB_PORT=8787
```

```bash
npm install
npm run build
npm --workspace @gallery-example/server start
```

页面默认只监听本机 `127.0.0.1:8787`。它没有公网认证，不要把 Web Server 直接暴露到公网。视觉 API 的 Base URL、Key、Model 和 Timeout 在页面“设置”中填写；Key 保存在共享 root 的 `settings.json`，不需要写入 Cyberboss 配置。Cyberboss 不需要配置 `CYBERBOSS_GALLERY_VISION_*` 才能使用页面里保存的视觉设置。

### 图片进入图库的实际流程

```text
渠道收到图片
→ Cyberboss 按 SHA-256 查询 Gallery
→ 已有记录：把标题和已有语义记忆放入当前 turn，不再把原图像素重复送入 runtime
→ 新图片：作为短期 candidate 保留，原图仍供当前 turn 查看
→ Cyberboss 当前对话模型认为值得长期记住时调用 cyberboss_gallery_remember
→ 保存标题、第一印象和当时的文字上下文，再由 NeutralVision 生成中性画面描述
→ 正式记录写入 images/ 和 meta/
```

普通图片到达本身不会创建正式图库记录，也不会触发视觉模型。没有调用保存工具的新图只会作为短期 candidate；Telegram 原生 sticker 会跳过 Gallery。再次收到已保存的同一图片时，Cyberboss 使用 SHA-256 找到原记录并提供语义记忆。Gallery 的视觉描述模型只负责 `first_description`；标题和第一印象由当前 Cyberboss turn 提供。

## API

- `GET /api/gallery` — 返回图片墙需要的元数据，不包含磁盘路径。
- `GET /api/gallery/:id/image` — 按 SHA id 读取本地原图。
- `PATCH /api/gallery/:id` — 只允许更新 `title`。
- `GET /api/settings/vision` — 返回公开设置和 `apiKeyConfigured`，不返回 key。
- `PATCH /api/settings/vision` — 保存视觉模型设置；`apiKey` 留空会保留现有 key。

Web API 与静态页面同源。服务默认监听 `127.0.0.1`，本阶段没有公网认证。

## 验证

```bash
npm test
npm run build
npm run check
```

当前运行路径是本地 Cyberboss Gallery：Cyberboss 在收到图片时只做 SHA 查询；新图作为短期 candidate，只有 Cyberboss 当前对话调用保存工具后才进入 `images/` 和 `meta/`。`docs/01` 至 `docs/06` 保留原始教程阶段的设计记录；其中的 Supabase 和独立聊天流程不属于当前运行路径。

## License

代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE.md)。

*Bunny & Elliott ♡*
