# TOOLS.md — PR Reviewer

## Trigger

- **GitHub** → `github-webhook-receiver` → `openclaw agent --agent pr-reviewer-github --message '{{github-pr}}<JSON>'`
- The JSON includes `workspace_root` (absolute) and fields from the webhook (`owner`, `repo`, `number`, etc.).

## Lobster (embedded runner)

- **Workflow file:** `workflow/pipelines/github-pr-review.lobster` (use **absolute** path; see `AGENTS.md`).
- **argsJson:** must include at least `workspace_root` and PR identifiers so scripts can find `config/` and call GitHub.

## Scripts (invoked by Lobster, not by ad-hoc exec)

| Script | Role |
|--------|------|
| `scripts/fetch_pr_context.mjs` | GitHub API: diff, files, commits; extension/ignore filter |
| `scripts/run_review.mjs` | OpenAI structured review |
| `scripts/persist_review_artifact.mjs` | `memory/pr-reviews/…` |
| `scripts/post_slack_review.mjs` | Slack `chat.postMessage` (+ thread for full text) |
| `scripts/post_github_pr_comment.mjs` | GitHub issue (PR) comment (required) |

## Environment (set on Gateway / `.openclaw/.env` — not in workspace)

- `OPENAI_API_KEY` — required for `run_review.mjs`
- `GITHUB_TOKEN` or `GH_TOKEN` — read PRs and **post** issue comments (`issues: write` on fine-grained PAT, or `repo` scope for classic on private repos)
- `GITHUB_WEBHOOK_SECRET` — verified by the receiver
- `SLACK_BOT_TOKEN` — for posting
- `PR_REVIEW_SLACK_CHANNEL_ID` — destination channel
- `PR_REVIEW_GITHUB_API_BASE` — if unset, `https://api.github.com` (set for GitHub Enterprise)

See [`README.md`](../README.md) for the full list.
