// ============================================================
// DEMIURGOS — Entry Point
// ============================================================

export { execute } from './engine.js';
export { initLogger, getCostSummary, getRecentTasks, logFeedback } from './logger.js';
export { generateContract, classifyTaskType, classifyComplexity, classifyDomain } from './contracts.js';
export { evaluate } from './evaluator.js';
export { selectModel, checkAvailability, tierName } from './router.js';
export { OllamaProvider } from './providers/ollama.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export * from './types.js';
