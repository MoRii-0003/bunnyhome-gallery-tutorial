# 看过一次，就不会忘

> 一个面向 Cyberboss（CB）的本地视觉记忆 Gallery 适配版本。

图片在聊天里出现后，CB 可以把图片的持久化附件交给 Gallery：新图片进入短期 candidate，CB 当前对话决定是否保存；保存后 Gallery 按 SHA-256 去重、保留原图和记忆字段，并由 Neutral Vision 补充中性的画面描述。再次遇到已保存图片时，CB 可以读取已有语义记忆，避免重复处理同一份像素。

Gallery 页面负责浏览和管理这些视觉记忆，不负责聊天、收图或启动第二个人格。本文描述的是这个仓库的 **CB 适配版**；接入时，Cyberboss 运行端必须包含 Gallery adapter、工具注册和入站附件钩子。原版 Cyberboss 若没有这些改动，仅配置环境变量还不能启用 Gallery。

## 它解决什么

- 保存真实聊天中值得长期保留的图片，并用 SHA-256 对完全相同的文件去重。
- 将新图片先作为短期 candidate；只有 CB 当前对话调用保存工具后才成为正式记忆。
- 保存原图、标题、首次印象、首次上下文和中性的画面描述。
- 再次收到完全相同的图片时，CB 可使用已有语义记忆，避免重复送入原图。
- 提供本地 Gallery 页面，浏览图片和记忆、修改标题、配置 Neutral Vision。
- Gallery 不复制聊天记录、人格提示词或另一套模型会话。

## 一个重要的存储结论

Gallery 不需要专用数据库。它把原图和 JSON 元数据保存在一个本地 Gallery Root 中：

```text
<gallery-root>/
├── images/<sha256>.<ext>
├── meta/<sha256>.json
├── claims/<sha256>.json
├── candidates/<uuid>.json
└── settings.json
```

SHA-256 只识别字节完全相同的文件。重新压缩、缩放、截图或转换格式后的图片可能得到不同哈希；当前实现不提供感知去重。

`claims/` 用于并发保存时协调同一图片的创建；`candidates/` 保存尚未正式记入 Gallery 的短期候选；`settings.json` 保存本地视觉描述设置，可能含视觉服务 API Key。Gallery Root 应放在代码仓库之外，并按私人图片和凭据保护。

## 架构

```text
聊天渠道收到图片
        ↓
Cyberboss 保存本地附件并准备当前消息
        ↓
CB Gallery adapter 调用 Gallery Core
        ├─ 已保存图片：提供既有语义记忆
        └─ 新图片：创建 candidate，等待当前对话决定是否保存
                            ↓ 调用保存工具
Gallery Core 保存图片、元数据并去重
        ↓
Gallery Web/API Server 读取相同 Gallery Root
        ↓
本地 Gallery 页面浏览和管理记忆
```

Gallery Core 位于 `examples/server/src/gallery/`。Cyberboss adapter 通过该 Core 处理附件；Gallery Web/API Server 位于 `examples/server/src/server.js`，React 页面位于 `examples/web/`。CB 与 Web Server 必须配置同一个 `CYBERBOSS_GALLERY_ROOT`。

## 快速开始

### 1. 准备环境

- Node.js `>= 20`
- npm
- 本地 Gallery 页面需要 Gallery 仓库的读写权限
- CB 集成需要 Cyberboss 进程能读取 Gallery Core，并能读写共享 Gallery Root

### 2. 安装并配置 Gallery

```bash
git clone https://github.com/MoRii-0003/bunnyhome-gallery-tutorial.git
cd bunnyhome-gallery-tutorial
npm install
cp examples/server/.env.example examples/server/.env
```

`examples/server/.env` 的常用设置：

```dotenv
CYBERBOSS_GALLERY_ROOT=.cyberboss-state/gallery
CYBERBOSS_GALLERY_WEB_HOST=127.0.0.1
CYBERBOSS_GALLERY_WEB_PORT=8787

CYBERBOSS_GALLERY_VISION_BASE_URL=
CYBERBOSS_GALLERY_VISION_API_KEY=
CYBERBOSS_GALLERY_VISION_MODEL=
CYBERBOSS_GALLERY_VISION_TIMEOUT_MS=30000
```

不填写视觉模型也可以启动页面；此时不会生成新的中性画面描述。

### 3. 本地开发或启动 Gallery 页面

开发模式下分别启动 API 和 Vite 页面：

```bash
npm run dev:server
npm run dev:web
```

开发页面地址为 `http://127.0.0.1:5173`，API 默认监听 `127.0.0.1:8787`。

生产模式下构建并启动：

