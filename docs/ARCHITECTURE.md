# Architecture

`src/error-evidence.js` is one dependency-free module. It exports `errorEvidence(text, errorRe, budget)` and the default
error pattern `ERROR_EVIDENCE_RE`.

```
text ──► fits budget? ──yes──► text unchanged
            │ no
            ▼
   one pass over the lines ──► first error line, line before it, last error line,
                               last named error line, last two non-empty lines
            ▼
   order by priority ──► give each line space, reserving room for the lines after it
            ▼
   cut each line around its first error word ──► sort back into text order ──► join with "..."
```

## Decisions

**One pass, no line array.** `lineSpans` yields `[start, end)` offsets one line at a time, so a result with millions of
lines is scanned without building a list of strings. Only the few chosen lines are sliced out.

**The named line wins.** "Names an error" means the line is not just a count or a file name. `NOT_A_NAME` removes
counts such as `2 failed` and file-like tokens (`reproduce_error.py:19:`, `src/ErrorBoundary.vue`) before testing a
line, but keeps `binascii.Error: ...` because a `: ` follows the token. `ALL_CLEAR` removes `0 failed`, `no errors`
and similar, so a passing summary never takes the slot. If no line is clearly named, the last error line is used.

**Budget reservation.** Each chosen line may use what is left minus a minimum (`LINE_MIN` = 80 characters) for every
line still to come. A single very long error line therefore cannot push out the final lines.

**Surrogate-safe cuts.** `slicePairs` moves a cut by one unit when it would land inside a surrogate pair, so the
result never contains half an emoji and never exceeds the budget.

**Fallback.** If every candidate is empty, the first `budget` units are returned, so the function never returns an
empty string for non-empty text.

## Tests

`test/error-evidence.test.js` (23 tests) covers common tool output (npm, cargo and others), tracebacks, test logs,
all-clear counts, results exactly at the budget, emoji at a cut, carriage returns, whitespace-only text, a
million-line result, and that importing the module prints nothing.
