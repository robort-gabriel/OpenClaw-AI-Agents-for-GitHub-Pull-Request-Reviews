#!/usr/bin/env node
import fs from 'fs';

const raw = fs.readFileSync(0, 'utf-8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(JSON.stringify({ error: 'invalid json', detail: e.message }));
  process.exit(1);
}

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.PR_REVIEW_SLACK_CHANNEL_ID;
if (!token || !channel) {
  console.error(
    JSON.stringify({ error: 'SLACK_BOT_TOKEN and PR_REVIEW_SLACK_CHANNEL_ID are required' })
  );
  process.exit(1);
}

const r = data.review || {};
const findings = Array.isArray(r.findings) ? r.findings : [];
const top = findings.slice(0, 5).map((f) => `• ${(f.title || f.issue || 'Finding').slice(0, 120)}`);
const summaryText = `*🤖 PR review ready*
*Repository:* \`${data.owner}/${data.repo}\`
*PR:* <${data.html_url || '#'}|#${data.number} — ${(data.title || 'PR').slice(0, 200)}>
*Author:* ${data.user_login || '—'}
*Risk level:* ${r.risk_level || '—'}

*Top findings:*
${top.length ? top.join('\n') : '• (none flagged)'}
`;

const main = await postMessage({ channel, text: summaryText, token });
if (!main.ok) {
  console.error(JSON.stringify({ error: 'slack main post failed', response: main }));
  process.exit(1);
}
const parentTs = main.ts;
const full = data.review_markdown || '_No full report._';
if (parentTs) {
  const chunks = chunkText(full, 3500);
  for (const c of chunks) {
    const tr = await postMessage({
      channel,
      text: c,
      token,
      thread_ts: parentTs,
    });
    if (!tr.ok) {
      console.error(JSON.stringify({ error: 'slack thread post failed', response: tr }));
    }
  }
}

data.slack = { main_ts: parentTs, channel };
process.stdout.write(JSON.stringify(data));

async function postMessage({ channel, text, token, thread_ts }) {
  const body = { channel, text };
  if (thread_ts) body.thread_ts = thread_ts;
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function chunkText(s, size) {
  if (s.length <= size) return [s];
  const out = [];
  for (let i = 0; i < s.length; i += size) {
    out.push(s.slice(i, i + size));
  }
  return out;
}
