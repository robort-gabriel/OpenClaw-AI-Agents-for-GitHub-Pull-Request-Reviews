# GitHub PR — fetch → review → memory → Slack → GitHub issue comment
#
# Call from OpenClaw: lobster action=run with
#   pipeline: "{workspace_root}/workflow/pipelines/github-pr-review.lobster" (absolute path)
#   argsJson: { workspace_root, owner, repo, number, action, title, body, user_login, html_url, head_sha, base_ref }

name: github-pr-review
description: OpenAI PR review: Slack + GitHub issue comment

cwd: ${workspace_root}

args:
  workspace_root:
    description: Absolute path to the pr-reviewer-github workspace
  owner:
  repo:
  number:
  action:
  title:
  body:
  user_login:
  html_url:
  head_sha:
  base_ref:
    default: ""

steps:
  - id: fetch
    command: node scripts/fetch_pr_context.mjs
  - id: review
    command: node scripts/run_review.mjs
    stdin: $fetch.stdout
  - id: persist
    command: node scripts/persist_review_artifact.mjs
    stdin: $review.stdout
  - id: slack
    command: node scripts/post_slack_review.mjs
    stdin: $persist.stdout
  - id: ghcomment
    command: node scripts/post_github_pr_comment.mjs
    stdin: $slack.stdout
