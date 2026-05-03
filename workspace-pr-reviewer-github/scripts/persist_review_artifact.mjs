#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(0, 'utf-8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(JSON.stringify({ error: 'invalid json', detail: e.message }));
  process.exit(1);
}

const ws = data.workspace_root || path.resolve(__dirname, '..');
const dir = path.join(ws, 'memory', 'pr-reviews');
try {
  fs.mkdirSync(dir, { recursive: true });
} catch {
  /* */
}

const d = new Date();
const ymd = d.toISOString().slice(0, 10);
const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '-');
const filename = `${ymd}-PR-${safe(data.owner || 'o')}-${safe(data.repo || 'r')}-${data.number || 0}.md`;
const fpath = path.join(dir, filename);
const content = `---
repo: ${data.owner}/${data.repo}
pr: ${data.number}
head_sha: ${data.head_sha || ''}
fingerprint: ${data.review_fingerprint || ''}
---

${data.review_markdown || ''}
`;

fs.writeFileSync(fpath, content, 'utf-8');
data.memory_artifact_path = fpath;
process.stdout.write(JSON.stringify(data));
