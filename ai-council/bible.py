"""Project Bible builder and manager.

The Bible is the continuously evolving master document that captures
all insights, decisions, stress-tested solutions, and open questions
from the AI Council's deliberations.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from config import BIBLE_PATH

logger = logging.getLogger("council.bible")

BIBLE_TEMPLATE = """# Ultimate Farms - Project Bible
## AI Council Deliberation Document

> This document is continuously built and refined by an AI Advisory Council.
> Chairman: Claude (Anthropic) | Advisors: GPT, Gemini, Kimi, DeepSeek
> Auto-generated and iteratively improved. Last updated: {timestamp}

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Architecture Decisions](#core-architecture-decisions)
3. [Solved Problems](#solved-problems)
4. [Active Investigations](#active-investigations)
5. [Risk Register](#risk-register)
6. [Open Questions](#open-questions)
7. [Stress Test Results](#stress-test-results)
8. [Rejected Approaches](#rejected-approaches)
9. [Implementation Priorities](#implementation-priorities)
10. [Session Log](#session-log)

---

## Executive Summary

*Initial state - awaiting first council deliberation.*

---

## Core Architecture Decisions

*Decisions that have been stress-tested and approved by the council.*

---

## Solved Problems

*Problems that have been thoroughly explored, stress-tested, and resolved.*

---

## Active Investigations

*Problems currently being explored by the council.*

---

## Risk Register

*Identified risks with severity, likelihood, and mitigation strategies.*

---

## Open Questions

*Questions that need further exploration.*

- What is the optimal offline-first sync strategy for unreliable connectivity?
- How should the Susu-compliance escrow model handle edge cases?
- What is the minimum viable sensor suite for Phase 1?
- How do we handle the WhatsApp API dependency for proof-of-work?
- What is the right balance between enforcement friction and user adoption?

---

## Stress Test Results

*Record of stress tests performed and their outcomes.*

---

## Rejected Approaches

*Approaches that were considered and deliberately rejected, with reasoning.*

---

## Implementation Priorities

*Prioritized list of what to build next, informed by council deliberations.*

---

## Session Log

*Chronological record of council sessions.*

"""


def load_bible() -> str:
    """Load the current Bible document, or create initial version."""
    if BIBLE_PATH.exists():
        return BIBLE_PATH.read_text()

    logger.info("Creating initial Project Bible...")
    initial = BIBLE_TEMPLATE.format(
        timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    )
    BIBLE_PATH.write_text(initial)
    return initial


def save_bible(content: str) -> None:
    """Save the updated Bible document."""
    BIBLE_PATH.write_text(content)
    logger.info(f"Bible updated ({len(content)} chars) -> {BIBLE_PATH}")


def load_project_context() -> str:
    """Load all project documentation as context for the council."""
    from config import DOCS_DIR, PROJECT_ROOT

    context_parts = []

    # Load README
    readme = PROJECT_ROOT / "README.md"
    if readme.exists():
        context_parts.append(f"# PROJECT README\n\n{readme.read_text()}")

    # Load all docs
    if DOCS_DIR.exists():
        for doc in sorted(DOCS_DIR.glob("*.md")):
            context_parts.append(f"# {doc.stem}\n\n{doc.read_text()}")

    # Load SQL schemas for context
    schema_dir = PROJECT_ROOT / "src" / "db" / "schemas"
    if schema_dir.exists():
        for sql in sorted(schema_dir.glob("*.sql")):
            # Just include first 100 lines of each schema for context
            lines = sql.read_text().splitlines()[:100]
            context_parts.append(
                f"# DATABASE SCHEMA: {sql.name} (first 100 lines)\n\n"
                + "\n".join(lines)
            )

    return "\n\n---\n\n".join(context_parts)


def save_session_log(cycle_num: int, log_content: str) -> Path:
    """Save a detailed session log for a single council cycle."""
    from config import SESSION_LOG_DIR

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"cycle_{cycle_num:04d}_{timestamp}.md"
    path = SESSION_LOG_DIR / filename
    path.write_text(log_content)
    logger.info(f"Session log saved -> {path}")
    return path
