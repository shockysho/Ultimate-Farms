# Demiurgos: Standalone Build Plan

## What This Is

A complete, self-contained plan to build and deploy Demiurgos — an autonomous AI orchestrator that routes tasks through the cheapest viable model, caches everything, learns during idle time, dreams up cross-domain insights, and gets smarter and cheaper every day.

**This is a standalone project. It has nothing to do with Ultimate Farms.**

**How to use this file:** Open a fresh Claude Code session, clone the repo, and say "Build Demiurgos using docs/DEMIURGOS_BUILD_PLAN.md as the blueprint." Each stream executes autonomously. Owner actions are at the end.

---

## What Already Exists (Built, 64+ Tests Passing)

The core engine is built in `packages/demiurgos/`. Here's what's done:

### Working Code:

| File | Status | What It Does |
|------|--------|-------------|
| `src/engine.ts` | **DONE** | Full orchestration loop: cache check → contract → route → execute → evaluate → cache result |
| `src/router.ts` | **DONE** | 4-tier model routing (Local → Cheap → Mid → Frontier) |
| `src/contracts.ts` | **DONE** | Task classification + contract generation from constitution |
| `src/evaluator.ts` | **DONE** | 5-dimension scoring + evidence confidence + coherence confidence |
| `src/logger.ts` | **DONE** | SQLite-backed task/cost logging |
| `src/config.ts` | **DONE** | Model configs, tier definitions, cost tables |
| `src/types.ts` | **DONE** | All TypeScript types |
| `src/cli.ts` | **DONE** | CLI: `ask`, `task`, `cost`, `cache`, `insights`, `dream`, `status` |
| `src/providers/base.ts` | **DONE** | Provider interface |
| `src/providers/ollama.ts` | **DONE** | Ollama adapter (Tier 1, FREE) |
| `src/providers/anthropic.ts` | **DONE** | Claude adapter (Tier 2-4) |
| `src/providers/openai.ts` | **DONE** | OpenAI adapter (Tier 2-3) |
| `src/providers/mock.ts` | **DONE** | Mock provider for testing |
| `src/cache/vector-store.ts` | **DONE** | SQLite-backed vector store with TF-IDF similarity |
| `src/cache/embeddings.ts` | **DONE** | Text → embedding pipeline |
| `src/cache/task-cache.ts` | **DONE** | Semantic cache (exact >0.92, adapt >0.85, miss) |
| `src/knowledge/ingestor.ts` | **DONE** | Text → chunks → vector store |
| `src/knowledge/chunker.ts` | **DONE** | Text chunking with overlap |
| `src/knowledge/sources/pdf.ts` | **DONE** | PDF ingestion |
| `src/knowledge/sources/web.ts` | **DONE** | Web scraping ingestion |
| `src/learner/gap-detector.ts` | **DONE** | Analyzes task logs for failures/escalations |
| `src/learner/study-planner.ts` | **DONE** | Plans what to study based on gaps |
| `src/learner/scheduler.ts` | **DONE** | Idle-time learning scheduler |
| `src/dmn/wanderer.ts` | **DONE** | Random web browsing + embedding |
| `src/dmn/association.ts` | **DONE** | Cross-domain vector proximity detection |
| `src/dmn/dreamer.ts` | **DONE** | Deliberate recombination of unrelated knowledge |
| `src/dmn/insight-journal.ts` | **DONE** | Store/surface surprising connections |
| `src/dmn/scheduler.ts` | **DONE** | DMN activation during deep idle |
| `src/synthesis/synthesizer.ts` | **DONE** | Multi-perspective hive mind synthesis |
| `src/api/server.ts` | **DONE** | REST API scaffold |
| `src/dashboard/server.ts` | **DONE** | Dashboard scaffold |
| `demiurgos-constitution.yaml` | **DONE** | Hard rules, structural rules, default thresholds |
| `__tests__/` | **DONE** | 64+ tests passing (engine, cache, knowledge) |

### What's NOT Done (The Gaps):

