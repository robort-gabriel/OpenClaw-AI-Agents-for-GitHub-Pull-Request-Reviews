#!/usr/bin/env node
/**
 * GitHub webhook receiver: pull_request opened | synchronize | reopened.
 * Verifies X-Hub-Signature-256, enqueues a single `openclaw agent` run (HMAC, coalesced wake-ups).
 */
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { loadEnvFile } from './load-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

function resolveStableCwd() {
  const fromEnv = process.env.PR_REVIEWER_SPAWN_CWD;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  if (fs.existsSync(PKG_ROOT)) return PKG_ROOT;
  const home = process.env.HOME || '/home/node';
  if (fs.existsSync(home)) return home;
  return '/tmp';
}

const STABLE_CWD = resolveStableCwd();
try {
  process.chdir(STABLE_CWD);
} catch (e) {
  console.warn('[github-pr-webhook] chdir', STABLE_CWD, e?.message || e);
}

loadEnvFile(join(__dirname, '.env'));
loadEnvFile(join(process.env.HOME || process.env.USERPROFILE || '', '.openclaw', '.env'));
loadEnvFile(join(PKG_ROOT, '.env'));

const PORT = parseInt(process.env.GITHUB_PR_WEBHOOK_PORT || '3457', 10);
const AGENT_ID = process.env.PR_REVIEWER_AGENT_ID || 'pr-reviewer-github';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const DEFAULT_WS = join(
  process.env.HOME || '/home/node',
  '.openclaw',
  'workspace-pr-reviewer-github'
);
const PR_REVIEWER_WORKSPACE = process.env.PR_REVIEWER_WORKSPACE || DEFAULT_WS;
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

const ALLOW_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

let agentRunChain = Promise.resolve();
let coalesceTimer = null;
let coalescePayload = null;

function verifySignature(bodyUtf8, signatureHeader) {
  if (!WEBHOOK_SECRET) {
    if (process.env.ALLOW_INSECURE_WEBHOOK === '1') {
      console.warn('[github-pr-webhook] GITHUB_WEBHOOK_SECRET not set; verification skipped (insecure).');
      return true;
    }
    return false;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const sent = signatureHeader.slice(7);
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(bodyUtf8, 'utf8');
  const expected = hmac.digest('hex');
  const a = Buffer.from(sent, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildAgentMessage(payload) {
  return `{{github-pr}}${JSON.stringify(payload)}`;
}

function runAgentOnce(payload) {
  const msg = buildAgentMessage(payload);
  return new Promise((resolveRun) => {
    const child = spawn('openclaw', ['agent', '--agent', AGENT_ID, '--message', msg], {
      stdio: ['ignore', 'ignore', 'pipe'],
      cwd: STABLE_CWD,
      env: process.env,
    });
    let stderrTail = '';
    child.stderr?.on('data', (chunk) => {
      const s = chunk.toString();
      stderrTail = (stderrTail + s).slice(-8000);
    });
    const maxMs = parseInt(process.env.PR_REVIEWER_AGENT_TIMEOUT_MS || '600000', 10) || 600000;
    const t = setTimeout(() => {
      child.kill('SIGTERM');
    }, maxMs);
    child.on('error', (err) => {
      clearTimeout(t);
      console.error('[github-pr-webhook] openclaw spawn failed:', err.message);
      resolveRun(1);
    });
    child.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) {
        console.log('[github-pr-webhook] openclaw agent completed');
      } else {
        console.error('[github-pr-webhook] openclaw exit', code);
        if (stderrTail.trim()) {
          console.error(stderrTail.trim());
        }
      }
      resolveRun(code ?? 1);
    });
  });
}

function queueAgentRun(payload) {
  agentRunChain = agentRunChain.then(() => runAgentOnce(payload));
  return agentRunChain;
}

function getCoalesceMs() {
  const n = parseInt(process.env.PR_REVIEWER_COALESCE_MS || '2500', 10);
  return Math.min(60000, Math.max(0, Number.isFinite(n) ? n : 2500));
}

function scheduleCoalescedWake(payload) {
  coalescePayload = payload;
  if (coalesceTimer) clearTimeout(coalesceTimer);
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    const p = coalescePayload;
    coalescePayload = null;
    if (p) void queueAgentRun(p);
  }, getCoalesceMs());
}

function extractPrPayload(body) {
  const pr = body.pull_request;
  const repo = body.repository;
  if (!pr || !repo) return null;
  const owner = repo.owner?.login;
  const name = repo.name;
  if (!owner || !name) return null;
  if (!ALLOW_ACTIONS.has(body.action)) return null;
  return {
    workspace_root: PR_REVIEWER_WORKSPACE,
    action: body.action,
    owner,
    repo: name,
    number: pr.number,
    title: pr.title || '',
    body: pr.body || '',
    user_login: pr.user?.login || '',
    html_url: pr.html_url || '',
    head_sha: pr.head?.sha || '',
    base_ref: pr.base?.ref || '',
  };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('github-pr-webhook-ok');
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    (async () => {
      const bodyBuf = Buffer.concat(chunks);
      const bodyUtf8 = bodyBuf.toString('utf8');
      const event = (req.headers['x-github-event'] || '').toString();
      const sig = (req.headers['x-hub-signature-256'] || '').toString();

      if (event === 'ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'github-pr-webhook' }));
        return;
      }

      if (!verifySignature(bodyUtf8, sig)) {
        if (DEBUG) console.log('[github-pr-webhook] signature verify failed or missing secret');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }

      if (event !== 'pull_request') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ignored: true, event }));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(bodyUtf8 || '{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json' }));
        return;
      }

      const payload = extractPrPayload(parsed);
      if (!payload) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true, ignored: true }));
        return;
      }

      if (DEBUG) {
        console.log(
          '[github-pr-webhook] trigger',
          payload.owner,
          payload.repo,
          '#',
          payload.number,
          payload.action
        );
      }
      scheduleCoalescedWake(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, queued: true, pr: payload.number }));
    })().catch((e) => {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal' }));
    });
  });
});

server.listen(PORT, () => {
  console.log(`[github-pr-webhook] listening on :${PORT} -> agent ${AGENT_ID} workspace ${PR_REVIEWER_WORKSPACE}`);
});
