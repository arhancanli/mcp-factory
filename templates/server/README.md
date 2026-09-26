# {{title}}

<!-- badges:start -->
<!-- badges:end -->

{{description}}

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
<!-- install:end -->

## Tools

<!-- tools:start -->
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries. Nothing else is contacted, and nothing is logged
  except unexpected failures (to stderr, without your inputs).
- Results are compact JSON with a matching output schema. Lists say how many items were left out.

## Benchmark

<!-- bench:start -->
Not yet measured.
<!-- bench:end -->

## More MCP servers by Arhan Canli

<!-- family:start -->
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.
