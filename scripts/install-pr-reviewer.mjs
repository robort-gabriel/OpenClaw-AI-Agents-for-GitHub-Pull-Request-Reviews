#!/usr/bin/env node
/**
 * Copy workspace-pr-reviewer-github/ into ~/.openclaw/workspace-pr-reviewer-github
 * and merge pr-reviewer-github agent + binding + plugins into openclaw.json
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  cpSync,
  rmSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { parseOpenclawConfig } from './parse_openclaw_config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const WS_SOURCE = join(PACKAGE_ROOT, 'workspace-pr-reviewer-github');
const TEMPLATE_PATH = join(PACKAGE_ROOT, 'openclaw.json.example');

const AGENT_ID = 'pr-reviewer-github';
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(homedir(), '.openclaw');
const OPENCLAW_JSON_PATH = join(OPENCLAW_HOME, 'openclaw.json');
const WS_DEST = join(OPENCLAW_HOME, 'workspace-pr-reviewer-github');

function backupIfExists(filePath) {
  if (!existsSync(filePath)) return;
  const ext = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const backupPath = `${filePath}.bak.${ext}`;
  copyFileSync(filePath, backupPath);
  console.log(`Backed up ${filePath} -> ${backupPath}`);
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });
}

function shouldCopyFile(src) {
  const b = basename(src);
  if (b === 'node_modules' || b === '.git') return false;
  return true;
}

function copyWorkspace() {
  if (!existsSync(WS_SOURCE)) {
    throw new Error(`Workspace template not found: ${WS_SOURCE}`);
  }
  mkdirSync(dirname(WS_DEST), { recursive: true });
  if (existsSync(WS_DEST)) {
    rmSync(WS_DEST, { recursive: true, force: true });
  }
  cpSync(WS_SOURCE, WS_DEST, {
    recursive: true,
    filter: (s) => shouldCopyFile(s),
  });
  console.log(`Copied ${WS_SOURCE} -> ${WS_DEST}`);
}

function mergeConfig(existing, template) {
  const config = existing && typeof existing === 'object' ? structuredClone(existing) : {};
  const tpl = template;

  config.agents = config.agents || {};
  const list = Array.isArray(config.agents.list) ? config.agents.list : [];
  const others = list.filter((a) => a?.id !== AGENT_ID);
  const tplAgent = (tpl.agents?.list || []).find((a) => a?.id === AGENT_ID);
  if (tplAgent) {
    const normalized = structuredClone(tplAgent);
    normalized.workspace = join(OPENCLAW_HOME, 'workspace-pr-reviewer-github');
    normalized.agentDir = join(OPENCLAW_HOME, 'agents', AGENT_ID);
    others.push(normalized);
  }
  config.agents.list = others;

  if (tpl.plugins?.entries) {
    config.plugins = config.plugins || {};
    config.plugins.entries = { ...config.plugins.entries, ...structuredClone(tpl.plugins.entries) };
  }

  const tplBindings = Array.isArray(tpl.bindings) ? tpl.bindings : [];
  const newBinding = tplBindings.find((b) => b?.agentId === AGENT_ID);
  config.bindings = Array.isArray(config.bindings) ? config.bindings : [];
  config.bindings = config.bindings.filter((b) => b?.agentId !== AGENT_ID);
  if (newBinding) {
    config.bindings.push(structuredClone(newBinding));
  }

  if (tpl.channels?.slack) {
    config.channels = config.channels || {};
    config.channels.slack = config.channels.slack || {};
    if (config.channels.slack.enabled === undefined) {
      config.channels.slack.enabled = true;
    }
    const tplAcc = tpl.channels.slack.accounts?.default;
    if (tplAcc) {
      config.channels.slack.accounts = config.channels.slack.accounts || {};
      const cur = config.channels.slack.accounts.default;
      if (!cur) {
        config.channels.slack.accounts.default = structuredClone(tplAcc);
      } else {
        config.channels.slack.accounts.default = {
          ...structuredClone(tplAcc),
          ...cur,
          channels: {
            ...structuredClone(tplAcc.channels || {}),
            ...(cur.channels || {}),
          },
        };
      }
    }
  }

  return config;
}

async function main() {
  console.log('\n=== pr-reviewer-github install ===\n');
  console.log(`OPENCLAW_HOME=${OPENCLAW_HOME}`);

  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template not found: ${TEMPLATE_PATH}`);
  }
  if (!existsSync(OPENCLAW_JSON_PATH)) {
    throw new Error(`No ${OPENCLAW_JSON_PATH}. Run openclaw onboard first.`);
  }

  const ok = await prompt(
    `Copy workspace to ${WS_DEST} and merge ${AGENT_ID} into ${OPENCLAW_JSON_PATH}? [y/N]: `
  );
  if (ok !== 'y' && ok !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }

  const template = parseOpenclawConfig(readFileSync(TEMPLATE_PATH, 'utf8'));
  const existing = parseOpenclawConfig(readFileSync(OPENCLAW_JSON_PATH, 'utf8'));

  copyWorkspace();
  backupIfExists(OPENCLAW_JSON_PATH);
  const merged = mergeConfig(existing, template);
  writeFileSync(OPENCLAW_JSON_PATH, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Updated ${OPENCLAW_JSON_PATH}`);
  console.log('\nNext: follow README.md (setup + tokens), then `openclaw doctor`.\n');
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
