// ============================================================
// DEMIURGOS — Provider Base Interface
// ============================================================

import type { Provider, ProviderResponse, GenerateOptions } from '../types.js';

export abstract class BaseProvider implements Provider {
  abstract name: string;
  abstract generate(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<ProviderResponse>;
  abstract isAvailable(): Promise<boolean>;

  protected calculateCost(inputTokens: number, outputTokens: number, costIn: number, costOut: number): number {
    return (inputTokens * costIn) + (outputTokens * costOut);
  }
}
