# Agent instructions

## Test suite performance on constrained hardware

Full server/client test suites (`npm test`) can take significantly longer than 10 minutes on
Raspberry Pi–class hardware. Each e2e test file creates its own in-memory SQLite database with
inline `CREATE TABLE` statements, and the suite runs dozens of these files sequentially through
vitest's `forks` pool. On a constrained CPU this adds up quickly.

- During iteration, prefer focused test runs: `vitest run tests/unit/services/foo.test.ts`,
  `vitest run tests/e2e/bar.e2e.test.ts`, or file-glob patterns.
- Before treating a vitest timeout as failure, run the full suite with either a generous
  per-test timeout (`--testTimeout=60000`) or verifiable shards. Investigate actual hard
  failures rather than exit-code timeouts.
- This is not a reason to skip required verification — greenfield runs confirm correctness.
  Just account for the hardware profile when interpreting results.
