#!/usr/bin/env python3
"""
AI Council Runner - Autonomous Multi-AI Deliberation System

Starts an AI Council where Claude (Chairman) orchestrates multiple AI models
(GPT, Gemini, Kimi, DeepSeek) to iteratively explore, debate, stress-test,
and build a comprehensive Project Bible for Ultimate Farms.

Usage:
    python run.py              # Run continuously (24/7 mode)
    python run.py --cycles 5   # Run exactly 5 cycles then stop
    python run.py --once       # Run a single cycle
    python run.py --status     # Show current Bible and session status

Setup:
    1. pip install -r requirements.txt
    2. cp .env.example .env
    3. Fill in your API keys in .env
    4. python run.py
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Ensure we can import from the council package
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    BIBLE_PATH,
    COUNCIL_SIZE,
    CYCLE_INTERVAL,
    LOG_LEVEL,
    MAX_CYCLES,
    SESSION_LOG_DIR,
    get_available_providers,
    get_chairman_config,
)


def setup_logging(level: str = LOG_LEVEL):
    """Configure logging to both console and file."""
    log_path = Path(__file__).parent / "output" / "council.log"

    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, mode="a"),
        ],
    )


def show_status():
    """Display current council status."""
    print("\n" + "=" * 60)
    print("AI COUNCIL STATUS")
    print("=" * 60)

    # Check providers
    try:
        chairman = get_chairman_config()
        print(f"\n  Chairman: Claude ({chairman.model})")
    except ValueError as e:
        print(f"\n  Chairman: NOT CONFIGURED - {e}")

    providers = get_available_providers()
    print(f"  Advisors: {len(providers)} configured")
    for p in providers:
        print(f"    - {p.name} ({p.model})")

    if not providers:
        print("    (none - configure API keys in .env)")

    # Bible status
    if BIBLE_PATH.exists():
        size = BIBLE_PATH.stat().st_size
        print(f"\n  Bible: {BIBLE_PATH}")
        print(f"  Bible size: {size:,} bytes")
    else:
        print("\n  Bible: Not yet created (will be created on first run)")

    # Session logs
    logs = sorted(SESSION_LOG_DIR.glob("cycle_*.md"))
    print(f"\n  Session logs: {len(logs)} cycles completed")
    if logs:
        print(f"  Latest: {logs[-1].name}")

    print(f"\n  Cycle interval: {CYCLE_INTERVAL}s")
    print(f"  Council size: {COUNCIL_SIZE} advisors per cycle")
    print(f"  Max cycles: {'infinite' if MAX_CYCLES == 0 else MAX_CYCLES}")
    print("=" * 60 + "\n")


def validate_setup():
    """Validate that the system is properly configured."""
    errors = []

    try:
        get_chairman_config()
    except ValueError as e:
        errors.append(str(e))

    providers = get_available_providers()
    if not providers:
        errors.append(
            "No advisor providers configured. Set at least one API key "
            "in .env (OPENAI_API_KEY, GOOGLE_API_KEY, MOONSHOT_API_KEY, "
            "or OPENROUTER_API_KEY)."
        )

    if errors:
        print("\nConfiguration errors:")
        for e in errors:
            print(f"  - {e}")
        print("\nRun: cp .env.example .env  and fill in your API keys.\n")
        sys.exit(1)


async def main():
    parser = argparse.ArgumentParser(
        description="AI Council - Autonomous Multi-AI Deliberation System"
    )
    parser.add_argument(
        "--cycles", type=int, default=None,
        help="Number of cycles to run (default: from .env or infinite)",
    )
    parser.add_argument(
        "--once", action="store_true",
        help="Run a single cycle and exit",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Show current council status and exit",
    )
    parser.add_argument(
        "--interval", type=int, default=None,
        help="Override cycle interval in seconds",
    )
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    setup_logging()
    validate_setup()

    # Import after validation so config errors are caught first
    import config
    from council import CouncilOrchestrator

    if args.once:
        config.MAX_CYCLES = 1
    elif args.cycles:
        config.MAX_CYCLES = args.cycles
    if args.interval:
        config.CYCLE_INTERVAL = args.interval

    orchestrator = CouncilOrchestrator()
    await orchestrator.run()


if __name__ == "__main__":
    asyncio.run(main())
