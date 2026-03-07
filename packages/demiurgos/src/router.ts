// ============================================================
// DEMIURGOS — Cost Router (Cheapest Viable Model First)
// ============================================================

import { models, complexityMinTier } from './config.js';
import { Tier, type ModelConfig, type Task, type Provider } from './types.js';
import { OllamaProvider } from './providers/ollama.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';

// --- Provider Pool ---

const providerCache = new Map<string, Provider>();

function getProvider(config: ModelConfig): Provider {
  const cached = providerCache.get(config.id);
  if (cached) return cached;

  let provider: Provider;
  switch (config.provider) {
    case 'ollama':
      provider = new OllamaProvider(config.model);
      break;
    case 'anthropic':
      provider = new AnthropicProvider(config.model);
      break;
    case 'openai':
      provider = new OpenAIProvider(config.model);
      break;
  }

  providerCache.set(config.id, provider);
  return provider;
}

// --- Model Selection ---

export function getModelsForTier(tier: Tier, task: Task): ModelConfig[] {
  return models
    .filter(m => m.tier === tier)
    .filter(m => m.capabilities.includes(task.type))
    .sort((a, b) => a.costPerOutputToken - b.costPerOutputToken);
}

export function selectModel(tier: Tier, task: Task): { config: ModelConfig; provider: Provider } | null {
  const candidates = getModelsForTier(tier, task);
  if (candidates.length === 0) return null;

  // Pick cheapest available model at this tier
  const config = candidates[0];
  const provider = getProvider(config);
  return { config, provider };
}

export function getMinTier(task: Task): Tier {
  return complexityMinTier[task.complexity] ?? Tier.LOCAL;
}

export function getTiersToTry(task: Task, maxTier?: Tier): Tier[] {
  const min = getMinTier(task);
  const max = maxTier ?? Tier.FRONTIER;
  const tiers = [Tier.LOCAL, Tier.CHEAP, Tier.MID, Tier.FRONTIER];
  return tiers.filter(t => t >= min && t <= max);
}

// --- Provider Availability Check ---

export async function checkAvailability(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  for (const config of models) {
    const provider = getProvider(config);
    results[config.id] = await provider.isAvailable();
  }

  return results;
}

// --- Cost Estimation ---

export function estimateCost(config: ModelConfig, inputTokens: number, outputTokens: number): number {
  return (inputTokens * config.costPerInputToken) + (outputTokens * config.costPerOutputToken);
}

export function tierName(tier: Tier): string {
  switch (tier) {
    case Tier.LOCAL: return 'Local (Free)';
    case Tier.CHEAP: return 'Cheap ($)';
    case Tier.MID: return 'Mid ($$)';
    case Tier.FRONTIER: return 'Frontier ($$$)';
  }
}
