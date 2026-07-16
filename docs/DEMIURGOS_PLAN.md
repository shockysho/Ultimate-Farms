# DEMIURGOS: Development & Operationalization Plan

## Context

**What**: Demiurgos is an autonomous AI orchestrator system — a subordinate builder that creates and maintains systems under the owner's direction. Named after the Gnostic Demiurge: a powerful, tireless creator that shapes and sustains the material world.

**Why**: Current AI usage is one-shot, expensive, and doesn't learn. Demiurgos is a self-improving system that routes tasks through the cheapest viable model, caches everything, learns from external sources during idle time, and synthesizes multiple expert perspectives — a "hive mind" that gets smarter and cheaper every day.

**The vision**: You give direction. Demiurgos builds, maintains, and improves everything beneath you. The farm app is just one of many things it will build and operate.

**Hardware**: RTX 3060 (local inference), internet connection (cloud API fallback)

---

## Architecture

```
                        ┌─────────────┐
                        │    YOU      │
                        │  (Directive)│
                        └──────┬──────┘
                               │
                    ┌──────────▼──────────┐
                    │     DEMIURGOS       │
                    │   Orchestrator Core │
                    ├─────────────────────┤
                    │                     │
                    │  ┌───────────────┐  │
                    │  │ Task Intake   │  │  ← Natural language input
                    │  └───────┬───────┘  │
                    │          │          │
                    │  ┌───────▼───────┐  │
                    │  │ Cache Check   │  │  ← Vector similarity (ChromaDB)
                    │  │ (FREE path)   │  │     Hit? Return instantly
                    │  └───────┬───────┘  │
                    │          │ miss     │
                    │  ┌───────▼───────┐  │
                    │  │ Contract Gen  │  │  ← Define "what good looks like"
                    │  │ (criteria)    │  │     BEFORE execution
                    │  └───────┬───────┘  │
                    │          │          │
                    │  ┌───────▼───────┐  │
                    │  │ Multi-Plan    │  │  ← Generate 3+ approaches
                    │  │ Generator     │  │     across different models
                    │  └───────┬───────┘  │
                    │          │          │
                    │  ┌───────▼───────┐  │
                    │  │ Cost Router   │  │  ← Cheapest viable model first
                    │  │ Tier 1→2→3→4 │  │     Escalate only on failure
                    │  └───────┬───────┘  │
                    │          │          │
                    │  ┌───────▼───────┐  │
                    │  │ Evaluator     │  │  ← Does output meet contract?
                    │  │ (contract)    │  │     Pass → cache + return
                    │  └───────┬───────┘  │     Fail → escalate tier
                    │          │          │
                    │  ┌───────▼───────┐  │
                    │  │ Logger        │  │  ← Cost, quality, model, time
                    │  └───────────────┘  │     Everything tracked
                    │                     │
                    ├─────────────────────┤
                    │   KNOWLEDGE BASE    │
                    │  ┌───────────────┐  │
                    │  │ ChromaDB      │  │  ← Vector embeddings
                    │  │ (local, free) │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │ Active Learner│  │  ← Studies during idle time
                    │  │ (background)  │  │     USDA, arXiv, YouTube, etc.
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │ Hive Mind     │  │  ← Multi-perspective synthesis
                    │  │ (synthesis)   │  │     Economist + Engineer + Farmer
                    │  └───────────────┘  │
                    └─────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼───────┐ ┌──────▼──────┐
     │ Local Models  │ │ Mid-Tier API │ │ Frontier API│
     │ Ollama/3060   │ │ Haiku, Mini  │ │ Opus, GPT-4 │
     │ FREE          │ │ $            │ │ $$$         │
     └───────────────┘ └──────────────┘ └─────────────┘
```

---

## STAGE 1: Core Engine (Days 1-5)
**Deliverable**: Working orchestrator that routes tasks, tracks costs, and returns results.

### 1.1 Project Scaffold
Create `packages/demiurgos/` with TypeScript:
```
packages/demiurgos/
├── src/
│   ├── index.ts              ← Entry point
│   ├── engine.ts             ← Main orchestration loop
│   ├── router.ts             ← Model tier selection
│   ├── contracts.ts          ← Success criteria definitions
│   ├── evaluator.ts          ← Output vs contract scoring
│   ├── logger.ts             ← Cost/quality/time tracking
│   ├── config.ts             ← Model configs, thresholds
│   ├── types.ts              ← Core type definitions
│   ├── providers/
│   │   ├── base.ts           ← Provider interface
│   │   ├── ollama.ts         ← Local model adapter (Tier 1, FREE)
│   │   ├── anthropic.ts      ← Claude adapter (Tier 2-4)
│   │   └── openai.ts         ← OpenAI adapter (Tier 2-3)
│   └── cli.ts                ← CLI interface for interaction
├── package.json
└── tsconfig.json
```

### 1.2 Engine Core (`engine.ts`)
The central loop:
```typescript
async function execute(task: Task): Promise<Result> {
  // 1. Check cache
  const cached = await cache.search(task.prompt);
  if (cached && cached.similarity > 0.92) return cached.result;
  if (cached && cached.similarity > 0.85) return adapt(cached, task);

  // 2. Generate contract (what does "good" look like?)
  const contract = await generateContract(task);

  // 3. Try cheapest model first, escalate on failure
  for (const tier of [Tier.LOCAL, Tier.CHEAP, Tier.MID, Tier.FRONTIER]) {
    const model = router.selectModel(tier, task.type);
    const result = await model.execute(task, contract);
    const score = evaluator.score(result, contract);

    if (score >= contract.threshold) {
      await cache.store(task, result);
      await logger.log({ task, model, cost, score, time });
      return result;
    }
    // Didn't meet contract → escalate to next tier
  }
}
```

### 1.3 Cost Router (`router.ts`)
Model tiers and routing logic:

| Tier | Models | Cost | Use When |
|------|--------|------|----------|
| 1 - Local | Mistral 7B, Llama 3 8B, CodeLlama | FREE | Simple Q&A, text generation, code completion |
| 2 - Cheap | Claude Haiku, GPT-4o-mini | ~$0.001/task | Moderate complexity, summarization, analysis |
| 3 - Mid | Claude Sonnet | ~$0.01/task | Complex reasoning, multi-step planning |
| 4 - Frontier | Claude Opus | ~$0.10/task | Critical decisions, novel problems, synthesis |

Router considers: task complexity, domain, required accuracy, budget preference.

### 1.4 Contract System — THE HEART OF DEMIURGOS

The contract system is what separates Demiurgos from a dumb API wrapper. It determines:
- Whether bad answers pass (wasting your time)
- Whether good answers fail (wasting your money)
- What the system learns from (training signal)
- When to escalate (cost control)

**Get this wrong and the whole system is worthless.**

