// ============================================================
// DEMIURGOS — Mock Provider (For Testing)
// Returns predictable responses without calling any API
// ============================================================

import { BaseProvider } from './base.js';
import type { ProviderResponse, GenerateOptions } from '../types.js';

export interface MockResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export class MockProvider extends BaseProvider {
  name = 'mock';
  private responses: MockResponse[];
  private callIndex = 0;
  private _available: boolean;
  public calls: { prompt: string; systemPrompt?: string; options?: GenerateOptions }[] = [];

  constructor(responses: MockResponse[] = [], available = true) {
    super();
    this.responses = responses;
    this._available = available;
  }

  async generate(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<ProviderResponse> {
    this.calls.push({ prompt, systemPrompt, options });

    const response = this.responses[this.callIndex % this.responses.length] ?? {
      content: `Mock response to: ${prompt.slice(0, 50)}`,
      inputTokens: 100,
      outputTokens: 50,
    };
    this.callIndex++;

    return {
      content: response.content,
      inputTokens: response.inputTokens ?? 100,
      outputTokens: response.outputTokens ?? 50,
      model: options?.model ?? 'mock-model',
    };
  }

  async isAvailable(): Promise<boolean> {
    return this._available;
  }

  setAvailable(available: boolean): void {
    this._available = available;
  }

  reset(): void {
    this.callIndex = 0;
    this.calls = [];
  }
}

// --- Pre-built mock responses for common test scenarios ---

export const mockResponses = {
  simple: {
    content: 'The answer is 4. This is a basic arithmetic operation: 2 + 2 = 4.',
    inputTokens: 20,
    outputTokens: 15,
  },
  detailed: {
    content: `Based on USDA guidelines for poultry operations, a 500 GPM irrigation system requires a centrifugal pump rated at 25 HP minimum. The recommended model is a standard ANSI pump with a cast iron casing.

Key specifications:
- Flow rate: 500 GPM
- Total dynamic head: 80-100 ft
- Motor: 25 HP, 3-phase, 1750 RPM
- Efficiency: 75-80%

Source: USDA Natural Resources Conservation Service, Irrigation Guide (2023).`,
    inputTokens: 150,
    outputTokens: 120,
  },
  evaluatorPass: {
    content: '{"accuracy": 0.85, "completeness": 0.80, "relevance": 0.90, "actionability": 0.75, "specificity": 0.80}',
    inputTokens: 50,
    outputTokens: 30,
  },
  evaluatorFail: {
    content: '{"accuracy": 0.30, "completeness": 0.20, "relevance": 0.40, "actionability": 0.25, "specificity": 0.20}',
    inputTokens: 50,
    outputTokens: 30,
  },
  coherenceHigh: {
    content: '{"chain_integrity": 0.90, "consistency": 0.85, "counter_argument_resilience": 0.80, "track_record": 0.75}',
    inputTokens: 50,
    outputTokens: 30,
  },
  coherenceLow: {
    content: '{"chain_integrity": 0.30, "consistency": 0.40, "counter_argument_resilience": 0.20, "track_record": 0.25}',
    inputTokens: 50,
    outputTokens: 30,
  },
};
