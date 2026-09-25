# 看过一次，就不会忘

**Cyberboss Gallery** 是本地视觉记忆管理页。Cyberboss 负责真实对话和图片接收；Gallery 保存图片、按 SHA-256 去重，并展示中性画面描述、首次印象和首次出现时的上下文。

页面只管理视觉记忆：浏览图片、看记忆字段、改标题，以及配置中性视觉描述模型。它没有聊天输入、图片上传、登录或“带去聊天”流程。

## 它由什么组成

当前仓库是一套可以独立运行、也可以接入 Cyberboss 的本地 Gallery 实现：

```text
bunnyhome-gallery-tutorial/
├── README.md
├── LICENSE.md
├── SECURITY.md
├── package.json
├── docs/
│   ├── 01-storage.md
│   ├── 02-first-save.md
│   ├── 03-image-reuse.md
│   ├── 04-gallery-ui.md
│   ├── 05-chat-integration.md
│   ├── 06-supabase-security.md
│   └── 07-cyberboss-adapter.md
└── examples/
    ├── server/
    │   ├── .env.example
    │   ├── src/
    │   │   ├── server.js
    │   │   ├── adapters/
    │   │   └── gallery/
    │   │       ├── index.js
    │   │       ├── local-gallery-store.js
    │   │       ├── gallery-candidates.js
    │   │       ├── gallery-settings-store.js
    │   │       ├── image-ingest.js
    │   │       ├── image-inspect.js
    │   │       └── neutral-vision.js
    │   └── test/
    └── web/
        ├── src/
        │   ├── App.jsx
        │   ├── api.js
        │   ├── components/
        │   └── pages/
        └── vite.config.js
```

几个目录的职责：

- `examples/server/src/gallery/`：Gallery Core。图片去重、candidate、正式保存、元数据、设置和 neutral vision 都在这里。Cyberboss 接入时加载的就是这一层。
- `examples/server/src/server.js`：Gallery Web/API Server。提供 `/api/gallery`、设置接口、原图读取和生产静态页。
- `examples/web/`：React/Vite 管理页面，只负责浏览与修改 Gallery 数据，不负责真实聊天。
- `docs/`：教程和设计记录。当前实际运行路径以 README 和 `docs/07-cyberboss-adapter.md` 为准；`docs/01` 至 `docs/06` 中的 Supabase、独立聊天等内容属于早期教程阶段，不等于当前 Cyberboss Gallery 的部署方式。

## 运行要求

- Node.js **20 或更高版本**
- npm
- Gallery Server 对 `CYBERBOSS_GALLERY_ROOT` 有读写权限
- 如果接入 Cyberboss，Cyberboss 进程还必须能读取本仓库的 `examples/server/src/gallery/`，并读写同一个 Gallery Root

可以先检查：

```bash
node --version
npm --version
```

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

正式部署时建议把 Gallery Root 放在代码仓库之外，或者放进 Cyberboss 自己的 state 目录。这样更新、重拉或替换 Gallery 代码时不会碰真实图片和记忆数据。

## 安装

### 1. 拉取代码

```bash
git clone https://github.com/MoRii-0003/bunnyhome-gallery-tutorial.git
cd bunnyhome-gallery-tutorial
```

如果已经有仓库，更新代码即可：

```bash
git pull
```

### 2. 安装依赖

仓库使用 npm workspaces：

```bash
npm install
```

### 3. 准备环境变量

```bash
cp examples/server/.env.example examples/server/.env
```

默认示例：

```dotenv
CYBERBOSS_GALLERY_ROOT=.cyberboss-state/gallery
CYBERBOSS_GALLERY_WEB_HOST=127.0.0.1
CYBERBOSS_GALLERY_WEB_PORT=8787

CYBERBOSS_GALLERY_VISION_BASE_URL=
CYBERBOSS_GALLERY_VISION_API_KEY=
CYBERBOSS_GALLERY_VISION_MODEL=
CYBERBOSS_GALLERY_VISION_TIMEOUT_MS=30000
```

只想先打开页面时，可以先不填写视觉模型。

## 怎么使用

Gallery 有两种常见运行方式。

### 方式 A：只运行本地 Gallery 页面

适合先看 UI、浏览已有 Gallery Root 或调试 Gallery 本身。

启动 API Server：

```bash
npm run dev:server
```

另开终端启动 Vite：

```bash
npm run dev:web
```

访问：

```text
http://127.0.0.1:5173
```

开发服务器把 `/api` 转发到 `127.0.0.1:8787`。

页面里可以：