#### Two Layers: Constitution + Learned Preferences

```
┌────────────────────────────────────────────────────────┐
│              THE CONSTITUTION (Layer 1)                 │
│           Immutable rules YOU define upfront            │
│                                                        │
│  Hard Rules (instant fail if violated):                │
│  ├─ No hallucinated facts or made-up numbers           │
│  ├─ No contradictions within the same response         │
│  ├─ Must answer the actual question asked              │
│  ├─ Must be specific to context, not generic advice    │
│  ├─ If citing data, source must be verifiable          │
│  └─ [Your custom rules added here]                     │
│                                                        │
│  Structural Rules (format/completeness):               │
│  ├─ Financial advice must include numbers              │
│  ├─ Comparisons must cover trade-offs (not just pros)  │
│  ├─ Multi-step plans must have clear sequencing        │
│  ├─ Code must include error handling                   │
│  └─ [Your custom rules added here]                     │
│                                                        │
│  These rules NEVER change unless you change them.      │
│  They are the floor. Nothing passes that violates one. │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│           LEARNED PREFERENCES (Layer 2)                │
│        Adaptive thresholds from your feedback          │
│                                                        │
│  5 Evaluation Dimensions (each scored 0-1):            │
│                                                        │
│  1. ACCURACY     — Is the information correct?         │
│     Initial: 0.7  │  Learned: calibrated from feedback │
│                                                        │
│  2. COMPLETENESS — Does it fully answer the question?  │
│     Initial: 0.6  │  Learned: you rate what's "enough" │
│                                                        │
│  3. RELEVANCE    — Is it on-topic, not tangential?     │
│     Initial: 0.7  │  Learned: what you consider useful │
│                                                        │
│  4. ACTIONABILITY— Can you act on this immediately?    │
│     Initial: 0.5  │  Learned: your bar for "useful"    │
│                                                        │
│  5. SPECIFICITY  — Is it specific to YOUR situation?   │
│     Initial: 0.6  │  Learned: generic vs tailored      │
│                                                        │
│  Weighted composite = pass/fail decision               │
│  Weights learned from YOUR feedback over time          │
└────────────────────────────────────────────────────────┘
```

#### Contract Generation Flow

```
Task arrives
  │
  ├─ 1. CLASSIFY the task
  │     → question / code / analysis / decision / creative
  │     → domain: farming / finance / engineering / general
  │     → complexity: simple / moderate / complex / novel
  │
  ├─ 2. LOAD constitution rules (always applied)
  │     → Hard rules: hallucination check, contradiction check, etc.
  │     → Structural rules for this task type
  │
  ├─ 3. LOAD learned thresholds for this task type + domain
  │     → If prior feedback exists: use calibrated thresholds
  │     → If no prior feedback: use conservative defaults
  │
  ├─ 4. SET evaluator confidence requirement
  │     → The evaluator must also report HOW CONFIDENT it is
  │     → Low confidence + pass → DON'T trust it → escalate
  │     → This prevents the "incompetent judge" problem
  │
  └─ 5. GENERATE the contract document
        → Passed to both the executor AND the evaluator
        → Both know what "good" looks like before starting
```

#### The Evaluator Confidence Problem (Critical)

Most AI evaluation systems have a fatal flaw: **the evaluator doesn't know what it doesn't know.** A cheap model might score an output 0.9 because it can't detect the errors — not because there aren't any.

A model's "feeling" of confidence is worthless. Models are confidently wrong all the time. They hallucinate with the same tone they state verified facts. **Confidence must come from EVIDENCE, not from the model's internal state.**

Think of it like your rice example:
- "I ate rice" → You directly experienced it, vivid memory → **Evidence-grounded certainty**
- "It was basmati" → Sensory impression, you didn't verify → **Inference without verification**
- "It was grown in India" → Pure guess → **No evidential basis**

The confidence isn't a feeling — it's a **function of how the knowledge was acquired and whether it was verified.**

#### Evidence-Grounded Confidence System

Instead of asking the model "how confident are you?" (which produces meaningless numbers), we COMPUTE confidence from the evidence chain:

```
┌────────────────────────────────────────────────────────────┐
│        CONFIDENCE IS NOT A FEELING. IT IS A PROOF.         │
│                                                            │
│  For every claim in the output, trace WHERE it came from:  │
│                                                            │
│  TIER 5 — VERIFIED FACT (confidence: 0.95-1.0)            │
│  "The user approved this exact answer before"              │
│  "This was computed from data I have" (math, lookup)       │
│  "This comes from the user's own data/files"               │
│  Evidence: Cache hit with user-approved flag,              │
│           or deterministic computation                     │
│  Analogy: "I ate rice" — I was there, I experienced it     │
│                                                            │
│  TIER 4 — AUTHORITATIVE SOURCE (confidence: 0.80-0.94)    │
│  "USDA publication says X"                                 │
│  "FAO guideline states Y"                                  │
│  "Peer-reviewed paper found Z"                             │
│  Evidence: Named source in knowledge base,                 │
│           source has been verified as authoritative         │
│  Analogy: "My doctor told me X" — I trust the source       │
│                                                            │
│  TIER 3 — MULTIPLE AGREEMENT (confidence: 0.65-0.79)      │
│  "Three independent sources in my knowledge base agree"    │
│  Evidence: Cross-referenced, consistent across sources     │
│  Analogy: "Multiple people told me the same thing"         │
│                                                            │
│  TIER 2 — SINGLE INFERENCE (confidence: 0.40-0.64)        │
│  "Based on patterns in my training data, this seems right" │
│  "One source suggests this but I can't cross-reference"    │
│  Evidence: Pattern match only, no verification             │
│  Analogy: "It was basmati" — felt like it, didn't verify   │
│                                                            │
│  TIER 1 — SPECULATION (confidence: 0.10-0.39)             │
│  "I'm generating a plausible answer but have no basis"     │
│  "This is creative/novel, not grounded in known facts"     │
│  Evidence: None. Pure generation.                          │
│  Analogy: "It was grown in India" — just guessing          │
│                                                            │
│  TIER 0 — NO BASIS (confidence: 0.0-0.09)                 │
│  "I don't have information about this"                     │
│  "This is outside any domain I have knowledge in"          │
│  Evidence: Explicitly absent                               │
│  Analogy: "I have no idea" — and I KNOW I have no idea    │
└────────────────────────────────────────────────────────────┘
```

#### How Confidence Is Computed (Not Estimated)

The evaluator doesn't "guess" confidence. It follows a verification algorithm:

