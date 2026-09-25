# Cyberboss Gallery adapter

Cyberboss owns the conversation runtime. Its inbound attachment integration passes persisted image attachments to the public Gallery Core entry at `examples/server/src/gallery/index.js`. Gallery does not launch another Codex process or copy Cyberboss's personality prompt.

```text
QQ / Telegram / WeChat
        ↓
Cyberboss saves the attachment
        ↓
prepared.attachments
        ↓
Gallery Integration
        ↓
local Gallery image and visual memory
```

`normalizeCyberbossImageAttachment(attachment)` accepts only an image attachment with a local absolute path and an image MIME type in `contentType` or `mimeType`. It does not infer MIME from the file extension or read channel-specific properties.

The Gallery web page is a local visual-memory manager. It reads the same LocalGalleryStore used by the adapter; it does not implement chat, image upload, account login, or a second conversation runtime.

Gallery's neutral vision settings can be changed through its local Settings page. `NeutralVision` reads the effective environment-plus-`settings.json` configuration immediately before each model request, so updates do not require restarting Cyberboss or rebuilding its Core instance.
