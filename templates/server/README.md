# {{title}}

{{description}}

Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

Needs Node.js 20 or newer. No account or key is required unless a tool says so.

**Claude Code**

```sh
claude mcp add {{name}} -- npx -y {{package}}
```

**Claude Desktop, Cursor, Windsurf and other clients** (add to the client's MCP config file):

```json
{
  "mcpServers": {
    "{{name}}": { "command": "npx", "args": ["-y", "{{package}}"] }
  }
}
```

**VS Code**

```sh
code --add-mcp '{"name":"{{name}}","command":"npx","args":["-y","{{package}}"]}'
```

**Docker**

```sh
docker build -t {{package}} . && docker run -i --rm {{package}}
```

**Hosted (Streamable HTTP)**: run `node src/server.mjs --http` (port from `PORT`, default 3000);
the endpoint is `POST /mcp`, stateless.

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

## License

MIT, Copyright (c) 2026 Arhan Canli.