```typescript
function computeConfidence(claim: string, output: Output): ConfidenceResult {
  // Step 1: Can this claim be traced to a specific source?
  const sources = knowledgeBase.searchForClaim(claim);

  if (sources.length === 0) {
    // No source found. This came from the model's training data
    // or was generated. Confidence is LOW by default.
    return {
      tier: sources.length === 0 ? 1 : 0,  // inference or no basis
      confidence: 0.3,
      reason: "No verifiable source in knowledge base",
      recommendation: "Flag for user verification"
    };
  }

  // Step 2: How authoritative are the sources?
  const sourceQuality = sources.map(s => s.authority_score);
  // USDA publication = 0.95, random blog = 0.3, user-approved = 1.0

  // Step 3: Do multiple sources agree?
  const agreement = computeAgreement(sources, claim);
  // All agree = 1.0, mixed = 0.5, contradictory = 0.1

  // Step 4: Is this a computation or an inference?
  const isComputable = canBeComputed(claim);
  // "500 GPM requires X HP" = computable
  // "The best approach is Y" = not computable (judgment)

  // Step 5: Has the user verified similar claims before?
  const priorVerification = feedbackHistory.findSimilar(claim);
  // User accepted similar claim before = confidence boost
  // User rejected similar claim before = confidence penalty

  // Step 6: Combine into final confidence
  const confidence = weightedCombine({
    sourceQuality: max(sourceQuality),    // Best source
    agreement: agreement,                  // Source agreement
    computability: isComputable ? 0.9 : 0.5,
    priorVerification: priorVerification,
  });

  return {
    tier: confidenceToTier(confidence),
    confidence: confidence,
    sources: sources.map(s => s.citation),
    reason: explainConfidence(confidence, sources),
    recommendation: confidence < 0.65 ? "Flag for verification" : "Trustworthy"
  };
}
```

#### Per-Claim Decomposition (The Key Innovation)

Don't evaluate the WHOLE output as one score. **Decompose the output into individual claims and score EACH ONE:**

```
Output: "You should use a 25 HP centrifugal pump for 500 GPM.
         The Goulds 3196 is industry standard for this flow rate.
         It costs approximately $4,500 and has a 15-year lifespan."

Decomposed:
  Claim 1: "25 HP centrifugal pump for 500 GPM"
    → Source: Engineering handbook in KB → Authority: 0.92
    → Cross-ref: USDA irrigation guide agrees → Agreement: 0.95
    → Computable: Yes (can verify with pump curve math)
    → CONFIDENCE: 0.93 (TIER 5)

  Claim 2: "Goulds 3196 is industry standard"
    → Source: One manufacturer reference in KB → Authority: 0.7
    → Cross-ref: No other sources mention this specific model
    → Computable: No (judgment call)
    → CONFIDENCE: 0.55 (TIER 2)
    → FLAG: "Single source, unverified brand recommendation"

  Claim 3: "Costs approximately $4,500"
    → Source: None in KB. Model's training data only.
    → Cross-ref: No price data available
    → Computable: No (market price, time-dependent)
    → CONFIDENCE: 0.25 (TIER 1)
    → FLAG: "Price not verifiable, likely outdated"

  Claim 4: "15-year lifespan"
    → Source: Manufacturer spec sheet in KB → Authority: 0.85
    → Cross-ref: Engineering reference agrees (10-20 year range)
    → CONFIDENCE: 0.78 (TIER 3)

OVERALL OUTPUT CONFIDENCE: 0.63 (weighted by claim importance)
  → Claim 3 drags it down. Flag that specific claim.
  → Don't reject the whole answer for one weak claim.
  → Tell the user: "Pump sizing verified. Price unverified."
```

#### Why This Prevents Overconfidence

The system can NEVER be overconfident because:

1. **No source = low confidence, always.** The model can't say "I'm sure" without evidence. If the knowledge base doesn't have it, confidence is capped at Tier 2 (0.64 max) regardless of how "sure" the model sounds.

2. **Single source = moderate confidence, always.** Even an authoritative source alone can't push confidence above Tier 4 (0.94). You need either user verification or multiple agreeing sources for Tier 5.

3. **Contradictory sources = low confidence, always.** If sources disagree, confidence drops AND the disagreement is surfaced. The system doesn't pick a side — it shows you the conflict.

4. **Historical calibration.** If the system gave high-confidence answers that you rejected, the confidence scoring gets recalibrated downward. Over time, the system's confidence aligns with YOUR acceptance rate.

```
Calibration check (runs weekly):
  - Take all outputs where confidence > 0.8
  - How many did the user accept? (should be >90%)
  - If only 70% accepted → confidence scores are inflated
  - Reduce all confidence scores by calibration factor
  - Repeat until confidence accurately predicts acceptance
```

5. **Explicit uncertainty is rewarded, not punished.** An output that says "I'm confident about X but uncertain about Y" scores HIGHER than one that presents everything as certain. Because the honest output lets you verify only what needs verifying.

#### Model-Coherence Confidence (The Second Dimension)

Evidence-based confidence answers: "Do I have proof?"
Model-coherence confidence answers: "Does my reasoning hold up under scrutiny?"

This is the chess grandmaster who "just knows." The investor who "feels" the market turning. You telling the girl exactly what to say to her roommate — not because you tested it, but because your mental model of human behavior is so deep and internally consistent that you couldn't see how it would fail. And it didn't.

This is a REAL form of confidence. It's not guessing. It's the output of a deeply calibrated internal model. The key difference from blind overconfidence: **a coherent model has a track record of being right.**

```
┌────────────────────────────────────────────────────────────┐
│        MODEL-COHERENCE CONFIDENCE                          │
│     "I know because my reasoning is airtight"              │
│                                                            │
│  4 Tests for Coherence Confidence:                         │
│                                                            │
│  TEST 1: LOGICAL CHAIN INTEGRITY                           │
│  ├─ Does each step follow from the previous?               │
│  ├─ Are there any logical gaps or unsupported jumps?        │
│  ├─ Can every inference be defended with a reason?          │
│  └─ Score: chain_integrity (0-1)                           │
│                                                            │
│  TEST 2: INTERNAL CONSISTENCY                              │
│  ├─ Does any part of the reasoning contradict another?     │
│  ├─ Do the conclusions align with the premises?            │
│  ├─ If you change one assumption, does the whole model     │
│  │  update consistently? (recursive coherence)             │
│  └─ Score: consistency (0-1)                               │
│                                                            │
│  TEST 3: COUNTER-ARGUMENT RESILIENCE                       │
│  ├─ Can the system generate a strong counter-argument?     │
│  │  If YES → the conclusion isn't as certain as it seems   │
│  │  If NO → hard to argue against → high coherence         │
│  ├─ "I told her what to tell the roommate because I        │
│  │   couldn't see how it wouldn't work" = you tried to     │
│  │   find a counter-argument and failed                    │
│  └─ Score: resilience (0-1)                                │
│                                                            │
│  TEST 4: PREDICTIVE TRACK RECORD                           │
│  ├─ Has similar reasoning been correct before?             │
│  ├─ When the system used this type of logic chain          │
│  │  in the past, what was the acceptance rate?             │
│  ├─ A reasoning pattern that's been right 50 times         │
│  │  earns higher coherence than a novel reasoning chain    │
│  └─ Score: track_record (0-1)                              │
│                                                            │
│  COHERENCE CONFIDENCE = weighted(chain_integrity,          │
│                          consistency,                       │
│                          resilience,                        │
│                          track_record)                      │
└────────────────────────────────────────────────────────────┘
```

