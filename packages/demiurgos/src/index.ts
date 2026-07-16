// ============================================================
// DEMIURGOS — Entry Point
// ============================================================

// Core engine
export { execute, initCache, getCache } from './engine.js';
export { initLogger, getCostSummary, getRecentTasks, logFeedback } from './logger.js';
export { generateContract, classifyTaskType, classifyComplexity, classifyDomain } from './contracts.js';
export { evaluate, evaluateWithEvidence } from './evaluator.js';
export { decomposeClaims } from './evaluator/claim-decomposer.js';
export { traceClaim, traceAllClaims } from './evaluator/evidence-tracer.js';
export { testCoherence } from './evaluator/coherence-tester.js';
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
export { selfTest, getSelfTestHistory } from './learner/self-test.js';

// DMN (Default Mode Network)
export { initWanderingStore, wander, wanderText } from './dmn/wanderer.js';
export { findAssociations } from './dmn/association.js';
export { dream } from './dmn/dreamer.js';
export { initInsightJournal, getInsights, searchInsights, insightStats, saveInsight } from './dmn/insight-journal.js';
export { runDMNCycle, startDMNMonitor, stopDMNMonitor, getDMNState, recordDMNActivity } from './dmn/scheduler.js';
export { getWanderingSources, getSourceDomains, getSourceCount } from './dmn/sources.js';

// Knowledge Sources
export { ingestWebPage, fetchAndExtract } from './knowledge/sources/web.js';

// Synthesis
export { synthesize, identifyDomains } from './synthesis/synthesizer.js';

// Providers
export { OllamaProvider } from './providers/ollama.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export { MockProvider } from './providers/mock.js';

// Types
export * from './types.js';
