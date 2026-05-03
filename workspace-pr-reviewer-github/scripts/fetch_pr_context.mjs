#!/usr/bin/env node
/**
 * Fetch PR diff, files, commits. Filter by config/reviewable-extensions.json.
 * stdin: not used if LOBSTER_ARGS_JSON is set. stdout: JSON for run_review.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLobsterArgs } from './lib/load_lobster_args.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WS = path.resolve(__dirname, '..');

const MAX_DIFF_CHARS = Math.min(
  parseInt(process.env.PR_REVIEW_MAX_DIFF_CHARS || '400000', 10) || 400000,
  600000
);

function loadExtensionConfig() {
  const p = path.join(WS, 'config', 'reviewable-extensions.json');
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function shouldIncludeFile(filename, cfg) {
  const lower = filename.toLowerCase();
  for (const s of cfg.ignoreSuffixes || []) {
    if (lower.endsWith(s.toLowerCase())) return false;
  }
  const ext = path.extname(filename);
  if (!ext) return false;
  const allow = (cfg.extensions || []).map((x) => x.toLowerCase());
  return allow.includes(ext.toLowerCase());
}

async function ghFetch(url, token, accept) {
  const res = await fetch(url, {
    headers: {
      Accept: accept || 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} ${url}: ${text.slice(0, 500)}`);
  }
  if (accept === 'application/vnd.github.diff') {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function listAllFiles(apiBase, owner, repo, number, token) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${apiBase}/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`;
    const data = await ghFetch(url, token);
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

const args = { ...loadLobsterArgs() };
const E = process.env;
const n = (k) => (E[k] != null && E[k] !== '' ? E[k] : undefined);
if (args.number == null && n('LOBSTER_ARG_NUMBER') != null) args.number = n('LOBSTER_ARG_NUMBER');
if (!args.owner && n('LOBSTER_ARG_OWNER')) args.owner = n('LOBSTER_ARG_OWNER');
if (!args.repo && n('LOBSTER_ARG_REPO')) args.repo = n('LOBSTER_ARG_REPO');
if (!args.workspace_root && n('LOBSTER_ARG_WORKSPACE_ROOT')) {
  args.workspace_root = n('LOBSTER_ARG_WORKSPACE_ROOT');
}
const owner = args.owner;
const repo = args.repo;
const number = args.number;
const workspace_root = args.workspace_root || WS;

if (!owner || !repo || !number) {
  console.error(
    JSON.stringify({ error: 'missing owner/repo/number in LOBSTER_ARGS_JSON or stdin' })
  );
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error(JSON.stringify({ error: 'GITHUB_TOKEN or GH_TOKEN is required' }));
  process.exit(1);
}

const apiBase = (process.env.PR_REVIEW_GITHUB_API_BASE || 'https://api.github.com').replace(
  /\/$/,
  ''
);

const cfg = loadExtensionConfig();
const allFiles = await listAllFiles(apiBase, owner, repo, number, token);
const codeFiles = allFiles.filter((f) => shouldIncludeFile(f.filename, cfg));

const diffUrl = `${apiBase}/repos/${owner}/${repo}/pulls/${number}`;
let diffText = '';
try {
  diffText = await ghFetch(diffUrl, token, 'application/vnd.github.diff');
} catch (e) {
  diffText = `<!-- diff fetch failed: ${e.message} -->`;
}
if (diffText.length > MAX_DIFF_CHARS) {
  diffText =
    diffText.slice(0, MAX_DIFF_CHARS) +
    '\n\n<!-- diff truncated: increase PR_REVIEW_MAX_DIFF_CHARS or review in smaller chunks -->';
}

const commits = await ghFetch(
  `${apiBase}/repos/${owner}/${repo}/pulls/${number}/commits?per_page=100`,
  token
);
const commitMessages = (Array.isArray(commits) ? commits : []).map((c) => ({
  sha: c.sha,
  message: c.commit?.message || '',
}));

const payload = {
  workspace_root: path.resolve(workspace_root),
  owner,
  repo,
  number: Number(number),
  action: args.action || '',
  title: args.title || '',
  body: args.body || '',
  user_login: args.user_login || '',
  html_url: args.html_url || '',
  head_sha: args.head_sha || '',
  base_ref: args.base_ref || '',
  diff_text: diffText,
  file_list: codeFiles.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
  })),
  all_changed_paths: allFiles.map((f) => f.filename),
  commit_messages: commitMessages,
  fetch_meta: {
    code_file_count: codeFiles.length,
    total_file_count: allFiles.length,
  },
};

process.stdout.write(JSON.stringify(payload));