#### How Counter-Argument Resilience Works (The "Can't See How It Would Fail" Test)

This is the most interesting test. When you said "I just couldn't see how that would not work" — you were doing something specific: **you tried to break your own reasoning and couldn't.** That failure to find a counter-argument IS the confidence.

Implementation:
```typescript
async function testResilience(reasoning: string, conclusion: string): Promise<number> {
  // Ask a model to ATTACK the conclusion
  const counterArgument = await model.generate({
    prompt: `Your job is to find the strongest possible counter-argument
             to this reasoning and conclusion. Try your hardest to prove
             it wrong. Find logical flaws, hidden assumptions, edge cases,
             or scenarios where this breaks down.

             Reasoning: ${reasoning}
             Conclusion: ${conclusion}

             If you genuinely cannot find a strong counter-argument,
             say "I cannot find a compelling counter-argument" and explain why.`,
  });

  // Analyze the counter-argument
  if (counterArgument.includes("cannot find a compelling counter-argument")) {
    // The adversary couldn't break it → HIGH resilience
    return 0.9;
  }

  // Rate the strength of the counter-argument
  const strength = await evaluateCounterArgument(counterArgument, reasoning);

  // Strong counter-argument = low resilience
  // Weak counter-argument = high resilience
  return 1.0 - strength;
}
```

This is essentially **adversarial self-examination**. The system tries to destroy its own reasoning. If it can't → the reasoning is resilient → confidence is earned.

#### The Two Dimensions Combined

```
┌─────────────────────────────────────────────────────────┐
│           TOTAL CONFIDENCE = f(Evidence, Coherence)      │
│                                                         │
│              Evidence Confidence                        │
│              HIGH            LOW                        │
│         ┌──────────────┬──────────────┐                 │
│  Coh.   │              │              │                 │
│  HIGH   │  MAXIMUM     │  STRONG      │                 │
│         │  confidence  │  confidence  │                 │
│         │              │              │                 │
│         │  "I have     │  "I can't    │                 │
│         │   proof AND  │   prove it   │                 │
│         │   my logic   │   with data  │                 │
│         │   is tight"  │   but my     │                 │
│         │              │   reasoning  │                 │
│         │  Like: math  │   is solid"  │                 │
│         │  theorem     │              │                 │
│         │              │  Like: your  │                 │
│         │              │  roommate    │                 │
│         │              │  advice      │                 │
│         ├──────────────┼──────────────┤                 │
│  Coh.   │              │              │                 │
│  LOW    │  MODERATE    │  LOW         │                 │
│         │  confidence  │  confidence  │                 │
│         │              │              │                 │
│         │  "I have     │  "I have     │                 │
│         │   data but   │   nothing.   │                 │
│         │   my logic   │   No proof,  │                 │
│         │   has gaps"  │   no solid   │                 │
│         │              │   reasoning" │                 │
│         │  Like: stats │              │                 │
│         │  that seem   │  Like: pure  │                 │
│         │  off but are │  guess       │                 │
│         │  cited       │              │                 │
│         └──────────────┴──────────────┘                 │
│                                                         │
│  The KEY quadrant is top-right: HIGH coherence,          │
│  LOW evidence. This is intuition. This is where         │
│  experts operate. It's NOT a guess — it's earned        │
│  through deep reasoning + track record.                  │
│                                                         │
│  The system treats this as STRONG confidence             │
│  (not maximum, because evidence would make it           │
│  stronger), but it DOES trust it. Because the           │
│  reasoning has been stress-tested and the pattern        │
│  has a track record.                                     │
└─────────────────────────────────────────────────────────┘
```

#### Why This Matters for Cost

The coherence dimension SAVES money. Without it:
- No evidence → low confidence → escalate → spend more
- Every novel question → escalate → spend more

With coherence confidence:
- No evidence BUT strong reasoning + proven pattern → TRUST it
- Novel question BUT logic is airtight and adversary can't break it → TRUST it
- The system can handle more tasks at lower tiers because it has a second way to earn confidence

This is what separates a merely knowledgeable system from a WISE one.

#### The "Bones" Test (Two Dimensions)

"Deep in my bones" confidence now comes from BOTH dimensions:

```
"I know deep in my bones" = Evidence HIGH + Coherence HIGH
  → Multiple verified sources AND logic is airtight
  → The system would "fight and die" for this claim

"I just know this will work" = Evidence LOW + Coherence HIGH
  → No hard data, but reasoning is complete, consistent,
    counter-argument-resilient, and has track record
  → Your roommate advice. The chess grandmaster's move.
  → System trusts this. Flags as "strong intuition, no proof."

"The data says so, but something feels off" = Evidence HIGH + Coherence LOW
  → Sources exist but reasoning has gaps or contradictions
  → System flags: "Data supports this but logic isn't clean"

"I'm guessing" = Evidence LOW + Coherence LOW
  → No sources, reasoning has gaps, no track record
  → System says: "I cannot answer this reliably"
  → Suggests where to find the answer instead
```

The system never pretends to know what it doesn't. When it says something with high confidence, there's a TRACEABLE CHAIN OF EVIDENCE and/or AIRTIGHT REASONING behind it. When it's unsure, it says so explicitly and tells you which parts are uncertain.

#### Evaluation Decision Matrix

Based on evidence-grounded confidence:
```
                    Evaluator Confidence (evidence-based)
                    HIGH (Tier 4-5)    LOW (Tier 0-2)
                ┌─────────────────┬──────────────────────┐
   Score HIGH   │  PASS ✓         │  ESCALATE EVALUATOR  │
                │  Cache it       │  (don't re-run task, │
                │  Full evidence  │   just get a smarter │
                │  chain stored   │   judge to re-check) │
                ├─────────────────┼──────────────────────┤
   Score LOW    │  FAIL ✗         │  ESCALATE EVALUATOR  │
                │  Next model     │  (the evaluator      │
                │  tier           │   might be wrong     │
                │                 │   about failing it)  │
                └─────────────────┴──────────────────────┘
```

When confidence is low, DON'T escalate the execution model — escalate the EVALUATOR. Use a smarter model to RE-EVALUATE the same output. This is much cheaper than re-executing the whole task.

#### The Feedback Loop (How It Learns YOUR Standards)

