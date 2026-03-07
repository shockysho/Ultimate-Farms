// ============================================================
// DEMIURGOS — Ollama Provider (Tier 1: FREE, Local)
// ============================================================

import { Ollama } from 'ollama';
import { BaseProvider } from './base.js';
import { env } from '../config.js';
import type { ProviderResponse, GenerateOptions } from '../types.js';

export class OllamaProvider extends BaseProvider {
  name = 'ollama';
  private client: Ollama;
  private defaultModel: string;

  constructor(model = 'mistral') {
    super();
    this.client = new Ollama({ host: env.ollamaBaseUrl });
    this.defaultModel = model;
  }

  async generate(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<ProviderResponse> {
    const model = options?.model ?? this.defaultModel;

    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat({
      model,
      messages,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
      },
    });

    return {
      content: response.message.content,
      inputTokens: response.prompt_eval_count ?? 0,
      outputTokens: response.eval_count ?? 0,
      model,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const list = await this.client.list();
    return list.models.map(m => m.name);
  }
}
