"""AI provider adapters for the Council system.

Each provider implements the same interface: send a prompt, get a response.
Supports Claude (Anthropic), GPT (OpenAI), Gemini (Google), Kimi (Moonshot),
and any OpenAI-compatible API via OpenRouter.
"""

import asyncio
import logging
from dataclasses import dataclass

import anthropic
import openai
import google.generativeai as genai

from config import ProviderConfig

logger = logging.getLogger("council.providers")


@dataclass
class AdvisorResponse:
    provider_name: str
    role: str
    response: str
    success: bool
    error: str | None = None


async def query_claude(config: ProviderConfig, system: str, prompt: str) -> str:
    """Query Anthropic Claude API."""
    client = anthropic.AsyncAnthropic(api_key=config.api_key)
    message = await client.messages.create(
        model=config.model,
        max_tokens=config.max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


async def query_openai_compatible(
    config: ProviderConfig, system: str, prompt: str
) -> str:
    """Query any OpenAI-compatible API (GPT, Kimi, OpenRouter, etc.)."""
    kwargs = {"api_key": config.api_key}
    if config.base_url:
        kwargs["base_url"] = config.base_url

    client = openai.AsyncOpenAI(**kwargs)
    response = await client.chat.completions.create(
        model=config.model,
        max_tokens=config.max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content


async def query_gemini(config: ProviderConfig, system: str, prompt: str) -> str:
    """Query Google Gemini API."""
    genai.configure(api_key=config.api_key)
    model = genai.GenerativeModel(
        model_name=config.model,
        system_instruction=system,
    )
    # Gemini SDK is sync, run in thread pool
    response = await asyncio.to_thread(
        model.generate_content,
        prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=config.max_tokens,
        ),
    )
    return response.text


# Dispatch table: provider name -> query function
QUERY_FUNCTIONS = {
    "Claude": query_claude,
    "GPT": query_openai_compatible,
    "Gemini": query_gemini,
    "Kimi": query_openai_compatible,
    "DeepSeek": query_openai_compatible,
}


async def query_advisor(
    config: ProviderConfig, role: str, system: str, prompt: str
) -> AdvisorResponse:
    """Send a prompt to an AI advisor and return its response."""
    query_fn = QUERY_FUNCTIONS.get(config.name)
    if not query_fn:
        return AdvisorResponse(
            provider_name=config.name,
            role=role,
            response="",
            success=False,
            error=f"Unknown provider: {config.name}",
        )

    try:
        logger.info(f"  Querying {config.name} as '{role}'...")
        text = await query_fn(config, system, prompt)
        logger.info(f"  {config.name} responded ({len(text)} chars)")
        return AdvisorResponse(
            provider_name=config.name,
            role=role,
            response=text,
            success=True,
        )
    except Exception as e:
        logger.error(f"  {config.name} failed: {e}")
        return AdvisorResponse(
            provider_name=config.name,
            role=role,
            response="",
            success=False,
            error=str(e),
        )
