// ============================================================
// DEMIURGOS — OpenAI Provider (Tier 2-3: GPT-4o-mini/GPT-4o)
// ============================================================

import OpenAI from 'openai';
import { BaseProvider } from './base.js';
import { env } from '../config.js';
import type { ProviderResponse, GenerateOptions } from '../types.js';

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  private client: OpenAI;
  private defaultModel: string;

  constructor(model = 'gpt-4o-mini') {
    super();
    this.client = new OpenAI({ apiKey: env.openaiApiKey });
    this.defaultModel = model;
  }

  async generate(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<ProviderResponse> {
    const model = options?.model ?? this.defaultModel;

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model,
    };
  }

  async isAvailable(): Promise<boolean> {
    // Reject empty keys and obvious placeholders like "sk-..."
    return env.openaiApiKey.length > 20 && !env.openaiApiKey.includes('...');
  }
}
