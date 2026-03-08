// ============================================================
// DEMIURGOS — Anthropic Provider (Tier 2-4: Haiku/Sonnet/Opus)
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';
import { env } from '../config.js';
import type { ProviderResponse, GenerateOptions } from '../types.js';

export class AnthropicProvider extends BaseProvider {
  name = 'anthropic';
  private client: Anthropic;
  private defaultModel: string;

  constructor(model = 'claude-haiku-4-5-20251001') {
    super();
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
    this.defaultModel = model;
  }

  async generate(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<ProviderResponse> {
    const model = options?.model ?? this.defaultModel;

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 4096,
      system: systemPrompt ?? 'You are Demiurgos, a precise and helpful AI assistant. Be specific, cite sources when possible, and clearly distinguish between verified facts and inferences.',
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? 0.7,
    });

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => {
        if (block.type === 'text') return block.text;
        return '';
      })
      .join('\n');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
    };
  }

  async isAvailable(): Promise<boolean> {
    // Reject empty keys and obvious placeholders like "sk-ant-..."
    return env.anthropicApiKey.length > 20 && !env.anthropicApiKey.includes('...');
  }
}