1. **Embeddings are TF-IDF, not real vectors** — Works but low quality. Need GPU-accelerated sentence-transformers.
2. **No real ChromaDB** — Using custom SQLite vector store. Fine for prototype but won't scale.
3. **Dashboard is scaffold only** — Express server exists but no actual UI.
4. **API routes are minimal** — Server exists but routes aren't fully fleshed out.
5. **No systemd services** — No auto-start, no auto-restart.
6. **No proper GPU utilization** — The 3060 isn't being used for embeddings or local inference optimization.
7. **No feedback loop** — The system logs but doesn't learn from user acceptance/rejection.
8. **No self-test** — Active learner plans studies but doesn't replay failed tasks.
9. **Knowledge sources are basic** — Web + PDF work, but no USDA, YouTube (yt-dlp + Whisper), Wikipedia, StackExchange ingestors.
10. **DMN runs but doesn't have diverse source URLs** — Wanderer works but needs curated source lists.
11. **No evidence-grounded confidence** — Evaluator scores dimensions but doesn't trace claims to knowledge base sources.
12. **No per-claim decomposition** — Evaluates whole output, not individual claims.
13. **No counter-argument resilience testing** — Coherence is scored but adversarial self-examination isn't implemented.
14. **No calibration from feedback** — Thresholds are static, not learned.
15. **No cost budget enforcement** — Daily/monthly budgets defined in config but not enforced.

---

## Architecture (Reference)

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
                │  Task Intake        │  ← Natural language
                │       ↓             │
                │  Cache Check        │  ← Vector similarity
                │       ↓ (miss)      │
                │  Contract Gen       │  ← "What good looks like"
                │       ↓             │
                │  Cost Router        │  ← Cheapest viable model first
                │  Tier 1→2→3→4      │
                │       ↓             │
                │  Evaluator          │  ← Does output meet contract?
                │  (evidence-based)   │     Pass → cache + return
                │       ↓             │     Fail → escalate tier
                │  Logger             │  ← Cost, quality, model, time
                ├─────────────────────┤
                │  KNOWLEDGE BASE     │  ← ChromaDB vectors
                │  ACTIVE LEARNER     │  ← Studies during idle
                │  DEFAULT MODE NET   │  ← Wanders, dreams, connects
                │  HIVE MIND          │  ← Multi-perspective synthesis
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

## Build Streams

### Stream 1: GPU-Accelerated Embeddings

**Goal:** Replace TF-IDF with real sentence-transformer embeddings running on the RTX 3060.

**Why this matters:** The entire cache, knowledge base, DMN, and synthesis system depends on embedding quality. TF-IDF can't capture semantic similarity — it matches words, not meaning. This is the foundation everything else builds on.

1. Install Python embedding server:
   - Create `packages/demiurgos/embedding-server/`
   - Use `sentence-transformers` with `all-MiniLM-L6-v2` (384-dim, fast, good quality)
   - Simple FastAPI server: `POST /embed` → returns float array
   - Configure to use CUDA (RTX 3060)
   - Dockerfile for containerization

2. Update `src/cache/embeddings.ts`:
   - Replace TF-IDF with HTTP calls to embedding server
   - Cache embeddings locally (avoid re-computing)
   - Batch embedding support (embed multiple texts at once)

3. Update `src/cache/vector-store.ts`:
   - Store real 384-dim vectors instead of TF-IDF hashes
   - Use cosine similarity on real vectors
   - Index optimization for fast nearest-neighbor search (HNSW if size grows)

4. Migrate existing cached data:
   - Re-embed all existing cache entries with new embeddings
   - Re-embed all knowledge base entries

5. Add Docker Compose service for embedding server:
   ```yaml
   embedding-server:
     build: ./packages/demiurgos/embedding-server
     runtime: nvidia  # GPU passthrough
     ports: ["8080:8080"]
   ```

**Verification:** Cache hit rate should improve noticeably. Similar questions with different wording should now match.

---

### Stream 2: ChromaDB Integration

**Goal:** Replace custom SQLite vector store with ChromaDB for production-grade vector search.

1. Add ChromaDB to Docker Compose:
   ```yaml
   chromadb:
     image: chromadb/chroma:latest
     ports: ["8000:8000"]
     volumes: ["chroma-data:/chroma/chroma"]
   ```

2. Create `src/cache/chroma-store.ts`:
   - ChromaDB client connecting to `CHROMA_URL`
   - Collections: `task_cache`, `knowledge`, `wandering`
   - Use embedding server from Stream 1 for consistency
   - Metadata filtering support (domain, source, tier, timestamp)

3. Update all consumers:
   - `task-cache.ts` → use ChromaDB collection
   - `knowledge/ingestor.ts` → use ChromaDB collection
   - `dmn/wanderer.ts` → use ChromaDB collection
   - `dmn/association.ts` → cross-collection similarity search

