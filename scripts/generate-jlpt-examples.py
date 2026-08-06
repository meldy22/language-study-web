#!/usr/bin/env python3
"""Generate JLPT example sentences with NVIDIA NIM and store them in Supabase."""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_ROOT / ".env.local"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "meta/llama-3.1-8b-instruct"

# Python 3.13+ enables RFC 5280 strict validation by default. Some corporate
# HTTPS inspection certificates omit legacy X.509 extensions such as AKI.
# Relax only that compatibility check; CA, signature, and hostname validation
# remain enabled.
TLS_CONTEXT = ssl.create_default_context()
if hasattr(ssl, "VERIFY_X509_STRICT"):
    TLS_CONTEXT.verify_flags &= ~ssl.VERIFY_X509_STRICT

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is missing. Add it to {ENV_FILE}.")
    return value


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload: Any | None = None,
    timeout: int = 300,
) -> Any:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=TLS_CONTEXT) as response:
                data = response.read().decode("utf-8")
                return json.loads(data) if data else None
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            is_retryable = error.code in {429, 500, 502, 503, 504, 529}
            if not is_retryable or attempt == max_attempts:
                raise RuntimeError(f"HTTP {error.code} from {url}: {details[:1000]}") from error
            retry_after = error.headers.get("Retry-After", "").strip()
            wait_seconds = int(retry_after) if retry_after.isdigit() else 5 * (2 ** (attempt - 1))
            print(
                f"Temporary API error ({error.code}). Retrying in {wait_seconds}s "
                f"({attempt}/{max_attempts})...",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)
        except (TimeoutError, urllib.error.URLError) as error:
            reason = getattr(error, "reason", error)
            is_timeout = isinstance(reason, TimeoutError) or "timed out" in str(reason).lower()
            if not is_timeout or attempt == max_attempts:
                raise
            wait_seconds = 5 * (2 ** (attempt - 1))
            print(
                f"API read timed out. Retrying in {wait_seconds}s "
                f"({attempt}/{max_attempts})...",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)

    raise RuntimeError(f"Request failed after {max_attempts} attempts: {url}")