```bash
npm run build
npm --workspace @gallery-example/server start
```

生产模式由 Express 同时提供 API 和静态页面。默认只监听本机地址；当前 API 没有公网登录认证，不要直接暴露到公网。

### 4. 配置 Cyberboss 适配

CB 进程需要在其 `.env` 中设置：

```dotenv
CYBERBOSS_GALLERY_ENABLED=true
CYBERBOSS_GALLERY_CORE_PATH=/absolute/path/to/bunnyhome-gallery-tutorial/examples/server/src/gallery
CYBERBOSS_GALLERY_ROOT=/absolute/path/to/cyberboss-state/gallery
```

Windows 路径示例：

```dotenv
CYBERBOSS_GALLERY_CORE_PATH=X:/path/to/bunnyhome-gallery-tutorial/examples/server/src/gallery
CYBERBOSS_GALLERY_ROOT=X:/path/to/cyberboss-state/gallery
```

Linux 路径示例：

```dotenv
CYBERBOSS_GALLERY_CORE_PATH=/path/to/bunnyhome-gallery-tutorial/examples/server/src/gallery
CYBERBOSS_GALLERY_ROOT=/path/to/cyberboss-state/gallery
```

同时，把 Gallery Web Server 的 `CYBERBOSS_GALLERY_ROOT` 设为完全相同的目录。不要照抄示例路径。`CYBERBOSS_GALLERY_CORE_PATH` 必须指向 `examples/server/src/gallery/`，而不是仓库根目录。

**兼容性说明：** 这个 Gallery 仓库提供适配 CB 的 Core 接口和契约文档，但 CB 端也必须有对应实现：读取已持久化的入站图片附件、注册 Gallery 保存工具，并在消息流程中调用 Gallery adapter。若你的 Cyberboss 版本没有这些钩子，仅添加上述环境变量不会生效；请先移植或更新 CB 适配代码。适配约定见 [`docs/07-cyberboss-adapter.md`](docs/07-cyberboss-adapter.md)。

Gallery 未启用时应保持 CB 原消息流程不变；启用后若 Gallery 加载或处理失败，也应让 CB 正常处理当前消息并记录告警。

## 教程目录

当前 CB 集成约定：

- [Cyberboss Gallery adapter](docs/07-cyberboss-adapter.md)

早期教程和设计记录：

1. [存储设计](docs/01-storage.md)
2. [首次保存](docs/02-first-save.md)
3. [图片复用](docs/03-image-reuse.md)
4. [Gallery 页面](docs/04-gallery-ui.md)
5. [聊天集成设计](docs/05-chat-integration.md)
6. [早期 Supabase 示例的安全说明](docs/06-supabase-security.md)

`docs/01` 至 `docs/06` 描述较早阶段的教程或设计，不代表当前运行时依赖 Supabase。实际运行和 CB 接入方式以本文、当前源码与 `docs/07` 为准。

## 示例代码

- [`examples/server`](examples/server)：Gallery Core、本地 JSON 文件存储、图片去重、candidate 生命周期、Neutral Vision 和 Web/API Server。
- [`examples/web`](examples/web)：React/Vite Gallery 页面和 API 客户端。

Gallery 页面用于浏览和管理已有视觉记忆；它没有聊天输入、图片上传或独立的对话运行时。新图片应经由已接入 Gallery 的 Cyberboss 消息链路进入图库。

## 边界与取舍

- SHA-256 是文件级去重，不是“看起来相同”的图片识别。
- candidate 不等于已保存图片；只有 CB 调用保存工具并成功完成，图片才会写入正式的 `images/` 与 `meta/`。
- Neutral Vision 只生成中性的 `first_description`，不判断人物身份或关系；标题、首次印象和上下文由 CB 当前对话提供。
- 已保存图片再次出现时，Gallery 可以返回既有语义记忆，但有损描述不能替代重新查看原图。
- Web Server 默认只监听本机，API 没有自带登录系统；公网访问应由外层认证和反向代理保护。
- Gallery Root 包含私人图片、记忆和可能存在的 API Key；备份、权限和保留策略应按私人数据处理。

## API

- `GET /api/gallery` — 获取图片墙使用的元数据，不返回磁盘路径。
- `GET /api/gallery/:id/image` — 按 SHA id 读取原图。
- `PATCH /api/gallery/:id` — 更新标题。
- `GET /api/settings/vision` — 获取公开视觉设置和 `apiKeyConfigured`，不返回 API Key。
- `PATCH /api/settings/vision` — 更新视觉设置；API Key 留空时保留已保存的 Key。

## 验证

```bash
npm test
npm run build
npm run check
```

## License

代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE.md)。
