'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const { errorEvidence, ERROR_EVIDENCE_RE: ERROR_EVIDENCE } = require('../src/faultclip.js');

const BUDGET = 600;
const filler = (n) => Array.from({ length: n }, (_, i) => `  progress line ${i} ok`).join('\n');

test('error evidence keeps the last error line of a long traceback', () => {
  const frames = Array.from({ length: 40 }, (_, i) => `  File "/src/mod${i}.py", line ${i}, in f${i}\n    call()`);
  const text = ['Traceback (most recent call last):', ...frames, 'ValueError: bad shape'].join('\n');
  assert.ok(text.length > 2000);
  const kept = errorEvidence(text, ERROR_EVIDENCE, 600);
  assert.match(kept, /ValueError: bad shape/);
  assert.ok(kept.length <= 600);
});

test('error evidence keeps a failing test in the middle and the summary at the end', () => {
  const text = [
    ...Array(30).fill('tests/a.py::ok PASSED'),
    'FAILED tests/x.py::t - assert 1 == 2',
    ...Array(30).fill('tests/b.py::ok PASSED'),
    '1 failed, 60 passed in 2.1s',
  ].join('\n');
  const kept = errorEvidence(text, ERROR_EVIDENCE, 600);
  assert.match(kept, /FAILED tests\/x\.py::t/);
  assert.match(kept, /1 failed, 60 passed/);
});

test('error evidence leaves output under the budget unchanged', () => {
  const text = 'npm ERR! missing script: build';
  assert.equal(errorEvidence(text, ERROR_EVIDENCE, 600), text);
});

test('error evidence picks the decisive line in common tool output', () => {
  const cases = [
    ['npm', `${filler(40)}\nnpm ERR! code ERESOLVE\nnpm ERR! Could not resolve dependency`, /npm ERR!/],
    ['cargo', `${filler(40)}\nerror[E0308]: mismatched types\n  --> src/main.rs:4:5\nerror: could not compile`, /error\[E0308\]/],
    [
      'pytest',
      `${filler(40)}\nE   AssertionError: assert 1 == 2\nFAILED tests/test_a.py::test_x\n1 failed, 3 passed`,
      /FAILED tests/,
    ],
    [
      'python',
      `Traceback (most recent call last):\n${filler(40)}\nModuleNotFoundError: No module named 'requests'`,
      /ModuleNotFoundError/,
    ],
    ['shell', `${filler(40)}\nbash: ./deploy.sh: Permission denied`, /Permission denied/],
  ];
  for (const [name, text, expected] of cases) {
    const evidence = errorEvidence(text, ERROR_EVIDENCE, BUDGET);
    assert.match(evidence, expected, name);
    assert.ok(evidence.length <= BUDGET, `${name}: ${evidence.length} characters`);
  }
});

const ok = (n) => Array(n).fill('progress ok');
const SEP = '\n...\n';

test('a zero count is not an error line', () => {
  const text = [...ok(60), '5 passed, 0 failed', 'finished', 'bye'].join('\n');
  assert.equal(errorEvidence(text, ERROR_EVIDENCE, BUDGET), `finished${SEP}bye`);
});

test('other all-clear counts are never chosen as error evidence', () => {
  const text = [...ok(30), 'errors: 0', '0 errors', 'failures: 0', '0 failures', ...ok(30), 'finished', 'bye'].join('\n');
  assert.equal(errorEvidence(text, ERROR_EVIDENCE, BUDGET), `finished${SEP}bye`);
});

test('a count that is not zero is still an error line', () => {
  const text = [...ok(30), '10 failed', ...ok(30), 'bye'].join('\n');
  assert.equal(errorEvidence(text, ERROR_EVIDENCE, BUDGET), `progress ok${SEP}10 failed${SEP}progress ok${SEP}bye`);
});

test('a line with a real error and an all-clear count is still an error line', () => {
  const text = ['errors: 0', ...ok(50), 'TypeError: bad call, 0 failed', 'finished', 'bye'].join('\n');
  assert.equal(
    errorEvidence(text, ERROR_EVIDENCE, BUDGET),
    `progress ok${SEP}TypeError: bad call, 0 failed${SEP}finished${SEP}bye`,
  );
});

test('results at and just past the budget', () => {
  const at = 'x'.repeat(BUDGET - 6) + '\nerror';
  assert.strictEqual(errorEvidence(at, ERROR_EVIDENCE, BUDGET), at);
  const past = `${'y'.repeat(BUDGET - 5)}\nerror: boom`;
  assert.ok(errorEvidence(past, ERROR_EVIDENCE, BUDGET).length <= BUDGET);
  assert.match(errorEvidence(past, ERROR_EVIDENCE, BUDGET), /error: boom/);
});

test('a cut never splits an emoji', () => {
  const line = `${'😀'.repeat(700)} error here`;
  const evidence = errorEvidence(`${line}\n${filler(3)}`, ERROR_EVIDENCE, BUDGET);
  for (let i = 0; i < evidence.length; i++) {
    const code = evidence.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) assert.ok(/[\uDC00-\uDFFF]/.test(evidence[i + 1]), `lone high surrogate at ${i}`);
    if (code >= 0xdc00 && code <= 0xdfff) assert.ok(/[\uD800-\uDBFF]/.test(evidence[i - 1]), `lone low surrogate at ${i}`);
  }
});

test('one very long error line leaves room for the final lines', () => {
  const text = `${filler(5)}\nError: ${'z'.repeat(2000)}\n${filler(5)}\nexit status 2`;
  const evidence = errorEvidence(text, ERROR_EVIDENCE, BUDGET);
  assert.match(evidence, /exit status 2/);
  assert.ok(evidence.length <= BUDGET);
});

