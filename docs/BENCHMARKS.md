# Benchmarks

## Key-line retention

`npm run bench` downloads two public datasets of coding-agent sessions at pinned revisions (see [NOTICE](../NOTICE)),
extracts every failed tool result (1,884 in total), and compares two ways of fitting each into 600 characters.

A **key line** is the last line of the full output that names an error (`error`, `exception`, `traceback`, `failed` or
`fatal`, ignoring source-file paths and `[Command ...]` markers), with decoration such as `=====` stripped and cut to
120 characters. A method keeps the key line if its 600 characters contain it. This is close to what `errorEvidence`
selects, so it shows retention, not usefulness on its own.

| Set                                              | Sessions | Failed results | With a key line | First 600 characters | `errorEvidence` | Over budget |
| ------------------------------------------------ | -------- | -------------- | --------------- | -------------------- | --------------- | ----------- |
| Development (SWE-Gym, 11 repositories)           | 280      | 826            | 719             | 233 (32%)            | 717 (99.7%)     | 0           |
| Unseen (SWE-rebench, one session per repository) | 208      | 1,058          | 724             | 176 (24%)            | 473 (65%)       | 0           |

The development set is higher because the selection was tuned on those sessions. The unseen set excludes the 11
development repositories by exact name, which does not rule out forks or shared issues. Results are in
`results/recall.json`.

The module was also checked against the pre-extraction version, which is not included here: all 1,884 failed results give identical output.

## Blind tests

These tests ran inside a session-digest builder that previously cut every tool result to its first 600 characters.
For each case, Claude Haiku 5.5 wrote a resume note from one digest only. Claude Sonnet 5.5 graded the pair against the
full session without knowing which digest produced which note. The preference score is 2 for the preferred note, 0 for the
other, and 1 each for a tie; the interval is a 2,000-sample bootstrap over items. The method was frozen before any model call. The test code and
raw records are not part of this repository.

| Test                                              | Items | Prefer new / old / tie | Difference (95% CI)  |
| ------------------------------------------------- | ----- | ---------------------- | -------------------- |
| Development, old digest had lost the error line   | 60    | 39 / 9 / 12            | +1.00 [0.60, 1.37]   |
| Development, old digest had kept it               | 20    | 3 / 4 / 13             | -0.10 [-0.60, +0.40] |
| Unseen repositories, old digest had lost the line | 32    | 24 / 3 / 5             | +1.31 [0.88, 1.69]   |
| Unseen repositories, old digest had kept it       | 8     | 5 / 2 / 1              | +0.75 [-0.50, +2.00] |

In the unseen test the note names the error 1.81 of 2 on average with the new digest, against 0.91 with the old one.

## Honest limits of these tests

- The unseen test only includes cases where the new digest kept the key line. It shows the value of keeping the line,
  not how often that happens, and it excludes 51 of 198 usable failures where the line was still lost.
- The control groups are small, so they cannot rule out harm. 3 of the 8 unseen control items have a banner of `=`
  characters as their key line. Only 5 say anything about harm.
- The development test informed the design, half of its failing cases come from one repository, and one run needed a
  repair (an answer in Python-style quotes was converted to JSON with its content unchanged).
- The unseen test first stopped at 16 of 40 items for lack of funding (+1.64 on 11 items). Funding was extended and all
  40 were graded. The final gain is smaller.
- An early version of the retention measure treated a banner such as `=====` as a key line, which overstated the
  unseen counts for both methods. `benchmark/measure.js` strips such decoration.
- One note model and one grader. All sessions are public benchmark runs, not real users' sessions.
