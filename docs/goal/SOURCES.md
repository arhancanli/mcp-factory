# Intent and technical references

Recovered owner intent:

- `factory.config.json`: Canli Labs brand, Arhan Canli ownership and collection.
- `docs/SPEC.md`: original goals and acceptance process, 2026-09-26.
- `docs/scout/2026-09-26-scout.md`: original niche strategy and finance exclusion.
- Owner request, 2026-10-13, session `01a13687-71ce-7503-977a-628c0b118198`:
  preserve previous goals; thousands of the best MCP servers; a complete lab for
  AI/model training, data, deep learning, ML, RL and wider learning methods;
  launch structured persistent goal work.

Primary technical references checked on 2026-10-13:

- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): stdio and Streamable HTTP behavior, required Origin validation and loopback guidance.
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): tools, schemas, annotations and structured results.
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): SDK interfaces; use the existing pinned version until any upgrade is independently checked.
- [scikit-learn common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html): fit preprocessing on training data and preserve independent evaluation.
- [PyTorch learning workflow](https://docs.pytorch.org/tutorials/beginner/basics/intro.html): data, models, optimization, saving and loading.
- [Gymnasium basic usage](https://gymnasium.farama.org/introduction/basic_usage/): seeding and separate termination/truncation flags.
- [SDK security advisory](https://github.com/advisories/GHSA-6qxp-vccf-f47h): OAuth client issue fixed in SDK 1.31.0 and later; server and stdio paths are not the affected client flows.
- [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): macOS ARM64 runner compatibility; macOS 15 selected to avoid the approaching macOS 14 runner retirement.
- [Express History.md](https://github.com/expressjs/express/blob/master/History.md): current historical version/deprecation facts; dates are absent from the current headings, so registry publication-date fallback is expected.

September scout demand, competitor counts, performance and benchmark records are
historical evidence. They must be dated and refreshed before new superiority or
current-adoption claims. Current source references do not prove our implementation
passes their requirements; execution evidence is recorded separately.

Primary references checked on 2026-10-14 (owner timezone):

- [UCI Iris](https://archive.ics.uci.edu/dataset/53/iris): 150 examples, four numeric features, three classes; CC BY 4.0 and creator citation. Validation uses the named bezdekIris.data archive member with no unrecorded corrections.
- [UCI Wine Quality](https://archive.ics.uci.edu/dataset/186/wine+quality): numeric regression/classification task, eleven predictors, red/white variants, CC BY 4.0 and original creator citation. Validation uses all 4,898 white-wine rows.
- [scikit-learn Ridge](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html): fixed regularized least squares for the bounded regression recipe.
- [GroupShuffleSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupShuffleSplit.html): group partition fractions concern groups rather than exact row fractions; our union-component splitter additionally links numeric duplicates.
- [Python 3.12 file locks](https://docs.python.org/3.12/library/fcntl.html): POSIX exclusive/nonblocking flock and Unix availability for local worker liveness.
- [Python filesystem operations](https://docs.python.org/3.12/library/os.html): flushed writes, fsync and exclusive link-based publication; validated on local macOS, Linux validation remains a separate gate.
- [GitHub advanced CodeQL configuration](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning): explicit JavaScript/TypeScript and Python analysis for the expanded laboratory.
