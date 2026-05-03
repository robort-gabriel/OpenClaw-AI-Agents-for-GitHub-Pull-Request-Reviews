#!/usr/bin/env node
/**
 * Post an issue (PR) comment on GitHub. Required in the pipeline: fails if the comment cannot be posted.
 */
import fs from 'fs';

const raw = fs.readFileSync(0, 'utf-8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(JSON.stringify({ error: 'invalid json', detail: e.message }));
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error(
    JSON.stringify({
      error: 'missing_token',
      message: 'GITHUB_TOKEN or GH_TOKEN is required to post a PR review comment',
    })
  );
  process.exit(1);
}

const base = (process.env.PR_REVIEW_GITHUB_API_BASE || 'https://api.github.com').replace(
  /\/$/,
  ''
);
const { owner, repo, number, review, review_markdown, html_url } = data;
if (!owner || !repo || !number) {
  console.error(JSON.stringify({ error: 'missing_pr', message: 'owner, repo, number required' }));
  process.exit(1);
}

const r = review || {};
const findings = Array.isArray(r.findings) ? r.findings : [];
const top = findings
  .slice(0, 5)
  .map((f) => `- ${(f.title || f.issue || 'Finding').slice(0, 200)}`)
  .join('\n');

const body = `## AI PR review

**Risk level:** ${r.risk_level || '—'}

**Top findings:**
${top || '—'}

**Overview:** ${(r.overview || '').slice(0, 1500)}

---

<details><summary>Full report</summary>

${review_markdown || ''}

</details>
`;

const url = `${base}/repos/${owner}/${repo}/issues/${number}/comments`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({ body: body.slice(0, 60000) }),
});
const t = await res.text();
if (!res.ok) {
  console.error(
    JSON.stringify({
      error: 'github_comment_failed',
      status: res.status,
      body: t.slice(0, 800),
    })
  );
  process.exit(1);
}
let j;
try {
  j = JSON.parse(t);
} catch {
  j = { raw: t.slice(0, 200) };
}
data.github_comment = { ok: true, html_url: j.html_url, id: j.id };
if (html_url) data.pr_link = html_url;
process.stdout.write(JSON.stringify(data));