4. Migration script:
   - Export existing SQLite vector data
   - Import into ChromaDB collections
   - Verify data integrity

5. Fallback: Keep SQLite store as offline fallback if ChromaDB is unavailable.

**Verification:** `demiurgos cache` shows ChromaDB backend. Cross-collection search works for DMN associations.

---

### Stream 3: Evidence-Grounded Confidence System

**Goal:** Implement the per-claim decomposition and evidence-tracing system described in DEMIURGOS_PLAN.md.

This is the heart of what makes Demiurgos different from a dumb API wrapper.

1. Create `src/evaluator/claim-decomposer.ts`:
   - Takes an output string → breaks it into individual claims
   - Uses a cheap model (Tier 1/2) to decompose
   - Each claim is a factual assertion, recommendation, or inference

2. Create `src/evaluator/evidence-tracer.ts`:
   - For each claim, searches knowledge base for supporting sources
   - Computes evidence tier (Tier 0-5) based on source quality + agreement
   - Tracks: source authority, cross-reference agreement, computability, prior user verification

3. Create `src/evaluator/coherence-tester.ts`:
   - Logical chain integrity check
   - Internal consistency check
   - Counter-argument resilience (adversarial self-examination):
     ```typescript
     async function testResilience(reasoning, conclusion, provider) {
       // Ask the model to ATTACK its own conclusion
       // If it can't find a strong counter-argument → high resilience
     }
     ```
   - Track record from historical data

4. Update `src/evaluator.ts`:
   - Replace monolithic evaluation with:
     1. Decompose output into claims
     2. Trace evidence for each claim
     3. Test coherence
     4. Combine into per-claim + overall confidence
   - Two dimensions: evidence confidence + coherence confidence
   - Confidence matrix determines verdict:
     - Evidence HIGH + Score HIGH → PASS
     - Evidence LOW + Score HIGH → ESCALATE EVALUATOR (not model)
     - Evidence HIGH + Score LOW → FAIL
     - Evidence LOW + Score LOW → ESCALATE EVALUATOR

5. Update output format to include per-claim confidence:
   ```
   Answer: [full response]

   Confidence breakdown:
   - Claim 1: "..." — Tier 5 (verified, 0.95)
   - Claim 2: "..." — Tier 2 (single inference, 0.55) ⚠️
   - Claim 3: "..." — Tier 4 (authoritative source, 0.88)
   ```

**Verification:** Ask a question with mixed-confidence claims → system correctly identifies which parts are verified vs speculative.

---

### Stream 4: Feedback Loop & Adaptive Thresholds

**Goal:** System learns YOUR standards from your accept/reject decisions.

