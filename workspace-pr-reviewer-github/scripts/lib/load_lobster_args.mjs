/**
 * Read Lobster workflow args: LOBSTER_ARGS_JSON, or stdin JSON (Lobster step piping).
 */
import fs from 'fs';

export function loadLobsterArgs() {
  if (process.env.LOBSTER_ARGS_JSON) {
    try {
      return JSON.parse(process.env.LOBSTER_ARGS_JSON);
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = fs.readFileSync(0, 'utf-8').trim();
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}