def supabase_headers(service_key: str, *, prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def fetch_words(
    supabase_url: str,
    service_key: str,
    level: int,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode(
        {
            "select": "id,word,meaning,furigana,level",
            "level": f"eq.{level}",
            "order": "id.asc",
            "limit": str(limit),
            "offset": str(offset),
        }
    )
    return request_json(
        f"{supabase_url.rstrip('/')}/rest/v1/jlpt_vocabulary?{query}",
        headers=supabase_headers(service_key),
    )


def fetch_existing_count(supabase_url: str, service_key: str, vocabulary_id: int) -> int:
    query = urllib.parse.urlencode(
        {"select": "id", "vocabulary_id": f"eq.{vocabulary_id}", "limit": "10"}
    )
    rows = request_json(
        f"{supabase_url.rstrip('/')}/rest/v1/jlpt_example_sentences?{query}",
        headers=supabase_headers(service_key),
    )
    return len(rows)


def extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("The model response did not contain a JSON object.")
    result = json.loads(cleaned[start : end + 1])
    if not isinstance(result, dict):
        raise ValueError("The model response JSON must be an object.")
    return result


def generate_examples(
    nvidia_key: str,
    model: str,
    word: dict[str, Any],
    count: int,
) -> list[dict[str, str]]:
    prompt = f"""Create {count} Japanese example sentences for a Korean JLPT learner.

Target word: {word['word']}
Reading: {word['furigana']}
Korean meaning: {word['meaning']}
JLPT level: N{word['level']}

Requirements:
- Every Japanese sentence must contain the target word or a natural inflected form of it.
- Use natural modern Japanese and vocabulary/grammar appropriate for N{word['level']}.
- Keep each sentence concise and make the situations meaningfully different.
- Reading must be the full sentence written in hiragana. Preserve Japanese punctuation.
- Korean translation must be accurate and natural.
- Return JSON only, with exactly this shape:
{{"examples":[{{"japanese":"...","reading":"...","translation_ko":"..."}}]}}
"""
    response = request_json(
        f"{NVIDIA_BASE_URL}/chat/completions",
        method="POST",
        headers={
            "Authorization": f"Bearer {nvidia_key}",
            "Content-Type": "application/json",
        },
        payload={
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a meticulous Japanese language teacher. Output valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.25,
            "top_p": 0.9,
            "max_tokens": 1200,
            "stream": False,
            **(
                {"reasoning_effort": "none"}
                if model == "deepseek-ai/deepseek-v4-flash"
                else {}
            ),
            **(
                {"chat_template_kwargs": {"enable_thinking": False}}
                if model.startswith("qwen/qwen3.5-")
                else {}
            ),
        },
    )
    content = response["choices"][0]["message"]["content"]
    parsed = extract_json(content)
    examples = parsed.get("examples")
    if not isinstance(examples, list) or len(examples) != count:
        raise ValueError(f"Expected exactly {count} examples.")

    validated: list[dict[str, str]] = []
    for example in examples:
        if not isinstance(example, dict):
            raise ValueError("Each example must be an object.")
        values = {
            field: str(example.get(field, "")).strip()
            for field in ("japanese", "reading", "translation_ko")
        }
        if not all(values.values()):
            raise ValueError("An example is missing japanese, reading, or translation_ko.")
        validated.append(values)
    return validated


def save_examples(
    supabase_url: str,
    service_key: str,
    vocabulary_id: int,
    model: str,
    examples: list[dict[str, str]],
) -> None:
    rows = [
        {
            "vocabulary_id": vocabulary_id,
            "japanese": example["japanese"],
            "reading": example["reading"],
            "translation_ko": example["translation_ko"],
            "source": "nvidia_nim",
            "model": model,
            "is_verified": False,
        }
        for example in examples
    ]
    request_json(
        f"{supabase_url.rstrip('/')}/rest/v1/jlpt_example_sentences?on_conflict=vocabulary_id,japanese",
        method="POST",
        headers=supabase_headers(
            service_key,
            prefer="resolution=ignore-duplicates,return=minimal",
        ),
        payload=rows,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="List model IDs currently available to the configured NVIDIA API key.",
    )
    parser.add_argument("--level", type=int, choices=range(1, 6), default=5)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--examples-per-word", type=int, default=2)
    parser.add_argument("--model", default=None)
    parser.add_argument("--delay", type=float, default=0.8)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit < 1 or args.examples_per_word < 1:
        raise ValueError("--limit and --examples-per-word must be positive.")

    load_env_file(ENV_FILE)
    nvidia_key = require_env("NVIDIA_API_KEY")
    if args.list_models:
        payload = request_json(
            f"{NVIDIA_BASE_URL}/models",
            headers={
                "Authorization": f"Bearer {nvidia_key}",
                "Accept": "application/json",
            },
        )
        models = payload.get("data", []) if isinstance(payload, dict) else []
        model_ids = sorted(
            str(item.get("id", "")).strip()
            for item in models
            if isinstance(item, dict) and item.get("id")
        )
        if not model_ids:
            raise RuntimeError("NVIDIA API returned no available model IDs.")
        print("Models currently available to this NVIDIA API key:")
        for model_id in model_ids:
            print(model_id)
        return 0

    supabase_url = require_env("SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    model = args.model or os.environ.get("NVIDIA_MODEL", DEFAULT_MODEL)

    words = fetch_words(supabase_url, service_key, args.level, args.limit, args.offset)
    if not words:
        print("No vocabulary words matched the requested range.")
        return 0

    print(f"Generating {args.examples_per_word} examples for {len(words)} N{args.level} words with {model}")
    succeeded = 0
    skipped = 0
    failed = 0

    for index, word in enumerate(words, start=1):
        label = f"[{index}/{len(words)}] {word['word']}"
        try:
            existing = 0
            if not args.dry_run:
                existing = fetch_existing_count(supabase_url, service_key, word["id"])
                if existing >= args.examples_per_word:
                    skipped += 1
                    print(f"{label}: skipped ({existing} already stored)")
                    continue

            examples = generate_examples(
                nvidia_key,
                model,
                word,
                args.examples_per_word - existing,
            )
            if args.dry_run:
                print(json.dumps({"word": word["word"], "examples": examples}, ensure_ascii=False))
            else:
                save_examples(supabase_url, service_key, word["id"], model, examples)
                print(f"{label}: saved {len(examples)} ({existing + len(examples)} total)")
            succeeded += 1
        except Exception as error:  # Keep the batch moving and report each failed word.
            failed += 1
            print(f"{label}: ERROR: {error}", file=sys.stderr)
        if index < len(words) and args.delay > 0:
            time.sleep(args.delay)

    print(f"Done: {succeeded} succeeded, {skipped} skipped, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit("Interrupted.")
    except Exception as error:
        raise SystemExit(f"ERROR: {error}") from error
