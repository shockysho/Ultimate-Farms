// ============================================================
// DEMIURGOS — Core Type Definitions
// ============================================================

// --- Model Tiers ---

export enum Tier {
  LOCAL = 1,     // Ollama (free)
  CHEAP = 2,     // Haiku, GPT-4o-mini ($)
  MID = 3,       // Sonnet ($$)
  FRONTIER = 4,  // Opus ($$$)
}

export interface ModelConfig {
  id: string;
  provider: 'ollama' | 'anthropic' | 'openai';
  model: string;
  tier: Tier;
  costPerInputToken: number;   // USD
  costPerOutputToken: number;  // USD
  maxTokens: number;
  capabilities: TaskType[];
}

// --- Task Types ---

export type TaskType = 'question' | 'code' | 'analysis' | 'decision' | 'creative';
export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'novel';

export interface Task {
  id: string;
  prompt: string;
  type: TaskType;
  domain: string;
  complexity: TaskComplexity;
  context?: string;
  maxBudget?: number;
  maxTier?: Tier;
  createdAt: Date;
}

// --- Results ---

export interface Result {
  id: string;
  taskId: string;
  content: string;
  model: string;
  tier: Tier;
  cost: CostRecord;
  evaluation: EvaluationResult;
  cached: boolean;
  duration: number;  // ms
  createdAt: Date;
}

export interface CostRecord {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  tier: Tier;
}

// --- Contracts ---

export interface ConstitutionRule {
  id: string;
  rule: string;
  action: 'instant_fail';
}

export interface StructuralRule {
  domain: string;
  rules: string[];
}

export interface Contract {
  id: string;
  taskId: string;
  generatedAt: Date;

  // Classification
  taskType: TaskType;
  domain: string;
  complexity: TaskComplexity;

  // Layer 1: Constitution
  hardRules: ConstitutionRule[];
  structuralRules: string[];

  // Layer 2: Learned thresholds
  thresholds: DimensionThresholds;

  // Evaluator requirements
  minEvaluatorConfidence: number;

  // Cost constraints
  maxCost: number;
  maxEscalationTier: Tier;

  // Output requirements
  requiredElements: string[];
  format: string;
}

export interface DimensionThresholds {
  accuracy: number;
  completeness: number;
  relevance: number;
  actionability: number;
  specificity: number;
  weights: [number, number, number, number, number];
}

// --- Evaluation ---

export type ConfidenceTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface ClaimConfidence {
  claim: string;
  tier: ConfidenceTier;
  confidence: number;
  sources: string[];
  reason: string;
}

// --- Evidence-Grounded Confidence Types ---

export interface Claim {
  text: string;
  type: 'factual' | 'recommendation' | 'inference' | 'opinion';
}

export interface ClaimEvidence {
  claim: Claim;
  tier: ConfidenceTier;
  confidence: number;
  sources: string[];
  reason: string;
}

export interface CoherenceResult {
  chainIntegrity: number;
  consistency: number;
  counterArgumentResilience: number;
  trackRecord: number;
  overall: number;
}

export interface EvaluationResult {
  scores: {
    accuracy: number;
    completeness: number;
    relevance: number;
    actionability: number;
    specificity: number;
  };

  // Evidence-grounded confidence (per-claim) — legacy string-based
  claimConfidences: ClaimConfidence[];
  overallEvidenceConfidence: number;

  // Evidence-grounded confidence (structured claims with evidence tracing)
  claimEvidences?: ClaimEvidence[];

  // Model-coherence confidence
  coherence: CoherenceResult;

  // Combined
  totalConfidence: number;

  constitutionViolations: string[];
  compositeScore: number;
  verdict: 'pass' | 'fail' | 'uncertain';
}

// --- Cache ---

export interface CacheEntry {
  id: string;
  taskPrompt: string;
  result: string;
  embedding: number[];
  similarity: number;
  modelUsed: string;
  qualityScore: number;
  userApproved: boolean;
  domain: string;
  createdAt: Date;
  expiresAt: Date;
}

export type CacheHitType = 'exact' | 'adapt' | 'miss';

// --- Feedback ---

export type FeedbackType = 'accept' | 'reject' | 'flag';

export interface UserFeedback {
  id: string;
  taskId: string;
  resultId: string;
  type: FeedbackType;
  reason?: string;
  flaggedClaims?: string[];
  timestamp: Date;
}

// --- Provider Interface ---

export interface ProviderResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface Provider {
  name: string;
  generate(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<ProviderResponse>;
  isAvailable(): Promise<boolean>;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

// --- Insight Journal (DMN) ---

export interface Analogy {
  sourceDomain: string;
  targetDomain: string;
  structuralMapping: {
    sourceElement: string;
    targetElement: string;
    relationship: string;
  }[];
  insight: string;
  strength: number;
  novelty: number;
  applications: string[];
}

export interface DMNInsight {
  id: string;
  sourceA: { text: string; domain: string; source: string };
  sourceB: { text: string; domain: string; source: string };
  connection: string;
  analogy?: Analogy;
  noveltyScore: number;
  relevanceScore: number;
  depthScore: number;
  actionabilityScore: number;
  overallScore: number;
  createdAt: Date;
}

// --- Logger ---

export interface TaskLog {
  id: string;
  taskId: string;
  prompt: string;
  result: string;
  modelUsed: string;
  tier: Tier;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  qualityScore: number;
  cacheHit: CacheHitType;
  evidenceConfidence: number;
  coherenceConfidence: number;
  totalConfidence: number;
  durationMs: number;
  timestamp: Date;
}
