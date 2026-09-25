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

`docs/01` 至 `docs/06` 保留原始教程阶段的设计记录；其中的 Supabase 和聊天流程不属于当前 Cyberboss Gallery 运行路径。

## License

代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE.md)。

*Bunny & Elliott ♡*
