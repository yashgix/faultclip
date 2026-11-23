# faultclip

Preserve critical failure context when coding-agent output exceeds its character budget.

[Live page and interactive demo](https://yashgix.github.io/faultclip/)

Agent tools often cut a command's output to its first few hundred characters. For a test run or a traceback, the
decisive line (`ValueError: bad shape`, the failing test, `npm ERR! code ERESOLVE`) sits near the end, so the cut
removes exactly what the next reader needs. `errorEvidence` keeps that line inside the same budget.

```js
const { errorEvidence, ERROR_EVIDENCE_RE } = require('./src/faultclip');

errorEvidence(output, ERROR_EVIDENCE_RE, 600); // at most 600 UTF-16 units
```

The package is not published to npm. Copy `src/faultclip.js` into your project, or clone this repository and require
it by path.

Output that already fits is returned unchanged. Otherwise the result joins these lines with `...`, in this priority:

1. the last line that names the error
2. the first error line and the line before it
3. the final lines

A long chosen line is shortened around its first error word. Cuts never split an emoji or other surrogate pair.

## Results

Measured on public coding-agent sessions, comparing a plain first-600-characters cut with `errorEvidence`
([details](docs/BENCHMARKS.md)).

| Failed results whose key error line is kept                                           | First 600 characters | `errorEvidence` |
| ------------------------------------------------------------------------------------- | -------------------- | --------------- |
| 208 sessions from repositories not used in development (724 failures with a key line) | 176 (24%)            | **473 (65%)**   |
| 280 development sessions (719 failures with a key line)                               | 233 (32%)            | **717 (99.7%)** |

The development figure is higher because the line selection was tuned on those sessions. The result never exceeds the
budget. Inside a full session digest, a model-graded blind test preferred notes written from the new digest where the old digest
had lost the line, and showed no benefit or proven harm where it had not ([docs/BENCHMARKS.md](docs/BENCHMARKS.md#blind-tests)).

## Limits

- A heuristic picks the named line. A file name followed by `: ` with an error word in it counts as a name.
- Go compile errors with no error word, such as `file.go:12: undefined`, are not treated as error lines.
- The key line is still lost in about a third of unseen failures.
- The benchmarks use public benchmark sessions, not real users' sessions.

## Develop

```bash
npm test            # 23 tests, no network
npm run lint
npm run format:check
npm run bench       # needs Python 3 and network: downloads two public datasets at pinned revisions, then measures
```

The downloader compares each dataset's current revision with the pinned one and stops if they differ, so a dataset update
can prevent a future rerun. `python3 benchmark/fetch.py --limit 3` fetches only a few sessions for a quick check. Needs Node 22 or later. CI runs format, lint and tests on Node 22 and 24. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the selection works.

## Licence

MIT, see [LICENSE](LICENSE). Benchmark data credits are in [NOTICE](NOTICE).
