# Reviewer system prompt (reference)

The production prompt is internal to `scripts/run_review.mjs` for a single source of truth. Instruct the model to:

- Output **valid JSON** with: `overview` (string), `risk_level` (one of: Low, Medium, High, Critical), `findings` (array of `{ "category", "severity", "file", "line", "title", "issue", "suggestion" }`).
- Cover: code quality, bugs, security, performance.
- If the diff is empty or only ignored files: set `overview` and `findings` accordingly (short).
- Never output raw secrets; redact to `REDACTED` if needed.

A markdown `review_markdown` is derived from the same object for Slack/GitHub.
