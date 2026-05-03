/**
 * Parse ~/.openclaw/openclaw.json with light JSON5 compatibility.
 */
export function stripJsonComments(source) {
  if (!source) return '';
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.replace(/^\s*\/\/.*$/gm, '');
}

function stripTrailingCommas(source) {
  let current = source;
  let previous = '';
  while (current !== previous) {
    previous = current;
    current = current.replace(/,(\s*[}\]])/g, '$1');
  }
  return current;
}

export function parseOpenclawConfig(raw) {
  const cleaned = stripTrailingCommas(stripJsonComments(raw || ''));
  return JSON.parse(cleaned);
}