```
Week 1-2: Calibration Phase
  │
  ├─ Every output is flagged for review
  │  You see: [Output] + [Accept / Reject / Flag Issue]
  │
  ├─ On Accept:
  │   → Record which dimensions the evaluator scored high
  │   → These become "what passing looks like for this user"
  │
  ├─ On Reject + reason:
  │   → "Too generic" → lower SPECIFICITY threshold
  │   → "Missing key info" → lower COMPLETENESS threshold
  │   → "Can't act on this" → lower ACTIONABILITY threshold
  │   → "Wrong facts" → lower ACCURACY threshold (most critical)
  │
  └─ On Flag specific issue:
     → Add to constitution as new hard rule
     → e.g., "Never recommend X without mentioning Y"

Week 3-4: Adaptive Phase
  │
  ├─ System has 50+ data points from your feedback
  │  → Thresholds calibrated per task type per domain
  │  → Dimension weights adjusted (you care more about X than Y)
  │
  ├─ Review frequency drops
  │  → Only review: first-time task types, low-confidence evals, tier escalations
  │
  └─ System confidence grows
     → More cache hits (it knows what you'll accept)
     → Better routing (it knows which models you trust)

Week 5+: Autonomous Phase
  │
  ├─ Only flagged for review when:
  │   → Evaluator confidence < 0.6 (it's unsure)
  │   → New task type never seen before
  │   → Constitution rule might apply but isn't clear
  │
  └─ Continuous learning:
     → Periodic random sampling (5% of tasks) for quality audit
     → Drift detection: if your standards change, system adapts
```

#### Constitution File (User-Editable)

Stored as YAML, version-controlled, always human-readable:
```yaml
# demiurgos-constitution.yaml
# YOUR rules. Edit anytime. System reloads on change.

hard_rules:
  - id: no-hallucination
    rule: "Never present made-up facts, statistics, or citations"
    action: instant_fail

  - id: no-contradiction
    rule: "Never contradict yourself within the same response"
    action: instant_fail

  - id: answer-the-question
    rule: "Must directly address what was asked, not adjacent topics"
    action: instant_fail

  - id: no-generic
    rule: "If context is provided, answer must be specific to that context"
    action: instant_fail

  - id: verify-sources
    rule: "If data/numbers are cited, source must be named and verifiable"
    action: instant_fail

structural_rules:
  financial:
    - "Must include specific numbers, not just qualitative assessments"
    - "Must address both upside and downside"
    - "Must state assumptions explicitly"

  code:
    - "Must handle errors, not just the happy path"
    - "Must be runnable as-is, not pseudo-code"
    - "Must include brief explanation of approach"

  decision:
    - "Must present at least 2 options"
    - "Must include trade-offs for each option"
    - "Must give a clear recommendation with reasoning"

  analysis:
    - "Must distinguish between facts and opinions"
    - "Must cite data sources"

# These thresholds start here, then adjust from your feedback
default_thresholds:
  accuracy: 0.7
  completeness: 0.6
  relevance: 0.7
  actionability: 0.5
  specificity: 0.6

# Minimum evaluator confidence to trust the evaluation
min_evaluator_confidence: 0.7
```

#### Contract Data Model

```typescript
interface Contract {
  // Identity
  id: string;
  task_id: string;
  generated_at: Date;

  // Classification
  task_type: "question" | "code" | "analysis" | "decision" | "creative";
  domain: string;
  complexity: "simple" | "moderate" | "complex" | "novel";

  // Layer 1: Constitution (loaded from YAML)
  hard_rules: ConstitutionRule[];
  structural_rules: string[];

  // Layer 2: Learned thresholds (from feedback history)
  thresholds: {
    accuracy: number;
    completeness: number;
    relevance: number;
    actionability: number;
    specificity: number;
    weights: number[];  // How much each dimension matters (learned)
  };

  // Evaluator requirements
  min_evaluator_confidence: number;

  // Cost constraints
  max_cost: number;
  max_escalation_tier: Tier;

  // Output requirements
  required_elements: string[];  // What must be present
  format: string;               // Expected structure
}
```

#### Why This Design Works

1. **Constitution catches catastrophic failures** — No hallucinations, no contradictions, regardless of what the model says. These are YOUR non-negotiables.

2. **Learned thresholds prevent both failure modes**:
   - False passes: Your feedback pushes thresholds up when you reject things
   - False fails: Your feedback pushes thresholds down when you accept things the system rejected

3. **Evaluator confidence prevents the "incompetent judge" problem** — A cheap model can't evaluate complex outputs and pretend it can. It must report its confidence.

4. **The system gets cheaper over time** — As it learns your standards, it routes more accurately, caches more effectively, and escalates less.

5. **You maintain ultimate authority** — The constitution is a plain text file you can edit. Thresholds are calibrated from YOUR judgments. It models YOUR standards, not generic quality.

6. **Graceful degradation** — During calibration phase, it's more conservative (escalates more). As confidence grows, it becomes more autonomous. You control the pace.

### 1.5 CLI Interface (`cli.ts`)
Simple terminal interface for interacting with Demiurgos:
- `demiurgos ask "question"` — Ask anything
- `demiurgos task "description"` — Execute a task
- `demiurgos cost` — Show cost breakdown
- `demiurgos cache` — Cache statistics
- `demiurgos insights` — Show DMN insight journal (recent connections & analogies)
- `demiurgos dream` — Trigger a DMN cycle manually (force a wandering session)
- `demiurgos status` — System health

**Verification**:
- Ask 10 test questions → verify Tier 1 (local) is tried first
- Ask a hard question → verify escalation to higher tiers
- Check cost log → verify accurate tracking
- Stop Ollama → verify graceful fallback to cloud

---

## STAGE 2: Vector Cache (Days 6-10)
**Deliverable**: Semantic caching that catches 30-40% of queries for free.

### 2.1 ChromaDB Integration
```
packages/demiurgos/src/cache/
├── vector-store.ts     ← ChromaDB client, collections management
├── embeddings.ts       ← sentence-transformers on 3060 GPU
├── similarity.ts       ← Scoring, threshold tuning
└── adapter.ts          ← Take a cached result + adapt to new question
```

### 2.2 Cache Strategy
- **Exact match** (similarity > 0.92): Return cached result directly, FREE
- **Close match** (similarity > 0.85): Use cheapest model to adapt cached result, nearly free
- **Miss** (similarity < 0.85): Full execution through engine
- **TTL**: Knowledge answers = 30 days, code answers = 7 days, time-sensitive = 1 day
- **Invalidation**: Manual purge command, auto-purge on low-quality flags

### 2.3 Embedding Pipeline
- Model: `all-MiniLM-L6-v2` (runs on 3060, 384-dim embeddings, fast)
- Chunk strategy: Full question + answer stored together
- Metadata tags: domain, model_used, quality_score, timestamp, cost_saved