1. Create `src/feedback/collector.ts`:
   - After each response, optionally prompt: `[Accept / Reject / Flag]`
   - On reject: capture reason (too generic, wrong facts, missing info, can't act on it)
   - Store feedback in SQLite: `feedback(task_id, verdict, reason, dimension_affected, timestamp)`

2. Create `src/feedback/calibrator.ts`:
   - Weekly calibration job:
     - Compute acceptance rate per task type + domain
     - Adjust thresholds: if 90% accepted at current threshold → good. If 70% → thresholds inflated, reduce.
     - Adjust dimension weights: if most rejections cite "too generic" → increase specificity weight
   - Calibration history stored for trend tracking

3. Update contract generation:
   - Load calibrated thresholds instead of defaults when feedback exists
   - Fallback to constitution defaults when no feedback data for a category

4. CLI integration:
   - `demiurgos feedback` — show feedback summary
   - After each `ask`/`task`, show result + `[a]ccept [r]eject [f]lag` prompt
   - `demiurgos calibrate` — force a calibration run

5. Calibration phases:
   - Week 1-2: Flag everything for review (learning your standards)
   - Week 3-4: Only flag low-confidence + new task types
   - Week 5+: Only flag when uncertain (evaluator confidence < 0.6)

**Verification:** Reject 5 responses as "too generic" → threshold for specificity should increase on next calibration.

---

### Stream 5: Rich Knowledge Sources

**Goal:** Build ingestors for USDA, YouTube, Wikipedia, and StackExchange.

1. Create `src/knowledge/sources/usda.ts`:
   - Scrape USDA poultry production guides
   - Parse tables and data from USDA NASS
   - Tag with domain: `poultry`, authority: `0.95`

2. Create `src/knowledge/sources/youtube.ts`:
   - Integration with `yt-dlp` for audio download
   - Whisper transcription (local, runs on 3060)
   - Create `packages/demiurgos/transcription-server/`:
     - FastAPI + `faster-whisper` (GPU-accelerated)
     - `POST /transcribe` → returns text
   - Chunk transcripts and ingest
   - Tag with: channel name, video title, domain

3. Create `src/knowledge/sources/wikipedia.ts`:
   - Wikipedia API for article content
   - Focus on agriculture, animal science, business categories
   - Clean wiki markup to plain text
   - Tag with authority: `0.7` (good but not primary source)

4. Create `src/knowledge/sources/stackexchange.ts`:
   - Agriculture SE, Sustainability SE data
   - Fetch top answers for relevant topics
   - Tag with: vote count as quality signal

5. Update `src/learner/study-planner.ts`:
   - When gap detected, choose which source to study from:
     - Factual gap → USDA first, then Wikipedia
     - Practical gap → YouTube tutorials
     - Technical gap → StackExchange
   - Priority order configurable in constitution

6. Add Docker Compose service for Whisper:
   ```yaml
   whisper-server:
     build: ./packages/demiurgos/transcription-server
     runtime: nvidia
     ports: ["8081:8081"]
   ```

**Verification:** `demiurgos ingest youtube <url>` transcribes and stores. `demiurgos ask` about the topic retrieves it.

---

### Stream 6: Active Learner Self-Test

**Goal:** When the learner fills a knowledge gap, it replays failed tasks to verify improvement.

1. Create `src/learner/self-test.ts`:
   - Query task log for failed/escalated tasks in the gap's domain
   - Re-run each failed task with enriched knowledge context
   - Score improvement: new_score - old_score
   - Log: gap, sources studied, improvement score

2. Update `src/learner/scheduler.ts`:
   - After study phase, trigger self-test phase
   - Only declare gap "filled" if replayed tasks score higher

3. Create improvement dashboard data:
   - Gap identified → sources studied → improvement measured
   - Track "knowledge coverage" by domain over time

**Verification:** Create deliberate gap (ask poultry nutrition question with empty KB) → fail → wait for idle → learner studies → replay → score improves.

---

### Stream 7: DMN Source Curation & Analogical Reasoning

**Goal:** Give the DMN diverse, high-quality sources to wander through, and implement structural analogy detection.

1. Create `src/dmn/sources.ts`:
   - Curated URL lists by domain:
     - Tech: Hacker News API, ArXiv random
     - Business: business blogs, economics
     - Science: Nature, Science Daily
     - Agriculture: farming forums, ag news
     - Philosophy/Art: diverse intellectual sources
     - Reddit: r/all, r/science, r/dataisbeautiful, r/agriculture
   - Random selection per wandering cycle

2. Implement structural analogy in `src/dmn/association.ts`:
   - Cross-collection similarity search:
     ```
     For each new wandering embedding:
       Search knowledge base for unexpected proximity
       Filter: same-domain matches = boring, discard
       Keep: cross-domain matches = potential insight
     ```
   - Structural mapping:
     ```typescript
     interface Analogy {
       source_domain: string;
       target_domain: string;
       structural_mapping: { source_element, target_element, relationship }[];
       insight: string;
       strength: number;
       novelty: number;
       applications: string[];
     }
     ```

3. Enhance `src/dmn/dreamer.ts`:
   - Deliberate recombination prompts:
     - "What does A teach us about B?"
     - "If the principle behind A applied to B, what would change?"
     - "What pattern do A and B share that nobody has noticed?"
   - Score generated insights: novelty, relevance to user's task history, depth, actionability
   - Store high-scoring insights in journal

4. Enhance `src/dmn/insight-journal.ts`:
   - Surface insights contextually:
     - When user asks about a related topic → "By the way, the DMN found this connection..."
     - In morning brief
     - Via `demiurgos insights` command

**Verification:** Run `demiurgos dream` → wanders 5+ sources → finds at least 1 cross-domain connection → stores in journal.

---

### Stream 8: Dashboard UI

**Goal:** Full operational visibility at `localhost:3000`.

1. Create `src/dashboard/public/` with a single-page app (vanilla HTML/JS/CSS — keep it simple):

   **Panels:**
   - **Cost Overview**: Total spend today/week/month, by model tier, trend chart
   - **Cache Performance**: Hit rate %, total savings ($), growth trend
   - **Quality Metrics**: Average composite score, failure rate, escalation rate
   - **Knowledge Base**: Total chunks, domains covered, sources ingested
   - **Active Learning**: Gaps identified, gaps filled, improvement scores
   - **DMN Insights**: Recent analogies and connections from the insight journal
   - **Task History**: Searchable/filterable log of all interactions
   - **Model Breakdown**: Which models handle what %, cost per model
   - **Feedback Summary**: Acceptance rate, common rejection reasons, calibration status

2. Update `src/dashboard/server.ts`:
   - Serve static files from `public/`
   - REST endpoints for all dashboard data:
     - `GET /dashboard/api/costs` — cost aggregates
     - `GET /dashboard/api/cache` — cache stats
     - `GET /dashboard/api/quality` — quality metrics
     - `GET /dashboard/api/knowledge` — KB stats
     - `GET /dashboard/api/learning` — learning cycle logs
     - `GET /dashboard/api/insights` — DMN insight journal
     - `GET /dashboard/api/tasks` — task history with pagination
     - `GET /dashboard/api/feedback` — feedback summary

3. Auto-refresh every 30 seconds.

**Verification:** Open `localhost:3000` → see real data from Demiurgos operations.

---

### Stream 9: REST API Completion

**Goal:** External systems can call Demiurgos via HTTP.

1. Complete `src/api/server.ts` routes:
   ```
   POST   /api/task              # Execute a task
   GET    /api/task/:id          # Get task result
   POST   /api/ingest            # Ingest content into knowledge base
   POST   /api/ingest/url        # Ingest from URL
   POST   /api/ingest/youtube    # Ingest from YouTube (transcribe + store)
   GET    /api/search            # Search knowledge base
   GET    /api/costs             # Cost breakdown
   GET    /api/costs/budget      # Budget status (daily/monthly)
   GET    /api/cache/stats       # Cache statistics
   GET    /api/health            # System health
   GET    /api/config            # Current configuration
   PUT    /api/config            # Update configuration
   POST   /api/feedback          # Submit feedback on a task
   GET    /api/insights          # Get DMN insights
   POST   /api/dream             # Trigger DMN cycle manually
   ```

2. Authentication:
   - API key in header: `X-API-Key: <key>`
   - Key stored in `.env`
   - Rate limiting (100 req/min default)

3. Webhook support:
   - `POST /api/webhooks` — register a webhook URL
   - Fire on: critical alerts, notable insights, budget threshold reached
   - Retry with exponential backoff

4. Budget enforcement:
   - Track daily/monthly spend against limits in config
   - Reject tasks that would exceed budget (return 402)
   - Or auto-downgrade to local-only mode when budget tight

**Verification:** `curl -X POST localhost:3001/api/task -d '{"prompt": "test"}' -H "X-API-Key: xxx"` → returns result.

---

### Stream 10: Systemd Services & Auto-Start

**Goal:** Production-ready process management. Everything starts on boot, restarts on crash.

1. Create systemd service files in `packages/demiurgos/infra/`:
   ```
   demiurgos-engine.service    # Main orchestrator
   demiurgos-api.service       # REST API (port 3001)
   demiurgos-dashboard.service # Dashboard (port 3000)
   demiurgos-embedding.service # Embedding server (port 8080)
   demiurgos-whisper.service   # Whisper transcription (port 8081)
   ```

2. Or (recommended): Docker Compose for everything:
   ```yaml
   services:
     ollama:
       image: ollama/ollama
       runtime: nvidia
       volumes: ["ollama-models:/root/.ollama"]

     chromadb:
       image: chromadb/chroma
       volumes: ["chroma-data:/chroma/chroma"]

     embedding-server:
       build: ./embedding-server
       runtime: nvidia

     whisper-server:
       build: ./transcription-server
       runtime: nvidia

     demiurgos:
       build: .
       depends_on: [ollama, chromadb, embedding-server]
       environment:
         - OLLAMA_BASE_URL=http://ollama:11434
         - CHROMA_URL=http://chromadb:8000
         - EMBEDDING_URL=http://embedding-server:8080
       ports:
         - "3000:3000"  # Dashboard
         - "3001:3001"  # API
       volumes:
         - demiurgos-data:/app/data
   ```

3. Create `setup.sh`:
   - Install Docker + NVIDIA Container Toolkit
   - Pull Ollama models (mistral, llama3)
   - Create `.env` from template
   - `docker compose up -d`

4. Health checks on all containers.

5. Backup cron:
   - Daily: `docker exec chromadb ...` backup ChromaDB
   - Daily: Copy SQLite databases to backup volume
   - 30-day retention

**Verification:** `docker compose up -d` → all services start. Kill one → auto-restarts. Reboot → auto-starts.

---

### Stream 11: Error Handling & Resilience

**Goal:** Graceful degradation when things fail.

1. Ollama down:
   - Detect via health check failure
   - Skip Tier 1 routing, go straight to cloud
   - Log warning, don't crash

2. Internet down:
   - Detect via failed API calls
   - Serve from cache only
   - Queue new tasks for later execution
   - Show "offline mode" in dashboard

3. ChromaDB down:
   - Fall back to SQLite vector store
   - Log warning
   - Auto-reconnect when ChromaDB returns

4. API rate limits:
   - Exponential backoff (2s, 4s, 8s, 16s, 32s)
   - Switch to different provider if one is rate-limited
   - Track rate limit events for routing optimization

5. GPU OOM:
   - Catch CUDA OOM errors from embedding/whisper servers
   - Reduce batch size
   - Fall back to CPU if needed

6. Budget exceeded:
   - Switch to local-only mode (Tier 1 only)
   - Notify via dashboard + webhook
   - Resume normal routing when new budget period starts

**Verification:** Kill Ollama → system continues with cloud. Disconnect internet → serves from cache. Exceed budget → goes local-only.

---

### Stream 12: Testing & Hardening

**Goal:** Comprehensive test coverage for everything built in Streams 1-11.

1. Unit tests (extend existing Vitest suite):
   - Claim decomposer
   - Evidence tracer
   - Coherence tester
   - Feedback collector + calibrator
   - All knowledge source ingestors
   - DMN components (wanderer, association, dreamer, journal)
   - API routes
   - Budget enforcement

2. Integration tests:
   - Full pipeline: prompt → cache check → route → execute → evaluate → cache → return
   - Feedback loop: submit feedback → calibrate → verify threshold change
   - DMN full cycle: wander → associate → dream → journal
   - Knowledge ingestion: ingest → search → verify retrieval
   - Offline mode: disconnect → cache-only → reconnect → sync

3. Live integration tests (with real providers):
   - Ollama (local) end-to-end
   - Anthropic API end-to-end
   - Embedding server end-to-end

4. Performance benchmarks:
   - Cache lookup latency (target: <50ms)
   - Embedding generation latency (target: <100ms per text)
   - Knowledge search latency (target: <200ms)

**Verification:** Full test suite passes. All critical paths have coverage.

---

## Owner Onboarding Checklist

**Do these AFTER all streams are built. This is everything you need to do to go live.**

### A. Hardware Setup (Your RTX 3060 PC)

- [ ] **Install NVIDIA drivers** (if not already):
  ```bash
  sudo apt install nvidia-driver-535
  ```
- [ ] **Install Docker + NVIDIA Container Toolkit**:
  ```bash
  # Docker
  curl -fsSL https://get.docker.com | sh
  # NVIDIA Container Toolkit
  distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
  sudo nvidia-ctk runtime configure --runtime=docker
  sudo systemctl restart docker
  ```
- [ ] **Verify GPU access**: `docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.0-base nvidia-smi`

### B. Clone & Configure

- [ ] **Clone the repo**:
  ```bash
  git clone https://github.com/shockysho/Ultimate-Farms.git
  cd Ultimate-Farms/packages/demiurgos
  ```
- [ ] **Copy `.env.example` to `.env`**:
  ```bash
  cp .env.example .env
  ```
- [ ] **Fill in your API keys** (at least one cloud provider):
  - [ ] `ANTHROPIC_API_KEY=sk-ant-...` (get from console.anthropic.com)
  - [ ] `OPENAI_API_KEY=sk-...` (optional, get from platform.openai.com)
  - [ ] Generate API key for Demiurgos itself: `openssl rand -hex 32` → paste into `DEMIURGOS_API_KEY`
- [ ] **Set your budget limits**:
  - [ ] `DAILY_BUDGET_USD=5.00` (adjust to your comfort)
  - [ ] `MONTHLY_BUDGET_USD=50.00` (adjust to your comfort)

### C. Launch

- [ ] **Start everything**:
  ```bash
  docker compose up -d
  ```
- [ ] **Pull Ollama models** (first time only, takes 5-10 min):
  ```bash
  docker exec ollama ollama pull mistral
  docker exec ollama ollama pull llama3
  ```
- [ ] **Verify all services**:
  ```bash
  docker compose ps  # All should show "Up"
  curl localhost:3001/api/health  # Should return OK
  ```

### D. First Run

- [ ] **Open dashboard**: `http://localhost:3000`
- [ ] **Ask your first question**:
  ```bash
  npx tsx src/cli.ts ask "What is the optimal temperature range for layer hens?"
  ```
- [ ] **Verify tier routing**: Check dashboard → should show Tier 1 (Ollama) was tried first
- [ ] **Test escalation**: Ask something complex:
  ```bash
  npx tsx src/cli.ts ask "Design a biosecurity protocol for a 10,000-bird layer operation in West Africa"
  ```
- [ ] **Verify caching**: Ask the same question again → should be instant (cache hit)

### E. Feed It Knowledge

- [ ] **Ingest your own documents** (farm manuals, guides, etc.):
  ```bash
  npx tsx src/cli.ts ingest /path/to/document.pdf --domain poultry
  ```
- [ ] **Ingest YouTube videos** you find useful:
  ```bash
  npx tsx src/cli.ts ingest-youtube "https://youtube.com/watch?v=..." --domain poultry
  ```
- [ ] **Let it study overnight**: The active learner and DMN will run automatically during idle.

### F. Calibration (Weeks 1-2)

- [ ] **Rate responses**: After each `ask`, hit `[a]ccept` or `[r]eject` with a reason
- [ ] **Do this for ~50 interactions** to calibrate thresholds to YOUR standards
- [ ] **Check calibration status**: `npx tsx src/cli.ts feedback`

### G. Edit Your Constitution (Optional)

- [ ] **Review `demiurgos-constitution.yaml`**
- [ ] **Add your own hard rules** if needed:
  ```yaml
  hard_rules:
    - id: your-custom-rule
      rule: "Always include cost implications when recommending equipment"
      action: instant_fail
  ```
- [ ] **Adjust structural rules** per task type as you discover preferences

### H. Monitor & Enjoy

- [ ] **Check dashboard daily** for the first week:
  - Cache hit rate should climb from ~10% to ~30%
  - Cloud costs should decrease as local models handle more
  - DMN insights tab should start showing connections
- [ ] **Check `demiurgos insights`** weekly for DMN discoveries
- [ ] **By week 4**: System should be largely autonomous, costing near-zero for routine queries

---

## Expected Cost Trajectory

| Week | Cache Hit Rate | Local Model % | Cloud Cost/Day | Behavior |
|------|---------------|---------------|----------------|----------|
| 1 | ~10% | ~40% | ~$2-3 | Learning your standards, building cache |
| 2 | ~20% | ~50% | ~$1-2 | Calibrating thresholds from feedback |
| 4 | ~35% | ~60% | ~$0.50-1 | Most routine queries cached or local |
| 8 | ~45% | ~70% | ~$0.20-0.50 | Strong cache, good local routing |
| 12 | ~55% | ~75% | ~$0.10-0.20 | Only novel/complex goes to cloud |
| 24 | ~65% | ~80% | ~$0.05-0.10 | Near-zero for routine work |

---

## Tech Stack Summary

| Component | Technology | Cost |
|-----------|-----------|------|
| Language | TypeScript (Node.js) | Free |
| Local Models | Ollama (Mistral 7B, Llama 3 8B) | Free |
| Cloud Models | Claude API (Haiku → Sonnet → Opus) | Pay per use |
| Vector DB | ChromaDB | Free |
| Embeddings | sentence-transformers on RTX 3060 | Free |
| Transcription | Whisper on RTX 3060 | Free |
| Ops Database | SQLite | Free |
| Dashboard | Express + vanilla HTML/JS | Free |
| Containers | Docker Compose | Free |
| GPU Runtime | NVIDIA Container Toolkit | Free |

**Total infrastructure cost**: $0/month (your hardware) + cloud API calls only when local models can't handle the task.
