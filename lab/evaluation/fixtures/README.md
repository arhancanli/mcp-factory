# Frozen laboratory evaluation fixture

`classification.csv.gz` contains the exact public synthetic CSV used by the nine
real runs in `docs/goal/evidence/2026-10-13-lab-final-runs.json`. It was generated
by the CanliLabs smoke recipe using `sklearn.make_classification`, seed 31415,
1,200 rows and 12 features. Arhan Canli dedicates this synthetic fixture to
CC0-1.0. It contains no private collected data, model weights or credentials.

`manifest.json` records compressed and uncompressed hashes. The split file has
720/240/240 row positions and a canonical JSON hash matching the original receipts.
The evaluation preparation script verifies all three hashes before recreating a
separate metadata-only workspace. It copies historical records; it does not claim
to retrain or recreate their model weights.

Regenerating floating-point samples from a seed can produce different final bytes
on another host, even with locked dependencies. The frozen task corpus therefore
uses recorded bytes instead of regenerating numeric features in CI. Normal smoke
training still generates its own fixture and records that environment's data hash.