- 浏览已正式保存的图片；
- 查看标题、首次印象、首次上下文和中性视觉描述；
- 修改标题；
- 配置 Neutral Vision 的 Base URL、API Key、Model 和 Timeout。

页面本身**不能上传图片，也不会创建 Cyberboss 对话**。要让新图片进入长期图库，需要走 Cyberboss 的真实图片链路。

### 方式 B：接入 Cyberboss

这是当前主要运行方式。

Cyberboss 负责：

- Telegram、QQ、微信等真实消息入口；
- 当前对话和 runtime；
- 判断图片是否值得长期保存；
- 调用 Gallery 保存工具；
- 已保存图片再次出现时，把旧 Gallery 语义记忆放回当前 turn。

Gallery Core 负责：

- candidate；
- SHA-256 去重；
- 正式图片与元数据保存；
- neutral vision；
- Gallery 设置与文件存储。

Gallery 不启动第二套人格，也不复制 Cyberboss 对话。

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

构建并启动：

```bash
npm install
npm run build
npm --workspace @gallery-example/server start
```

生产模式下 Express 会同时提供 API 和构建后的静态页面，所以不需要再单独运行 Vite dev server。

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

## 生产部署建议

仓库不绑定某一种进程管理器。长期运行时，可以用 systemd、Docker、pm2 或其他现有守护方式运行：

```bash
npm --workspace @gallery-example/server start
```

无论用什么方式，都建议保持这些边界：

- Web Server 默认只监听 `127.0.0.1`。
- 如果需要从公网访问，先在外层加入你自己的认证和反向代理，不要直接暴露 `8787`。
- Gallery Web 与 Cyberboss 必须指向**完全相同**的 `CYBERBOSS_GALLERY_ROOT`。
- `CYBERBOSS_GALLERY_CORE_PATH` 指向 `examples/server/src/gallery/`，不是仓库根目录。
- 代码目录和 Gallery Root 尽量分开；更新代码前不要删除或覆盖真实 Gallery Root。
- `settings.json` 可能包含视觉服务 API Key，应和图片、元数据一样按私密数据处理。

### 更新代码

如果代码目录和 Gallery Root 已经分开，通常只需要：

```bash
git pull
npm install
npm run check
npm run build
```

然后重启承载 Gallery Server 的进程。

更新前建议备份 Gallery Root。最重要的数据是 `images/`、`meta/`、`claims/`、`candidates/` 和 `settings.json`，不要把“重新 clone 仓库”当成 Gallery 数据备份。

## API

- `GET /api/gallery` — 返回图片墙需要的元数据，不包含磁盘路径。
- `GET /api/gallery/:id/image` — 按 SHA id 读取本地原图。
- `PATCH /api/gallery/:id` — 只允许更新 `title`。
- `GET /api/settings/vision` — 返回公开设置和 `apiKeyConfigured`，不返回 key。
- `PATCH /api/settings/vision` — 保存视觉模型设置；`apiKey` 留空会保留现有 key。

Web API 与静态页面同源。服务默认监听 `127.0.0.1`，本阶段没有公网认证。

## 验证

改动或升级后可以跑：

```bash
npm test
npm run build
npm run check
```

其中 `npm run check` 会执行当前仓库的测试和 Web build。

当前运行路径是本地 Cyberboss Gallery：Cyberboss 在收到图片时只做 SHA 查询；新图作为短期 candidate，只有 Cyberboss 当前对话调用保存工具后才进入 `images/` 和 `meta/`。

## 常见误区 / 注意事项

- **Gallery 不是图片上传站。** 页面没有上传入口；正式图片来自 Cyberboss 的真实聊天链路。
- **新图不等于已保存。** 新图片先成为 candidate，只有保存工具真正执行后才进入长期图库。
- **重复图片不会重新看图。** 已保存图片再次出现时走 SHA 去重和旧语义记忆，不再重复把图片像素送给 runtime。
- **Neutral Vision 不写关系语义。** 它只负责中性画面描述 `first_description`；标题、首次印象和首次上下文来自真实 Cyberboss turn。
- **不要让 Web 与 Cyberboss 使用两个 Root。** 这是最容易出现“网页里怎么没有图”或“CB 明明保存了但页面看不到”的原因。
- **不要把 Gallery Server 直接开到公网。** 当前 API 没有自己的登录系统。
- **不要把代码仓库当数据目录。** 真正需要长期保存和备份的是 Gallery Root。
- **旧教程不等于当前运行架构。** `docs/01` 至 `docs/06` 记录了早期教程阶段；当前 Cyberboss 集成以 README、实际源码和 `docs/07-cyberboss-adapter.md` 为准。

## License

代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE.md)。

*Bunny & Elliott ♡*
