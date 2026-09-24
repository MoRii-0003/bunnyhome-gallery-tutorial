# Cyberboss adapter boundary

Gallery keeps its own provider contract. Its standalone example defaults to the existing Anthropic provider. An embedding application can select `AI_PROVIDER=external` and inject a provider implementing `replyAsCompanion({ message, image, memory, requestMetadata })` and `describeImageNeutral(image)`. In external mode Gallery does not require Anthropic credentials or instantiate the Anthropic provider.

`normalizeCyberbossImageAttachment(attachment)` accepts only image attachments with a local absolute path and an image MIME supplied in `contentType` or `mimeType`. It returns the stable Gallery input `{ absolutePath, mediaType, sourceKind }`. It does not infer MIME from an extension, read channel-specific properties, or connect to a Cyberboss HTTP endpoint. This contract alone is not an end-to-end Cyberboss integration.

```text
QQ / Telegram / WeChat
        ↓
Cyberboss saves the attachment
        ↓
prepared.attachments
        ↓
Gallery adapter
        ↓
Gallery visual memory
```

The expected next integration point is after `CyberbossApp.prepareIncomingMessageForRuntime()` has persisted attachments and before `buildRuntimeTurn()` / `resolveVisionContext()`.

Gallery does not create a second Codex process or copy Cyberboss's personality prompt. Cyberboss continues to own the real conversation runtime.
