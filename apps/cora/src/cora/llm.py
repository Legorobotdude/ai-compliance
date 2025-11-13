"""OpenAI client wrapper with retry + JSON guardrails."""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

import orjson
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion, ChatCompletionMessageParam
from tenacity import AsyncRetrying, RetryError, stop_after_attempt, wait_exponential

from .config import Settings


class LLMError(RuntimeError):
    """Base class for LLM issues."""


class LLMValidationError(LLMError):
    """Raised when guardrails fail repeatedly."""


@dataclass(frozen=True)
class LLMResult:
    payload: Any
    raw_text: str
    latency_ms: int
    model: str
    prompt_tokens: int | None
    completion_tokens: int | None
    prompt_hash: str


class LLMClient:
    """Thin OpenAI wrapper that enforces JSON and retries invalid outputs."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_request_timeout_seconds
        )

    async def complete_json(
        self,
        *,
        agent_name: str,
        system_prompt: str,
        user_prompt: str,
        response_model: type,
        temperature: float | None = None,
        extra_messages: Sequence[ChatCompletionMessageParam] | None = None
    ) -> LLMResult:
        """Call OpenAI chat completions API expecting JSON content."""

        base_messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        if extra_messages:
            base_messages.extend(extra_messages)

        async_for = AsyncRetrying(
            stop=stop_after_attempt(self._settings.openai_max_retries),
            wait=wait_exponential(multiplier=1, min=1, max=4),
            reraise=True
        )

        try:
            async for attempt in async_for:
                with attempt:
                    start = time.perf_counter()
                    completion: ChatCompletion = await self._client.chat.completions.create(
                        model=self._settings.openai_model,
                        temperature=temperature if temperature is not None else self._settings.openai_temperature,
                        top_p=self._settings.openai_top_p,
                        max_tokens=self._settings.openai_max_output_tokens,
                        response_format={"type": "json_object"},
                        messages=base_messages
                    )
                    latency_ms = int((time.perf_counter() - start) * 1000)
                    content = completion.choices[0].message.content or "{}"
                    parsed = orjson.loads(content)
                    payload = response_model.model_validate(parsed)  # type: ignore[attr-defined]
                    prompt_hash = hash_prompt(agent_name, system_prompt, user_prompt)
                    return LLMResult(
                        payload=payload,
                        raw_text=content,
                        latency_ms=latency_ms,
                        model=completion.model or self._settings.openai_model,
                        prompt_tokens=completion.usage.prompt_tokens if completion.usage else None,
                        completion_tokens=completion.usage.completion_tokens if completion.usage else None,
                        prompt_hash=prompt_hash
                    )
        except RetryError as exc:
            raise LLMValidationError(f"LLM response failed JSON validation for {agent_name}") from exc

        raise LLMError("Unexpected completion flow")


def hash_prompt(agent_name: str, *parts: Iterable[str] | str) -> str:
    """Create a deterministic hash for prompt logging."""

    sha = hashlib.sha256()
    sha.update(agent_name.encode("utf-8"))
    for part in parts:
        if isinstance(part, str):
            sha.update(part.encode("utf-8"))
        else:
            sha.update("|".join(part).encode("utf-8"))
    return sha.hexdigest()
