# {{title}}: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs actions-check`).
Post only after the release is on npm.

## Positioning

- One line: reviews GitHub Actions workflows for outdated actions, deprecated runtimes and runners,
  and injection risks, with the line and the fix.
- Who it is for: everyone whose agent writes or edits CI workflows; maintainers hardening their
  pipelines; security teams checking for pwn-request patterns.
- Why now: agents write workflows from memory (checkout@v3, set-output, ubuntu-20.04) and paste
  untrusted PR text into scripts. GitHub's deprecations break those pipelines, and the injections
  leak secrets.
- Proof: versions from the actions' own git tags, runtimes from their action.yml, runner status from
  GitHub's runner-images list, SHA pins ready to paste. Tool definitions of {{tool_chars}}
  characters.

## Show HN

**Title:** Show HN: Actions Check, an MCP server that reviews GitHub Actions workflows

**Text:**

Coding agents write CI workflows from memory: actions/checkout@v3 (which runs on the deprecated
Node 16), echo "::set-output", runs-on: ubuntu-20.04 (retired), and run: steps that expand
${{ github.event.pull_request.title }} straight into a shell. I built an MCP server that reviews
workflow files and says what to change, line by line.

It reads each action's versions from its git tags (the same listing git ls-remote uses, so no API
limit), the runtime from its action.yml at the commit you use, and runner availability from
GitHub's runner-images list, and gives the exact line to pin each action by commit SHA. It also flags
script injection, pull_request_target workflows that check out PR code, and deprecated workflow
commands.

No key, MIT: {{repo}}. `{{install}}`

## Reddit: r/github, r/devops (check each subreddit's rules first)

**Title:** Free tool for AI agents that reviews GitHub Actions workflows: outdated actions, SHA pins, injection

**Text:** Give it your workflow files: every action against its latest release with the SHA to pin,
Node 16 actions, retired runners (ubuntu-20.04), set-output, script injection and
pull_request_target risks, each with a line and a fix. Works in Claude Code, Cursor and other MCP
clients. {{repo}}

## Reddit: r/mcp

**Title:** Actions Check: GitHub Actions workflow review in {{tool_count}} tools

**Text:** {{tool_names}}. Tool definitions {{tool_chars}} characters. `{{claude_code_install}}`. {{repo}}

## X / Bluesky thread

1. Agents still write actions/checkout@v3 (Node 16, deprecated), ::set-output and runs-on: ubuntu-20.04 (retired).
2. I built an MCP server that reviews workflows: every action against its latest release, with the SHA line to pin.
3. It also catches script injection (PR titles in run:) and pull_request_target checkouts of PR code.
4. Free, MIT: {{repo}}

## LinkedIn

CI pipelines break when GitHub retires runtimes and runners, and leak secrets when untrusted pull
request text reaches a shell. I built Actions Check, an open-source MCP server that reviews GitHub
Actions workflows for outdated and deprecated actions, retired runners and injection risks, with the
exact line to change and the SHA to pin each action to. {{repo}}

## awesome-mcp-servers entry (Developer Tools)

- [arhancanli/{{package}}]({{repo}}) 📇 ☁️ 🍎 🪟 🐧 - Reviews GitHub Actions workflows: actions against their latest releases with SHA pins, deprecated Node runtimes, retired runners, set-output, script injection and pull_request_target risks, with lines and fixes.

## Directory blurbs

- Short: {{summary}}
- Long: {{description}}

## Cross-links

Footer: {{collection_size}} servers, each measured before release: {{collection_topic}}. Related: {{related}}.
