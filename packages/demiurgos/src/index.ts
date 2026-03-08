// ============================================================
// DEMIURGOS — Entry Point
// ============================================================

export { execute, initCache, getCache } from './engine.js';
export { initLogger, getCostSummary, getRecentTasks, logFeedback } from './logger.js';
export { TaskCache } from './cache/task-cache.js';
export { VectorStore } from './cache/vector-store.js';
export { simpleEmbed, cosineSimilarity } from './cache/embeddings.js';
export { generateContract, classifyTaskType, classifyComplexity, classifyDomain } from './contracts.js';
export { evaluate } from './evaluator.js';
export { selectModel, checkAvailability, tierName } from './router.js';
export { OllamaProvider } from './providers/ollama.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export * from './types.js';
