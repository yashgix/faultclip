'use strict';

const NAMES_AN_ERROR = /error|exception|traceback|failed|fatal|panicked|denied|ERR!/i;
// A count ("1 failed", "2 errors") or a file name says nothing about which error it was. A file-like token is a
// name when a `: ` follows it (`binascii.Error: ...`, `bash: error.sh: command not found`) and a path otherwise,
// line numbers included (`reproduce_error.py:19:`, `src/ErrorBoundary.vue`). It stops at `:` and spaces, so
// `error:foo.c:12` keeps its `error:`.
const NOT_A_NAME = /\b[1-9]\d* (?:failed|errors?|failures?)\b|[\w./-]+\.[A-Za-z]\w{0,4}\b(?!:(?!\d))/gi;
// Counts and all-clears that only look like errors ("5 passed, 0 failed", "errors: 0", "no errors").
const ALL_CLEAR = /\b0 (?:failed|errors?|failures?)\b|\b(?:errors|failures): 0\b|\bno errors?\b|\berror-free\b/gi;
const isErrorLine = (line, errorRe) => errorRe.test(line.replace(ALL_CLEAR, ''));
const namesAnError = (line) => isErrorLine(line.replace(NOT_A_NAME, ''), NAMES_AN_ERROR);
// `line` from `start` to `end`, never splitting a UTF-16 surrogate pair.
function slicePairs(line, start, end) {
  if (start > 0 && /[\uDC00-\uDFFF]/.test(line[start])) start += 1;
  if (end < line.length && /[\uD800-\uDBFF]/.test(line[end - 1])) end -= 1;
  return line.slice(start, end);
}
// `size` characters of `line`, placed so that its first error word stays in view.
function around(line, errorRe, size) {
  if (size <= 0) return '';
  const m = errorRe.exec(line.replace(ALL_CLEAR, (all) => ' '.repeat(all.length)));
  const start = m ? Math.max(0, Math.min(m.index - Math.floor(size / 4), line.length - size)) : 0;
  return slicePairs(line, start, start + size);
}
const ERROR_EVIDENCE_RE =
  /error|traceback|exception|failed|fatal:|panicked at|command not found|permission denied|no such file|npm ERR!|exit (?:code|status) [1-9]/i;
const LINE_SEP = '\n...\n';
const LINE_MIN = 80; // what each chosen line keeps at least, whatever the lines before it take
// The [start, end) of each line of `text` without its line break, one at a time: a failed result can have
// millions of lines, and only the few chosen are kept.
function* lineSpans(text) {
  for (let start = 0; start <= text.length;) {
    const brk = text.indexOf('\n', start);
    const end = brk === -1 ? text.length : brk;
    yield [start, end > start && text[end - 1] === '\r' ? end - 1 : end];
    start = end + 1;
  }
}
function errorEvidence(text, errorRe, budget) {
  if (text.length <= budget) return text;
  let first, before, prev, named, last;
  const tail = [];
  for (const span of lineSpans(text)) {
    const line = text.slice(span[0], span[1]);
    if (line.trim() && tail.push(span) > 2) tail.shift();
    if (isErrorLine(line, errorRe)) {
      if (!first) [first, before] = [span, prev];
      last = span;
      if (namesAnError(line)) named = span;
    }
    prev = span;
  }
  const lineOf = (span) => text.slice(span[0], span[1]);
  // Budget order: the last line naming the error, the first error line, the line before it, the final lines.
  const order = [named ?? last, first, before, tail[1], tail[0]].filter(
    (span, k, all) => span && lineOf(span).trim() && all.findIndex((o) => o?.[0] === span[0]) === k,
  );
  const kept = [];
  let left = budget;
  for (const [k, span] of order.entries()) {
    const reserved = order.slice(k + 1).reduce((n, o) => n + Math.min(o[1] - o[0], LINE_MIN) + LINE_SEP.length, 0);
    const take = around(lineOf(span), errorRe, left - (kept.length ? LINE_SEP.length : 0) - reserved);
    if (!take) continue;
    kept.push([span[0], take]);
    left -= take.length + (kept.length > 1 ? LINE_SEP.length : 0);
  }
  if (!kept.length) return slicePairs(text, 0, budget);
  return kept
    .sort((a, b) => a[0] - b[0])
    .map(([, take]) => take)
    .join(LINE_SEP);
}

module.exports = { errorEvidence, ERROR_EVIDENCE_RE };
