// ============================================================
// DEMIURGOS — Ollama Provider (Tier 1: FREE, Local)
// Uses raw HTTP — no npm dependency required
// ============================================================

import { BaseProvider } from './base.js';
import { env } from '../config.js';
import type { ProviderResponse, GenerateOptions } from '../types.js';

export class OllamaProvider extends BaseProvider {
  name = 'ollama';
  private baseUrl: string;
  private defaultModel: string;

  constructor(model = 'mistral') {
    super();
    this.baseUrl = env.ollamaBaseUrl;
    this.defaultModel = model;
  }

  async generate(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<ProviderResponse> {
    const model = options?.model ?? this.defaultModel;

    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      message: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.message.content,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      model,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json() as { models: { name: string }[] };
    return data.models.map(m => m.name);
  }
}
