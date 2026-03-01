"""Configuration for the AI Council system."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
COUNCIL_DIR = Path(__file__).parent
OUTPUT_DIR = COUNCIL_DIR / "output"
BIBLE_PATH = OUTPUT_DIR / "project_bible.md"
SESSION_LOG_DIR = OUTPUT_DIR / "sessions"
DOCS_DIR = PROJECT_ROOT / "docs"

# Ensure output dirs exist
OUTPUT_DIR.mkdir(exist_ok=True)
SESSION_LOG_DIR.mkdir(exist_ok=True)


@dataclass
class ProviderConfig:
    name: str
    api_key: str
    model: str
    base_url: str | None = None
    max_tokens: int = 4096


def get_available_providers() -> list[ProviderConfig]:
    """Detect which AI providers are configured via API keys."""
    providers = []

    if os.getenv("OPENAI_API_KEY"):
        providers.append(ProviderConfig(
            name="GPT",
            api_key=os.environ["OPENAI_API_KEY"],
            model="gpt-4o",
        ))

    if os.getenv("GOOGLE_API_KEY"):
        providers.append(ProviderConfig(
            name="Gemini",
            api_key=os.environ["GOOGLE_API_KEY"],
            model="gemini-2.0-flash",
        ))

    if os.getenv("MOONSHOT_API_KEY"):
        providers.append(ProviderConfig(
            name="Kimi",
            api_key=os.environ["MOONSHOT_API_KEY"],
            model="moonshot-v1-128k",
            base_url="https://api.moonshot.cn/v1",
        ))

    if os.getenv("OPENROUTER_API_KEY"):
        providers.append(ProviderConfig(
            name="DeepSeek",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model="deepseek/deepseek-r1",
            base_url="https://openrouter.ai/api/v1",
        ))

    return providers


def get_chairman_config() -> ProviderConfig:
    """Get the Claude (Chairman) configuration."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError(
            "ANTHROPIC_API_KEY is required. Claude serves as the Council Chairman."
        )
    return ProviderConfig(
        name="Claude",
        api_key=api_key,
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
    )


# Council settings
CYCLE_INTERVAL = int(os.getenv("CYCLE_INTERVAL_SECONDS", "300"))
MAX_CYCLES = int(os.getenv("MAX_CYCLES", "0"))
COUNCIL_SIZE = int(os.getenv("COUNCIL_SIZE", "4"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
