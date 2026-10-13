# Release qualification

A release is an exact package tree backed by fresh execution evidence. Publication
requires every original Scout, Build, Gate, Benchmark and Ship station. Local
readiness does not replace the owner's merge or initial npm browser confirmation.
The laboratory and thousands-of-servers goals remain in `docs/goal/`.

## Source and artifact identity

`src/kit/release.mjs` computes a SHA-256 manifest of committed executable files,
configuration, dependencies, fixed tasks, fixtures and workflows. Only generated
README/report files (`README.md`, `bench/perf.json`, `bench/results/`) are excluded
from this measurement input. Changing those reports cannot make old code evidence
current. The final release certificate separately binds the full Git tree, including
all reports and README claims. Exact packed tarball SHA-512 integrity is checked
again immediately before publication. Ignored working files are never exported.

The benchmark runner records raw final answers, complete usage including cached
input, provider/requested/resolved model identity, task/incumbent hashes, runner
hash and source hash. Release checks regrade answers and recompute totals instead
of accepting a claimed summary. Both arms cover the identical 10-100 task corpus
with the same resolved model, without API failures. Accuracy must match or exceed
the incumbent, reach at least 90%, and use fewer total tokens or demonstrate
additional tasks that the incumbent's documentation says it cannot cover. This
absolute accuracy floor prevents a comparison with no useful answers from winning
on token savings. It is a release criterion, not a claimed result.

An incumbent label or moving `latest` invocation does not identify what ran.
`bench/tasks.json` needs an explicit execution identity, such as:

```json
{
  "competitor": {
    "label": "The selected current incumbent",
    "command": "npx",
    "args": ["-y", "reference-mcp@1.2.3"],
    "identity": {"kind": "npm", "name": "reference-mcp", "version": "1.2.3"}
  }
}
```

PyPI uses `uvx`, `name==version` and a `pypi` identity; a Git-backed invocation
must include its full commit and identify its HTTPS repository. Scout review must
justify the strongest incumbent using current demand, source licence, cost and
rate-limit references. Structured scout schema is `canlilabs.scout.v1`, with
`server`, `reviewed_at`, dated `demand` records, `source` facts and an `incumbent`
matching the measured identity. These fields need actual research; filling a
placeholder does not establish demand or superiority.

## Prepare evidence before publication

1. Complete the scout and fixed corpus. Run paid agent comparisons only under the
   existing owner API/budget policy. Run `node bench/run.mjs servers/<name>` and
   `node scripts/perf.mjs <name>` to produce current provenance. Benchmark evidence
   expires after 30 days; live performance expires after seven days.
2. Run `npm run sync`, review generated claims and commit the final server tree.
   Reports can change the packed README, so packed qualification follows this step.
3. Run `npm run qualify -- <name>`. It executes factory checks, the independent
   package tests, real packed initialize/tools-list calls, npm audit and the actual
   live canary. Logs and a `canlilabs.quality.v1` receipt are written outside the
   server under `docs/quality/`. Quality expires after seven days. Failed checks
   cannot create a passing receipt; retain their existing logs and fix the failure.
4. Commit the scout, quality receipt/logs and benchmark/performance reports. Then
   run:

   ```sh
   node scripts/release-readiness.mjs <name> --certify \
     --scout docs/scout/<name>.json \
     --quality docs/quality/<name>/<source>/<timestamp>.json \
     --benchmark servers/<name>/bench/results/<timestamp>-<model>.json
   ```

   Certification validates the evidence before exclusively creating
   `docs/releases/<name>/<full-tree-id>.json`. Commit it for owner review.
5. `npm run release:check -- <name>` is read-only and reports precise deficiencies.
   Certificates expire after seven days. Legacy reports are retained as historical
   results; reports without current source/raw-answer provenance do not qualify.
6. `node scripts/publish-repos.mjs <name>` prepares an owner-signed draft PR with
   exact tree parity. It does not update existing `main` directly. An empty new
   repository gets only a signed review-base README. Existing review branches are
   reused only if the complete tree matches; owner changes are never overwritten.
7. After owner merges, first npm publication uses `scripts/publish-npm.mjs`. It
   checks every selected certificate before the first write, requires the factory
   commit on reviewed main, and checks each standalone main's tree and signature.
   Tagged releases repeat the same evidence check before npm/Registry/bundle steps.

## Registry states

Both paths query the declared exact version from the public HTTPS npm registry.
Only HTTP 404 means that exact version is missing. Authentication, throttling,
server errors, redirects, oversized/malformed metadata and transport failures are
unknown states and stop publishing. An existing version must match the qualified
packed bytes. A successful publish must be observed with matching integrity before
later release steps can proceed. Lookup failure is never counted as absence or a
verified publication. The public maintained-release count uses publication receipts
and later health evidence, not certificate or repository counts.