test('600 units are returned unchanged, 601 are cut to the budget', () => {
  const at = `${'y'.repeat(594)}\nerror`;
  assert.equal(at.length, 600);
  assert.equal(errorEvidence(at, ERROR_EVIDENCE, BUDGET), at);
  const past = `${'y'.repeat(595)}\nerror`;
  assert.equal(past.length, 601);
  assert.equal(errorEvidence(past, ERROR_EVIDENCE, BUDGET), `${'y'.repeat(590)}${SEP}error`);
});

test('a carriage return is not part of a kept line', () => {
  const text = [...ok(60), 'Error: boom', 'exit status 2'].join('\r\n');
  assert.equal(errorEvidence(text, ERROR_EVIDENCE, BUDGET), `progress ok${SEP}Error: boom${SEP}exit status 2`);
});

test('text of only whitespace is cut, never returned empty', () => {
  assert.equal(errorEvidence('\n'.repeat(700), ERROR_EVIDENCE, BUDGET), '\n'.repeat(600));
  assert.equal(errorEvidence('  \n'.repeat(300), ERROR_EVIDENCE, BUDGET), '  \n'.repeat(200));
});

test('two long error lines leave room for the final line', () => {
  const a = `Error A: ${'a'.repeat(491)}`;
  const b = `Error B: ${'b'.repeat(491)}`;
  const evidence = errorEvidence([a, b, 'exit status 2'].join('\n'), ERROR_EVIDENCE, BUDGET);
  assert.equal(evidence, [a.slice(0, 80), b.slice(0, 497), 'exit status 2'].join(SEP));
  assert.equal(evidence.length, BUDGET);
});

test('a 601-unit emoji text is cut without splitting a pair', () => {
  const text = `x${'😀'.repeat(300)}`;
  assert.equal(text.length, 601);
  assert.equal(errorEvidence(text, ERROR_EVIDENCE, BUDGET), `x${'😀'.repeat(299)}`);
});

test('importing the module prints nothing', () => {
  const run = spawnSync(process.execPath, ['-e', "require('./src/faultclip.js')"], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, '');
});

test('a later count summary does not displace the decisive error in the middle', () => {
  const progress = Array.from({ length: 8 }, (_, i) => `progress ${i} ${'y'.repeat(40)}`);
  const text = ['TypeError: first', 'x'.repeat(300), 'ReferenceError: decisive', '1 failed', ...progress].join('\n');
  assert.strictEqual(
    errorEvidence(text, ERROR_EVIDENCE, 600),
    ['TypeError: first', 'ReferenceError: decisive', progress[6], progress[7]].join('\n...\n'),
  );
});

test('a file named like an error does not take the named slot', () => {
  const text = ['compiling src/ErrorBoundary.tsx', 'z'.repeat(700), 'error[E0308]: mismatched types', 'done'].join('\n');
  assert.strictEqual(
    errorEvidence(text, ERROR_EVIDENCE, 600),
    ['compiling src/ErrorBoundary.tsx', 'error[E0308]: mismatched types', 'done'].join('\n...\n'),
  );
});

test('a million-line failed result keeps the error and its context', () => {
  const lines = Array.from({ length: 1_000_000 }, (_, i) => `ok ${i}`);
  const text = [...lines, 'ModuleNotFoundError: No module named requests', 'exit code 1'].join('\n');
  assert.strictEqual(
    errorEvidence(text, ERROR_EVIDENCE, 600),
    ['ok 999999', 'ModuleNotFoundError: No module named requests', 'exit code 1'].join('\n...\n'),
  );
});

test('an empty result is returned as is', () => {
  assert.strictEqual(errorEvidence('', ERROR_EVIDENCE, 600), '');
});

test('a path glued to an error word keeps the word, and any file extension is a path', () => {
  const progress = Array.from({ length: 6 }, (_, i) => `step ${i} ${'p'.repeat(40)}`);
  const middle = ['TypeError: first', 'q'.repeat(300), 'error:foo.c:12: decisive', '1 failed', ...progress];
  assert.strictEqual(
    errorEvidence(middle.join('\n'), ERROR_EVIDENCE, 600),
    ['TypeError: first', 'error:foo.c:12: decisive', progress[4], progress[5]].join('\n...\n'),
  );
  const later = ['TypeError: first', 'q'.repeat(300), 'ReferenceError: decisive', 'built src/ErrorBoundary.vue', ...progress];
  assert.strictEqual(
    errorEvidence(later.join('\n'), ERROR_EVIDENCE, 600),
    ['TypeError: first', 'ReferenceError: decisive', progress[4], progress[5]].join('\n...\n'),
  );
});

test('a file name never takes the named slot, a name before ": " always does', () => {
  const progress = Array.from({ length: 6 }, (_, i) => `step ${i} ${'p'.repeat(40)}`);
  const pick = (middle, ...later) =>
    errorEvidence(['TypeError: first', 'q'.repeat(700), middle, ...later, ...progress].join('\n'), ERROR_EVIDENCE, 600);
  assert.strictEqual(
    pick('ReferenceError: decisive', 'built ErrorBoundary.txt', '1 failed'),
    ['TypeError: first', 'ReferenceError: decisive', progress[4], progress[5]].join('\n...\n'),
  );
  assert.strictEqual(
    pick('bash: error.sh: command not found', '1 failed'),
    ['TypeError: first', 'bash: error.sh: command not found', progress[4], progress[5]].join('\n...\n'),
  );
  assert.strictEqual(
    pick('binascii.Error: Incorrect padding', 'reproduce_error.py:19: note: use --pdb'),
    ['TypeError: first', 'binascii.Error: Incorrect padding', progress[4], progress[5]].join('\n...\n'),
  );
});
