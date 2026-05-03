#!/usr/bin/env node
/**
 * Remove pr-reviewer-github from openclaw.json; optionally delete workspace and agentDir.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { parseOpenclawConfig } from './parse_openclaw_config.mjs';

const AGENT_ID = 'pr-reviewer-github';
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(homedir(), '.openclaw');
const OPENCLAW_JSON_PATH = join(OPENCLAW_HOME, 'openclaw.json');

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

async function main() {
  console.log('\n=== pr-reviewer-github uninstall ===\n');
  if (!existsSync(OPENCLAW_JSON_PATH)) {
    throw new Error(`No config at ${OPENCLAW_JSON_PATH}`);
  }

  const ok = await prompt(`Remove ${AGENT_ID} from ${OPENCLAW_JSON_PATH}? [y/N]: `);
  if (ok !== 'y' && ok !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }

  const w = await prompt(`Delete ${join(OPENCLAW_HOME, 'workspace-pr-reviewer-github')}? [y/N]: `);
  const removeWorkspace = w === 'y' || w === 'yes';
  const a = await prompt(`Delete ${join(OPENCLAW_HOME, 'agents', AGENT_ID)}? [y/N]: `);
  const removeAgentDir = a === 'y' || a === 'yes';

  backupIfExists(OPENCLAW_JSON_PATH);
  const config = parseOpenclawConfig(readFileSync(OPENCLAW_JSON_PATH, 'utf8'));

  config.agents = config.agents || {};
  config.agents.list = (config.agents.list || []).filter((x) => x?.id !== AGENT_ID);
  config.bindings = (config.bindings || []).filter((b) => b?.agentId !== AGENT_ID);

  writeFileSync(OPENCLAW_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
  console.log(`Updated ${OPENCLAW_JSON_PATH}`);

  if (removeWorkspace) {
    const p = join(OPENCLAW_HOME, 'workspace-pr-reviewer-github');
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      console.log(`Removed ${p}`);
    }
  }
  if (removeAgentDir) {
    const p = join(OPENCLAW_HOME, 'agents', AGENT_ID);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      console.log(`Removed ${p}`);
    }
  }

  console.log(
    'Slack account `default` in openclaw.json was not removed (it may be shared). Delete or edit by hand if needed.\n'
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
