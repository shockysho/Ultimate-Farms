// ============================================================
// DEMIURGOS — Configuration
// ============================================================

import { Tier, type ModelConfig, type TaskType } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

// --- Environment ---

export const env = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  chromaUrl: process.env.CHROMA_URL ?? 'http://localhost:8000',
  dashboardPort: parseInt(process.env.DASHBOARD_PORT ?? '3000', 10),
  apiPort: parseInt(process.env.API_PORT ?? '3001', 10),
  dailyBudgetUsd: parseFloat(process.env.DAILY_BUDGET_USD ?? '5.00'),
  monthlyBudgetUsd: parseFloat(process.env.MONTHLY_BUDGET_USD ?? '50.00'),
  minEvaluatorConfidence: parseFloat(process.env.MIN_EVALUATOR_CONFIDENCE ?? '0.7'),
  cacheExactThreshold: parseFloat(process.env.CACHE_EXACT_THRESHOLD ?? '0.92'),
  cacheAdaptThreshold: parseFloat(process.env.CACHE_ADAPT_THRESHOLD ?? '0.85'),
};

// --- Model Registry ---

export const models: ModelConfig[] = [
  // Tier 1: Local (FREE)
  {
    id: 'ollama-mistral',
    provider: 'ollama',
    model: 'mistral',
    tier: Tier.LOCAL,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxTokens: 8192,
    capabilities: ['question', 'code', 'creative'],
  },
  {
    id: 'ollama-llama3',
    provider: 'ollama',
    model: 'llama3',
    tier: Tier.LOCAL,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxTokens: 8192,
    capabilities: ['question', 'code', 'analysis', 'creative'],
  },
  {
    id: 'ollama-codellama',
    provider: 'ollama',
    model: 'codellama',
    tier: Tier.LOCAL,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxTokens: 4096,
    capabilities: ['code'],
  },

  // Tier 2: Cheap ($)
  {
    id: 'claude-haiku',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    tier: Tier.CHEAP,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
    maxTokens: 8192,
    capabilities: ['question', 'code', 'analysis', 'decision', 'creative'],
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    tier: Tier.CHEAP,
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.0000006,
    maxTokens: 16384,
    capabilities: ['question', 'code', 'analysis', 'decision', 'creative'],
  },

  // Tier 3: Mid ($$)
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    tier: Tier.MID,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    maxTokens: 8192,
    capabilities: ['question', 'code', 'analysis', 'decision', 'creative'],
  },

  // Tier 4: Frontier ($$$)
  {
    id: 'claude-opus',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    tier: Tier.FRONTIER,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
    maxTokens: 4096,
    capabilities: ['question', 'code', 'analysis', 'decision', 'creative'],
  },
];

// --- Default Thresholds ---

export const defaultThresholds = {
  accuracy: 0.7,
  completeness: 0.6,
  relevance: 0.7,
  actionability: 0.5,
  specificity: 0.6,
  weights: [0.25, 0.20, 0.20, 0.20, 0.15] as [number, number, number, number, number],
};

// --- Complexity Routing Hints ---
// Maps complexity to the minimum tier that should handle it

export const complexityMinTier: Record<string, Tier> = {
  simple: Tier.LOCAL,
  moderate: Tier.LOCAL,
  complex: Tier.CHEAP,
  novel: Tier.MID,
};

// --- Task Type Classification Keywords ---

export const taskTypeKeywords: Record<TaskType, string[]> = {
  question: ['what', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe', 'tell me'],
  code: ['code', 'function', 'implement', 'write', 'debug', 'fix', 'refactor', 'script'],
  analysis: ['analyze', 'compare', 'evaluate', 'assess', 'review', 'examine', 'investigate'],
  decision: ['should', 'decide', 'choose', 'recommend', 'best', 'option', 'trade-off'],
  creative: ['design', 'create', 'brainstorm', 'imagine', 'innovate', 'generate', 'invent'],
};
