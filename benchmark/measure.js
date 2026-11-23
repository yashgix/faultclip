'use strict';

// Compares a first-characters cut with error evidence on every failed result. Writes results/recall.json.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { errorEvidence, ERROR_EVIDENCE_RE } = require('../src/error-evidence.js');

const BUDGET = 600;
const KEY = /(error|exception|traceback|failed|fatal)/i;
const SOURCE_PATH = /\S+\.(?:[cm]?[jt]sx?|py|rs|go|java|rb|c|cc|cpp|h)\b/gi;
// Rules such as `===== 1 failed =====` are stripped, or a key made only of `=` would match every other banner.
const DECORATION = /^[=\-_*#~\s]+|[=\-_*#~\s]+$/g;
const DATA = path.join(__dirname, 'data', 'failures.jsonl');
const OUT = path.join(__dirname, '..', 'results', 'recall.json');

// The last line naming an error, ignoring source-file paths, is the ground truth for what a reader needs.
function keyLine(output) {
  const named = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => KEY.test(line.replace(SOURCE_PATH, '')) && !line.startsWith('[Command'));
  return (named.at(-1) || '').replace(DECORATION, '').slice(0, 120);
}

function emptyCounts() {
  return { sessions: new Set(), failures: 0, withKeyLine: 0, firstCharactersKept: 0, errorEvidenceKept: 0, overBudget: 0 };
}

function add(counts, row) {
  const key = keyLine(row.output);
  const kept = errorEvidence(row.output, ERROR_EVIDENCE_RE, BUDGET);
  counts.sessions.add(row.session);
  counts.failures += 1;
  counts.overBudget += kept.length > BUDGET ? 1 : 0;
  if (!key) return;
  counts.withKeyLine += 1;
  counts.firstCharactersKept += row.output.slice(0, BUDGET).includes(key) ? 1 : 0;
  counts.errorEvidenceKept += kept.includes(key) ? 1 : 0;
}

async function main() {
  const bySet = {};
  for await (const line of readline.createInterface({ input: fs.createReadStream(DATA, 'utf8'), crlfDelay: Infinity })) {
    const row = JSON.parse(line);
    add((bySet[row.set] ||= emptyCounts()), row);
  }
  const results = Object.fromEntries(
    Object.entries(bySet).map(([name, { sessions, ...counts }]) => [name, { sessions: sessions.size, ...counts }]),
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ budget: BUDGET, ...results }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
