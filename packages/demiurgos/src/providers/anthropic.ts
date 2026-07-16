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

    // Retry with exponential backoff for rate limits and transient errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
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
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRateLimit = lastError.message.includes('429') || lastError.message.includes('rate');
        const isTransient = lastError.message.includes('500') || lastError.message.includes('503') || lastError.message.includes('overloaded');

        if ((isRateLimit || isTransient) && attempt < 2) {
          const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
          console.log(`  [retry] Anthropic ${isRateLimit ? 'rate limited' : 'transient error'}, waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Anthropic generation failed after retries');
  }

  async isAvailable(): Promise<boolean> {
    // Reject empty keys and obvious placeholders like "sk-ant-..."
    return env.anthropicApiKey.length > 20 && !env.anthropicApiKey.includes('...');
  }
}
