// ============================================================
// DEMIURGOS — Entry Point
// ============================================================

// Core engine
export { execute, initCache, getCache } from './engine.js';
export { initLogger, getCostSummary, getRecentTasks, logFeedback } from './logger.js';
export { generateContract, classifyTaskType, classifyComplexity, classifyDomain } from './contracts.js';
export { evaluate } from './evaluator.js';
export { selectModel, checkAvailability, tierName } from './router.js';

// Cache
export { TaskCache } from './cache/task-cache.js';
export { VectorStore } from './cache/vector-store.js';
export { simpleEmbed, cosineSimilarity } from './cache/embeddings.js';

// Knowledge
export { initKnowledgeStore, getKnowledgeStore, ingestText, searchKnowledge, knowledgeStats } from './knowledge/ingestor.js';
export { chunkText } from './knowledge/chunker.js';

// Active Learning
export { detectGaps } from './learner/gap-detector.js';
export { generateStudyPlans } from './learner/study-planner.js';
export { runLearningCycle, startIdleMonitor, stopIdleMonitor, getLearnerState, recordActivity } from './learner/scheduler.js';

// DMN (Default Mode Network)
export { initWanderingStore, wanderText } from './dmn/wanderer.js';
export { findAssociations } from './dmn/association.js';
export { dream } from './dmn/dreamer.js';
export { initInsightJournal, getInsights, searchInsights, insightStats, saveInsight } from './dmn/insight-journal.js';
export { runDMNCycle, startDMNMonitor, stopDMNMonitor, getDMNState, recordDMNActivity } from './dmn/scheduler.js';

// Synthesis
export { synthesize, identifyDomains } from './synthesis/synthesizer.js';

// Providers
export { OllamaProvider } from './providers/ollama.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export { MockProvider } from './providers/mock.js';

// Types
export * from './types.js';
