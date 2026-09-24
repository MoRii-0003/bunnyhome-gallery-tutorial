import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

test('createApp uses an injected external provider for chat without Anthropic configuration', async () => {
  const calls = [];
  const provider = {
    async replyAsCompanion(input) {
      calls.push(input);
      return { reply: '测试回复', metadata: null };
    },
    async describeImageNeutral() { return '测试客观描述'; },
  };
  const app = createApp({
    config: { aiProvider: 'external', webOrigin: 'http://localhost:5173' },
    provider,
    supabase: { auth: { async getUser() { return { data: { user: { id: 'test-user' } }, error: null }; } } },
    store: {},
  });
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ message: '你好' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: '测试回复', gallery_saved: null, gallery_error: null });
    assert.deepEqual(calls, [{ message: '你好', image: null, requestMetadata: false }]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
