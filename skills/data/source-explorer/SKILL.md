---
name: source-explorer
description: Use when the user wants to find and document a new data source for a public company (courts, disclosures, news, procurement, patents). Fetches pages with nab or webfetch, writes a source spec to docs/capabilities/sources/<company>/<source>.md. Trigger phrases: "find a source", "исследуй источник", "new data source", "новый тип данных".
---

# source-explorer

Fetch one data source for one public company. Write a source spec. Do not write parser code. Do not edit capability specs. One source per file.

Company-anchored only. If the anchor is not a single public company (topic + country, or any other non-company scope), delegate to `article-research` and stop; do not write a source spec here.

## Tools

- Fetch: `nab fetch <url>`. Fallback: webfetch.
- If both fail: record failure in spec, stop.
- Discovery primitive: `source-discovery` with `anchor=company`. Mechanical web discovery lives there; do not duplicate websearch here.
- Non-company anchors: delegate to `article-research`.

## Related skills

- `source-discovery` — mechanical discovery primitive (`anchor=company` here; `anchor=topic-country` for `article-research`).
- `article-research` — topic + country research orchestrator; delegate non-company anchors to it.

## Process

0. Anchor check: if the request is not anchored to one public company (topic + country or other non-company scope), delegate to `article-research` and stop.
1. Confirm ticker and legal name from `src/shared/data/tickers_data.py`. If absent, ask for legal name. If the user says a company name, resolve it to a ticker by searching the same file.
2. Fetch the company's disclosure and IR pages from the ticker record. Scan them for links to news, press releases, filings. In parallel, call `source-discovery` with `anchor=company` (pass company/ticker/legal name, kinds, limit, context). Merge its candidates with the IR-page candidates and dedup by URL. Propose one or two candidate sources with a one-line reason each. Do not ask which one; pick the most promising and continue. State the choice in the spec. In the spec's Discovery context, record each candidate's origin: IR page or web-discovery.
3. Fetch the chosen source. If captcha or login wall: record in spec, try the next candidate. If all fail: record failure, stop.
4. Identify: fields present, which are company-specific, what is stable, what changes over time.
5. Write spec to `docs/capabilities/sources/<company>/<source>.md`.
6. If source is ambiguous (partial match, unclear attribution, unreliable page): set AI debates flag, describe the open question.

Mechanical discovery is handled by `source-discovery`; source-explorer does not duplicate websearch.

## Spec template

````
# Source. <source-type> for <ticker>

Status: draft

## Company
Ticker, legal name, why this source belongs to this company.

## What to fetch
URL pattern, method, auth if any, expected frequency. Pagination or session tokens if any. If monitoring needed: `nab watch add <url> --interval <duration>`.

## What is in it
Fields, what each means, which matter for the dossier.

## Discovery context
How found: link from IR page, search, known registry, etc.

## Impact hypothesis
How data could affect company view. Concrete: "new lawsuit weakens brand", not "adds context".

## AI debates needed
Yes or no. If yes: open question, who argues it (rules agent vs LLM agent, or two LLM agents).

## Test cases
One real URL, one expected field value.
````

## Rules

- One source per file. Several sources = several files.
- File name: English, lowercase, hyphenated.
- If spec exists at target path: read, update, do not overwrite.
- If user asks "что нового ты нашёл": summarize written specs, do not re-fetch.
- Job ends at spec + test cases. Do not implement parsers unless asked.
