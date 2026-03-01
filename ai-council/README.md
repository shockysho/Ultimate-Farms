# AI Council - Autonomous Multi-AI Deliberation System

An autonomous system where Claude (Chairman) orchestrates a council of AI models
(GPT, Gemini, Kimi, DeepSeek) to iteratively explore, debate, stress-test, and
build a comprehensive Project Bible for Ultimate Farms.

## How It Works

```
                    ┌─────────────────┐
                    │  CLAUDE          │
                    │  (Chairman)      │
                    │                  │
                    │  Orchestrates,   │
                    │  Synthesizes,    │
                    │  Stress-tests    │
                    └───────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────┴─────┐ ┌────┴────┐ ┌──────┴─────┐
        │   GPT     │ │ Gemini  │ │   Kimi     │  ...
        │           │ │         │ │            │
        │ Assigned  │ │ Assigned│ │ Assigned   │
        │ Role A    │ │ Role B  │ │ Role C     │
        └─────┬─────┘ └────┬────┘ └──────┬─────┘
              │             │             │
              └─────────────┼─────────────┘
                            │
                    ┌───────┴─────────┐
                    │  PROJECT BIBLE   │
                    │  (Continuously   │
                    │   refined)       │
                    └─────────────────┘
```

### Each Cycle (runs every 5 minutes by default):

1. **Problem Discovery** - Claude reviews the Bible and identifies the next unexplored problem
2. **Angle Assignment** - Claude picks the most relevant advisor roles and creates specialized prompts
3. **Council Deliberation** - All advisors respond in parallel from their unique perspectives
4. **Synthesis** - Claude synthesizes agreements, tensions, and blind spots
5. **Stress Testing** - Claude creates worst-case scenarios, advisors try to break the solution
6. **Bible Update** - Claude integrates refined insights into the master document
7. **Repeat** - Move to the next problem

### Advisor Roles (10 available, 4-5 assigned per cycle):

| Role | Angle |
|------|-------|
| Devil's Advocate | Failure modes, risks, worst-case scenarios |
| Domain Expert (Poultry) | Operational realities, biological constraints |
| Systems Architect | Technical architecture, offline resilience |
| Behavioral Economist | Human behavior, incentives, gaming risks |
| Financial Strategist | Unit economics, ROI, cash flow impact |
| UX/Accessibility Specialist | Real-world usability, device constraints |
| Red Team / Security Analyst | Fraud vectors, insider threats, data privacy |
| Scaling & Growth Strategist | Multi-farm deployment, platform potential |
| Regulatory & Compliance Expert | Labor law, food safety, legal liability |
| Contrarian Innovator | Alternative approaches, radical rethinking |

## Quick Start

```bash
# 1. Install dependencies
cd ai-council
pip install -r requirements.txt

# 2. Configure API keys
cp .env.example .env
# Edit .env with your API keys (at minimum: ANTHROPIC_API_KEY + one other)

# 3. Check setup
python run.py --status

# 4. Run a single test cycle
python run.py --once

# 5. Run continuously (24/7 mode)
python run.py

# 6. Run 10 cycles with 2-minute intervals
python run.py --cycles 10 --interval 120
```

## What You Need

**Required:**
- Python 3.11+
- Anthropic API key (Claude acts as Chairman)
- At least 1 other AI provider API key

**Supported Providers:**
- Anthropic (Claude) - **Required** as Chairman
- OpenAI (GPT-4o) - via `OPENAI_API_KEY`
- Google (Gemini) - via `GOOGLE_API_KEY`
- Moonshot (Kimi) - via `MOONSHOT_API_KEY`
- OpenRouter (100+ models) - via `OPENROUTER_API_KEY`

## Output

- `output/project_bible.md` - The continuously evolving master document
- `output/sessions/` - Detailed logs of each council cycle
- `output/council.log` - System log

## Running 24/7

To run the council as a background service:

```bash
# Using nohup (simple)
nohup python run.py > /dev/null 2>&1 &

# Using screen
screen -S council
python run.py
# Ctrl+A, D to detach

# Using systemd (production)
# See below for service file
```

### Systemd Service File

Create `/etc/systemd/system/ai-council.service`:

```ini
[Unit]
Description=AI Council - Multi-AI Deliberation System
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/Ultimate-Farms/ai-council
ExecStart=/usr/bin/python3 run.py
Restart=always
RestartSec=30
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-council
sudo systemctl start ai-council
sudo journalctl -u ai-council -f  # Watch logs
```

## Cost Estimates

Each cycle makes roughly:
- 4-5 Claude API calls (Chairman duties)
- 3-4 advisor API calls (one per advisor)
- 2-3 stress test API calls

At 5-minute intervals (288 cycles/day), expect roughly:
- ~1,500 API calls per day across all providers
- Costs vary by provider and model selection

Adjust `CYCLE_INTERVAL_SECONDS` in `.env` to control spend.

## Architecture

```
ai-council/
├── run.py           # Entry point and CLI
├── council.py       # Main orchestration loop (the engine)
├── providers.py     # AI provider adapters (Claude, GPT, Gemini, Kimi)
├── roles.py         # Advisor role definitions and system prompts
├── bible.py         # Project Bible builder and manager
├── config.py        # Configuration and provider detection
├── requirements.txt # Python dependencies
├── .env.example     # API key template
└── output/          # Generated files (gitignored)
    ├── project_bible.md
    ├── council.log
    └── sessions/
```
