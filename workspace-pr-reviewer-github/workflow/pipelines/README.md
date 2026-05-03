# Pipelines

- **`github-pr-review.lobster`** — main automation for GitHub webhooks. Invoked by the `lobster` tool with a **fully absolute** `pipeline` path and `argsJson` matching the `args` block in the file.

## Args

`workspace_root` is required. PR fields from the GitHub `pull_request` event (`owner`, `repo`, `number`, …) are passed through from the webhook receiver (see [`github-webhook-receiver/`](../../github-webhook-receiver/) next to this workspace).

## Local test

From the workspace root (with env set):

```bash
export LOBSTER_ARGS_JSON='{"workspace_root":"'"$PWD"'","owner":"o","repo":"r","number":1,"action":"opened","title":"t","body":"","user_login":"u","html_url":"https://github.com/o/r/pull/1","head_sha":"abc","base_ref":"main"}'
export GITHUB_TOKEN=ghp_... OPENAI_API_KEY=sk-... SLACK_BOT_TOKEN=xoxb-... PR_REVIEW_SLACK_CHANNEL_ID=C...
node scripts/fetch_pr_context.mjs | node scripts/run_review.mjs | node scripts/persist_review_artifact.mjs | node scripts/post_slack_review.mjs | node scripts/post_github_pr_comment.mjs
```

Or use the OpenClaw `lobster` tool with the same `argsJson` and an absolute `pipeline` path to `{workspace_root}/workflow/pipelines/github-pr-review.lobster`.