**Verification**:
- Ask same question twice → second should be instant + free
- Ask slightly different version → should trigger adaptation path
- Check `demiurgos cache` → should show hit rate growing

---

## STAGE 3: Knowledge Base & Active Learning (Days 11-20)
**Deliverable**: System that ingests external knowledge and self-improves.

### 3.1 Knowledge Ingestion Pipeline
```
packages/demiurgos/src/knowledge/
├── ingestor.ts         ← Base ingestion interface
├── chunker.ts          ← Text → chunks with overlap
├── sources/
│   ├── usda.ts         ← USDA agricultural databases
│   ├── youtube.ts      ← yt-dlp + whisper transcription
│   ├── pdf.ts          ← PDF/textbook ingestion
│   ├── web.ts          ← General web scraping
│   ├── wikipedia.ts    ← Wikipedia dump parser
│   └── stackexchange.ts← SE data dump parser
└── scheduler.ts        ← Idle-time scheduling
```

**Priority ingestion order** (most valuable first):
1. USDA poultry production guides — direct domain knowledge
2. FAO livestock management guidelines — international best practices
3. Agricultural engineering references — infrastructure knowledge
4. YouTube channels on poultry farming — practical experience
5. General knowledge bases (Wikipedia, OpenStax) — broad foundation

### 3.2 Active Learning Cycle (`learner/`)
```
packages/demiurgos/src/learner/
├── gap-detector.ts     ← Analyze task logs for failures/escalations
├── study-planner.ts    ← Plan what to study based on gaps
├── self-test.ts        ← Replay failed tasks with new knowledge
└── scheduler.ts        ← Run during idle time only
```

The cycle:
```
IDLE DETECTED (no tasks for 10+ minutes)
  │
  ├─ 1. Scan task log for: failed evaluations, tier escalations,
  │     low-quality scores, repeated similar questions
  │
  ├─ 2. Identify knowledge gap
  │     e.g., "3 questions about feed formulation scored < 0.7"
  │
  ├─ 3. Search knowledge sources for relevant content
  │     → USDA feed composition tables
  │     → YouTube: "poultry feed formulation tutorial"
  │     → OpenStax animal nutrition chapter
  │
  ├─ 4. Ingest → chunk → embed → store in ChromaDB
  │
  └─ 5. Replay failed tasks with enriched context
        → If score improves: knowledge gap filled
        → If not: flag for manual review or frontier model
```

### 3.3 Hive Mind Synthesis (`synthesis/`)
```
packages/demiurgos/src/synthesis/
├── perspectives.ts     ← Domain identification + perspective prompts
├── synthesizer.ts      ← Multi-perspective merging
└── domains.ts          ← Domain definitions (agriculture, finance, engineering, etc.)
```

For complex questions:
1. Identify relevant domains (e.g., "Should I expand to hydroponics?" → agricultural, financial, engineering, market)
2. Retrieve domain-specific knowledge from vector DB
3. Generate domain-specific perspective using appropriate model
4. Synthesize all perspectives into unified recommendation with trade-offs

**Verification**:
- Ingest USDA data → ask poultry question → verify knowledge is retrieved
- Create deliberate failure → wait for idle cycle → verify gap was studied
- Ask complex multi-domain question → verify multiple perspectives synthesized

### 3.4 The Default Mode Network — Intuition Engine (`dmn/`)

The human brain's Default Mode Network activates during rest. It's not idle — it's doing the most creative work: wandering, recombining, finding connections between things that seem unrelated. Shower thoughts. Dreams. The "aha" that comes from nowhere.

