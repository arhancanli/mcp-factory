# Recall Check: launch kit

Numbers are filled from the server's measured files (`node scripts/launch-kit.mjs recall-check`).
Post only after the release is on npm.

## Positioning

- One line: is this product recalled? One question across CPSC, FDA and NHTSA, by name, model number,
  UPC or VIN.
- Who it is for: parents, shoppers, resellers and marketplaces, fleet and car owners, and anyone
  building a shopping, safety or support agent.
- Why now: recall data is split across agencies with different formats, and existing servers each
  cover one agency.
- Proof: one call covers four report streams plus vehicles; every match carries a confidence; UPCs
  are matched in every printed form; VIN check digits are verified. Tool definitions of
  1,765 characters against 10,121 for @cyanheads/cpsc-recalls-mcp-server, the most downloaded recall server
  (83% smaller).

## Show HN

**Title:** Show HN: Recall Check, one MCP call across CPSC, FDA and NHTSA recalls

**Text:**

"Is this recalled?" has no single answer in the US: CPSC covers consumer products, FDA covers food,
drugs and devices, NHTSA covers vehicles, and each publishes differently. I built an MCP server that
asks all of them at once and scores every record against your query: exact (UPC or long model
number), high, medium, or low (near matches, flagged). UPCs match in all the forms agencies print
them, and a VIN's check digit is verified so a typo is caught.

It is honest about coverage: it names the agencies searched, says when more reports exist than it
read, and notes FDA's weekly publishing lag. USDA meat and poultry are not covered because FSIS
refuses automated requests.

No key, MIT: https://github.com/arhancanli/recall-check-mcp. `npx -y recall-check-mcp`

## Reddit: r/Parenting, r/BuyItForLife (check each subreddit's rules first)

**Title:** A free tool that checks CPSC, FDA and NHTSA recalls at once

**Text:** Works inside Claude, Cursor and other AI assistants: ask about a product, model number,
barcode or car VIN and it checks every US recall agency in one go, with how sure each match is.
Open source: https://github.com/arhancanli/recall-check-mcp

## Reddit: r/mcp

**Title:** Recall Check: 3 tools for US recalls across agencies

**Text:** `check_recalls`, `recent_recalls`, `vehicle_recalls`. Tool definitions 1,765 characters versus
10,121 for the most downloaded recall server. `claude mcp add recall-check -- npx -y recall-check-mcp`. https://github.com/arhancanli/recall-check-mcp

## X / Bluesky thread

1. "Is this recalled?" means checking CPSC, FDA and NHTSA separately. I made one MCP call do all of it.
2. Name, brand, model number, UPC or VIN; every match comes with a confidence.
3. Honest about gaps: which agencies were searched, FDA's weekly lag, and no USDA (its API blocks bots).
4. Free, MIT: https://github.com/arhancanli/recall-check-mcp

## LinkedIn

Product recall data in the US is split across CPSC, FDA and NHTSA, each with its own format. I built
Recall Check, an open-source MCP server that searches all of them in one call, matches barcodes and
model numbers robustly, verifies VINs, and says how confident each match is. https://github.com/arhancanli/recall-check-mcp

## awesome-mcp-servers entry (Other Tools and Integrations)

- [arhancanli/recall-check-mcp](https://github.com/arhancanli/recall-check-mcp) 📇 🏠 🍎 🪟 🐧 - US recalls in one call: CPSC consumer products, FDA food, drugs and devices, NHTSA vehicles by VIN; matches by name, model number or UPC with a confidence per match.

## Directory blurbs

- Short: One recall check across CPSC, FDA and NHTSA: match by name, model number, UPC or VIN.
- Long: Checks US product recalls across agencies in one call: CPSC consumer products and FDA food, drugs and devices matched by name, brand, model number or UPC, and NHTSA vehicle recalls by VIN or make, model and year.

## Cross-links

Footer: 7 servers, each measured before release: https://github.com/topics/arhancanli-mcp. Related: Citation Check (https://github.com/arhancanli/citation-check-mcp), Drug Label (https://github.com/arhancanli/drug-label-mcp), End of Life (https://github.com/arhancanli/end-of-life-mcp).
