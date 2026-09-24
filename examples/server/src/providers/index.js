import { AnthropicProvider } from './anthropic-provider.js';

export function createProvider(config) {
  if (config.aiProvider === 'external') return null;
  if (config.aiProvider !== 'anthropic') throw new Error(`unsupported_ai_provider:${config.aiProvider}`);
  return new AnthropicProvider(config);
}