Demiurgos needs this. Not targeted learning (that's Stage 3.2). This is **unfocused exploration** — reading random things, forming associations, generating insights nobody asked for.

```
packages/demiurgos/src/dmn/
├── wanderer.ts         ← Random browsing across diverse sources
├── association.ts      ← Cross-domain pattern detection in vector space
├── dreamer.ts          ← Deliberate recombination of unrelated knowledge
├── insight-journal.ts  ← Store and surface surprising connections
└── scheduler.ts        ← Runs during deep idle (no tasks for 30+ minutes)
```

#### How It Works

```
DEEP IDLE DETECTED (no tasks for 30+ minutes)
Active Learner has finished its targeted work
DMN activates:

  ┌──────────────────────────────────────────────────────┐
  │  PHASE 1: WANDER                                     │
  │                                                      │
  │  Read something random. Not targeted. Not useful.    │
  │  Just... interesting.                                │
  │                                                      │
  │  Sources (deliberately diverse):                     │
  │  ├─ Twitter/X trending topics (any topic)            │
  │  ├─ Reddit front page (any subreddit)                │
  │  ├─ Hacker News (tech + startups)                    │
  │  ├─ ArXiv random paper (any field)                   │
  │  ├─ Wikipedia random article                         │
  │  ├─ YouTube trending (any category)                  │
  │  ├─ News headlines (global)                          │
  │  └─ Philosophy, history, art, science blogs          │
  │                                                      │
  │  Read 5-10 random pieces. Embed them.                │
  │  Store in a separate "wandering" collection.         │
  └───────────────────┬──────────────────────────────────┘
                      │
  ┌───────────────────▼──────────────────────────────────┐
  │  PHASE 2: ASSOCIATE                                   │
  │                                                      │
  │  The magic happens here.                             │
  │                                                      │
  │  Take each new wandering embedding and search for    │
  │  UNEXPECTED proximity in the main knowledge base.    │
  │                                                      │
  │  "This tweet about supply chain resilience in        │
  │   fashion retail is embedding-close to this paper    │
  │   about mycorrhizal networks in forests."            │
  │                                                      │
  │  Why? Both describe distributed networks that        │
  │  share resources and information without central     │
  │  control. The vector space found the structural      │
  │  analogy automatically.                              │
  │                                                      │
  │  Cross-domain proximity = potential insight.          │
  │  Same-domain proximity = boring (expected).           │
  │  Filter for SURPRISING connections only.              │
  └───────────────────┬──────────────────────────────────┘
                      │
  ┌───────────────────▼──────────────────────────────────┐
  │  PHASE 3: DREAM (Deliberate Recombination)            │
  │                                                      │
  │  Take 2-3 surprising associations and ask:           │
  │                                                      │
  │  "What does A teach us about B?"                     │
  │  "If the principle behind A applied to B,            │
  │   what would change?"                                │
  │  "What pattern do A and B share that nobody          │
  │   has noticed?"                                      │
  │  "If you were an expert in A, how would you          │
  │   solve the problem in B?"                           │
  │                                                      │
  │  Use a LOCAL model for this. It's exploration,       │
  │  not production. Free. No pressure for quality.      │
  │  Most outputs will be noise. That's fine.            │
  │  We're mining for the 1-in-20 genuine insight.       │
  └───────────────────┬──────────────────────────────────┘
                      │
  ┌───────────────────▼──────────────────────────────────┐
  │  PHASE 4: JOURNAL                                     │
  │                                                      │
  │  Score each generated insight:                       │
  │  ├─ Novelty: Is this connection genuinely new?       │
  │  ├─ Relevance: Could this apply to anything the      │
  │  │  user cares about? (check user's task history)    │
  │  ├─ Depth: Is this surface-level or structural?      │
  │  └─ Actionability: Could this lead to something?     │
  │                                                      │
  │  High-scoring insights → Insight Journal             │
  │  ├─ Stored with: source A, source B, connection,     │
  │  │  potential applications, confidence level         │
  │  │                                                   │
  │  └─ Surfaced to user when:                           │
  │     ├─ They ask about a related topic                │
  │     ├─ Morning brief (if relevant to current work)   │
  │     └─ `demiurgos insights` command                  │
  │                                                      │
  │  Low-scoring → discarded (most of them)              │
  │  That's fine. The brain discards most dreams too.    │
  └──────────────────────────────────────────────────────┘
```

#### The Key Mechanism: Cross-Domain Vector Proximity

This is why the vector database is so powerful for intuition. When you embed text from wildly different domains into the same vector space, the embeddings capture **structural similarity**, not surface similarity.

```
Example discoveries the DMN might make:

Tweet: "Toyota's kanban system reduced inventory waste by 40%
        by making each station pull from the previous one
        instead of pushing work downstream."

Embedding neighbors in knowledge base:
  → Poultry feed management: "Just-in-time feed mixing
    reduces waste and aflatoxin risk"
  → Manure management: "JIT belt operation reduces
    time-on-ground and odor"

DMN Insight: "The farm already uses JIT principles for
feed and manure. What other processes could become
pull-based instead of push-based? What about egg
collection? What about staff scheduling?"

─────────────────────────────────────

arXiv paper: "Antifragility in biological systems:
organisms that benefit from stressor exposure"

Embedding neighbors:
  → Susu-compliance escrow model (team pressure = stressor
    that strengthens compliance culture)
  → Biosecurity protocols (controlled exposure framework)

DMN Insight: "The compliance escrow model is antifragile
by design — violations make the system stronger because
they increase social pressure. Could this principle
extend to equipment maintenance? What if maintenance
delays cost the team directly?"

─────────────────────────────────────

Reddit comment: "The best part of being a beekeeper is
that the bees do most of the work. You just create the
right environment and stay out of the way."

Embedding neighbors:
  → MCOS design philosophy: "structural determinism —
    make compliance the default path"
  → Owner involvement target: <1 hour/week

DMN Insight: "Beekeeping and your farm management
philosophy are structurally identical: design the
environment so the right behavior is effortless,
then minimize intervention. Where is the farm app
still requiring active intervention that could
instead be environmental?"
```

#### Analogical Reasoning Engine

The DMN doesn't just find connections — it reasons about them using **structural analogy**:

```typescript
interface Analogy {
  source_domain: string;       // Where the idea comes from
  target_domain: string;       // Where it might apply
  structural_mapping: {
    // What maps to what
    source_element: string;
    target_element: string;
    relationship: string;
  }[];
  insight: string;             // What this analogy reveals
  strength: number;            // How deep is the structural match
  novelty: number;             // How surprising is this connection
  applications: string[];      // What could you DO with this
}

// The dreamer generates these by prompting:
// "Domain A works like this: [description]
//  Domain B works like this: [description]
//  Map the structural elements of A onto B.
//  What does A's solution suggest about B's problem?
//  What would an expert in A do differently in B?"
```

#### What Makes This Different From Regular RAG

Regular RAG: "User asks question → retrieve relevant docs → answer."
That's **convergent** thinking. Narrowing down to the right answer.

The DMN does **divergent** thinking:
- Nobody asked a question
- It reads randomly, not purposefully
- It finds connections, not answers
- Most output is noise (and that's by design)
- The 5% that isn't noise can be transformative

This is the difference between a search engine and a creative mind.

#### Cost: Nearly Zero

- Wandering: Web scraping + embedding = free (local GPU)
- Association: Vector similarity search = free (ChromaDB)
- Dreaming: Local model inference = free (Ollama on 3060)
- Journaling: SQLite writes = free

The entire DMN runs on your hardware during idle time. No API calls. No cloud costs. Just electricity.

---

## STAGE 4: Persistence & Dashboard (Days 21-28)
**Deliverable**: Full operational visibility and historical tracking.

### 4.1 Operations Database
SQLite for local operational data:
```sql
-- Task execution history
tasks (id, prompt, result, model_used, tier, cost, quality_score,
       cache_hit, duration_ms, timestamp)

-- Cost tracking
costs (id, model, tokens_in, tokens_out, cost_usd, task_id, timestamp)

-- Knowledge base stats
knowledge (id, source, chunks_added, domain, ingested_at)

-- Learning cycle logs
learning (id, gap_identified, sources_studied, improvement_score, timestamp)
```

### 4.2 Dashboard (Local Web UI)
Simple dashboard at `localhost:3000`:
- **Cost overview**: Total spend, daily/weekly/monthly, by model tier
- **Cache performance**: Hit rate, savings, growth trend
- **Quality metrics**: Average scores, failures, escalation rate
- **Knowledge base**: Sources ingested, total chunks, domain coverage
- **Active learning**: Gaps identified, gaps filled, improvement over time
- **DMN Insights**: Insight journal, recent connections, analogies discovered
- **Task history**: Searchable log of all interactions

### 4.3 Reports
- Daily cost summary (auto-generated)
- Weekly learning report (what it studied, what improved)
- Monthly optimization suggestions (which tiers to adjust, models to swap)

---

## STAGE 5: Autonomy & Integration APIs (Days 29-35)
**Deliverable**: Demiurgos can be called by other systems and act on its own.

### 5.1 REST API
```
packages/demiurgos/src/api/
├── server.ts           ← Express server
├── routes/
│   ├── task.ts         ← POST /task, GET /task/:id
│   ├── knowledge.ts    ← POST /ingest, GET /search
│   ├── stats.ts        ← GET /costs, GET /cache, GET /health
│   └── config.ts       ← GET/PUT /config (model thresholds, etc.)
```

Any external system (farm app, scripts, other tools) can call Demiurgos via HTTP.

### 5.2 Webhook Support
Demiurgos can notify external systems when:
- A high-priority alert is generated
- Active learning discovers something notable
- Cost threshold is approaching
- System health changes

### 5.3 Scheduled Tasks
Demiurgos can run recurring tasks:
- Morning brief: "Summarize what I should know today"
- Cost report: Daily spend summary
- Knowledge update: Weekly new-source discovery
- Self-assessment: Monthly performance review

---

## STAGE 6: Hardening & Operations (Days 36-42)
**Deliverable**: Production-ready, auto-starts, self-healing.

### 6.1 Process Management
- Systemd service files for:
  - `demiurgos-engine` — Main orchestrator
  - `demiurgos-learner` — Active learning daemon
  - `demiurgos-dmn` — Default Mode Network (wanderer + dreamer)
  - `demiurgos-api` — REST API server
  - `ollama` — Local model server
  - `chromadb` — Vector database
- Auto-restart on crash
- Auto-start on boot

### 6.2 Error Handling & Resilience
- Ollama down → graceful fallback to cloud (no crash)
- Internet down → queue tasks, serve from cache only
- ChromaDB down → bypass cache, operate without it
- API rate limits → exponential backoff + tier switching
- GPU OOM → reduce batch size, fall back to CPU

### 6.3 Security
- API key authentication for REST endpoints
- Rate limiting
- No sensitive data in vector DB (sanitize before embedding)
- Encrypted API keys in `.env` (never in code)

### 6.4 Backup
- ChromaDB data: daily local backup
- SQLite ops database: daily local backup
- Config files: tracked in git

---

## Operationalization: Day-to-Day Running

### Your Daily Interaction
```
Morning:
  $ demiurgos ask "What should I focus on today?"
  → Synthesizes from your recent tasks, pending items, knowledge updates

During work:
  $ demiurgos ask "What's the best approach for X?"
  → Tries cache → tries local model → escalates if needed
  → Costs tracked automatically

  $ demiurgos task "Research Y and give me a summary"
  → Multi-perspective hive mind synthesis
  → Sources cited, trade-offs noted

End of day:
  $ demiurgos cost
  → "Today: $0.12 | Cache hit rate: 47% | 23 tasks completed"

Overnight:
  → Active learner runs automatically
  → Studies gaps from today's failures
  → Ingests new knowledge sources
  → DMN wanders, reads, dreams, finds connections
  → Tomorrow it's smarter AND more creative than today
```

### Continuous Improvement (Automated)
```
Week 1:  Cache hit rate ~10%, most tasks go to cloud
Week 4:  Cache hit rate ~30%, learning from your patterns
Week 8:  Cache hit rate ~45%, local models handle 60% of tasks
Week 12: Cache hit rate ~55%, cloud costs dropping steadily
Week 24: Cache hit rate ~65%, system costs near-zero for routine work
```

### When to Upgrade
- New Ollama models released → swap in, re-benchmark
- New cheaper API models → add as routing options
- Bigger GPU → run larger local models, reduce cloud dependency further
- Farm app ready → connect via REST API, Demiurgos becomes its brain

---

## Tech Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| Language | TypeScript (Node.js) | Free |
| Local Models | Ollama (Mistral 7B, Llama 3 8B) | Free |
| Cloud Models | Claude API (Haiku → Sonnet → Opus) | Pay per use |
| Vector DB | ChromaDB | Free |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) | Free |
| Ops Database | SQLite | Free |
| Dashboard | Simple Express + vanilla HTML/JS | Free |
| Transcription | Whisper (local on 3060) | Free |
| YouTube DL | yt-dlp | Free |
| Process Mgmt | systemd | Free |

**Total infrastructure cost**: $0/month (your hardware) + cloud API calls only when local models can't handle the task.

---

## Verification Plan

### Stage 1 (Engine):
- `demiurgos ask "What is 2+2?"` → should use Tier 1 (local), cost $0
- `demiurgos ask "Design a distributed system for X"` → should escalate to higher tier
- `demiurgos cost` → should show accurate tracking
- Kill Ollama process → ask question → should fallback to cloud gracefully

### Stage 2 (Cache):
- Ask same question twice → second call instant, cost $0, logged as cache hit
- Ask similar question → should adapt cached answer
- `demiurgos cache` → shows hit rate, total savings

### Stage 3 (Knowledge + DMN):
- Ingest a USDA document → ask related question → answer should reference ingested content
- Force a failure → wait for idle learning cycle → replay → score should improve
- Ask "Should I invest in X?" → should get financial + engineering + agricultural perspectives
- Run `demiurgos dream` → should wander, read, find at least 1 cross-domain connection
- Check `demiurgos insights` → should show insight journal with analogies

### Stage 4 (Dashboard):
- Open localhost:3000 → see cost charts, cache stats, task history
- Verify daily report generation

### Stage 5 (API):
- `curl POST localhost:3001/task` → should execute and return result
- Set up a webhook → verify notification fires

### Stage 6 (Operations):
- Reboot machine → all services should auto-start
- Kill a service → should auto-restart within 5 seconds
- Disconnect internet → should serve from cache, queue new tasks

---

## Files to Create

```
packages/demiurgos/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── engine.ts
│   ├── router.ts
│   ├── contracts.ts
│   ├── evaluator.ts
│   ├── logger.ts
│   ├── config.ts
│   ├── types.ts
│   ├── cli.ts
│   ├── providers/
│   │   ├── base.ts
│   │   ├── ollama.ts
│   │   ├── anthropic.ts
│   │   └── openai.ts
│   ├── cache/
│   │   ├── vector-store.ts
│   │   ├── embeddings.ts
│   │   ├── similarity.ts
│   │   └── adapter.ts
│   ├── knowledge/
│   │   ├── ingestor.ts
│   │   ├── chunker.ts
│   │   ├── scheduler.ts
│   │   └── sources/
│   │       ├── usda.ts
│   │       ├── youtube.ts
│   │       ├── pdf.ts
│   │       ├── web.ts
│   │       ├── wikipedia.ts
│   │       └── stackexchange.ts
│   ├── learner/
│   │   ├── gap-detector.ts
│   │   ├── study-planner.ts
│   │   ├── self-test.ts
│   │   └── scheduler.ts
│   ├── dmn/
│   │   ├── wanderer.ts
│   │   ├── association.ts
│   │   ├── dreamer.ts
│   │   ├── insight-journal.ts
│   │   └── scheduler.ts
│   ├── synthesis/
│   │   ├── perspectives.ts
│   │   ├── synthesizer.ts
│   │   └── domains.ts
│   ├── api/
│   │   ├── server.ts
│   │   └── routes/
│   │       ├── task.ts
│   │       ├── knowledge.ts
│   │       ├── stats.ts
│   │       └── config.ts
│   └── dashboard/
│       ├── server.ts
│       └── public/
│           └── index.html
├── infra/
│   ├── demiurgos-engine.service
│   ├── demiurgos-learner.service
│   ├── demiurgos-dmn.service
│   ├── demiurgos-api.service
│   └── setup.sh
├── demiurgos-constitution.yaml
└── .env.example
```
