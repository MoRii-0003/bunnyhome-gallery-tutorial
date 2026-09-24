import assert from 'node:assert/strict';
import test from 'node:test';
import { AnthropicProvider, NEUTRAL_VISION_PROMPT, SAVE_METADATA_TOOL } from '../src/providers/anthropic-provider.js';
import { createProvider } from '../src/providers/index.js';
import { loadConfig } from '../src/config.js';

test('AnthropicProvider preserves the original prompt, tool schema, and metadata extraction', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return new Response(JSON.stringify({
      content: [
        { type: 'text', text: '  我会把这张照片留在这里。  ' },
        { type: 'tool_use', name: 'save_gallery_metadata', input: { title: '窗边的光', first_impression: '看见时觉得很宁静。' } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const provider = new AnthropicProvider({
      anthropicApiKey: 'test-key', anthropicModel: 'test-model', companionSystemPrompt: '原 companion prompt',
    });
    const result = await provider.replyAsCompanion({ message: '收下这张', requestMetadata: true });
    assert.deepEqual(result, {
      reply: '我会把这张照片留在这里。',
      metadata: { title: '窗边的光', first_impression: '看见时觉得很宁静。' },
    });
    assert.equal(requests[0].system, '原 companion prompt');
    assert.deepEqual(requests[0].tools, [SAVE_METADATA_TOOL]);
    assert.equal(requests[0].tool_choice.type, 'auto');
    assert.ok(NEUTRAL_VISION_PROMPT.includes('directly visible facts'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AnthropicProvider preserves the original neutral vision request', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: '画面中央有一只白色杯子，桌面为浅棕色，左侧有自然光。' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const provider = new AnthropicProvider({ anthropicApiKey: 'test-key', anthropicModel: 'test-model' });
    assert.equal(await provider.describeImageNeutral({ mediaType: 'image/png', base64: 'aGVsbG8=' }), '画面中央有一只白色杯子，桌面为浅棕色，左侧有自然光。');
    assert.equal(request.system, NEUTRAL_VISION_PROMPT);
    assert.equal(request.max_tokens, 400);
    assert.equal(request.temperature, 0.1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('external mode creates no Anthropic provider and needs no Anthropic credentials', () => {
  assert.equal(createProvider({ aiProvider: 'external' }), null);
});

test('external configuration does not require Anthropic environment variables', () => {
  const names = ['AI_PROVIDER', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.AI_PROVIDER = 'external';
    process.env.SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    const config = loadConfig();
    assert.equal(config.aiProvider, 'external');
    assert.equal(config.anthropicApiKey, '');
    assert.equal(config.anthropicModel, '');
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
