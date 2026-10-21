# source-explorer. Ops

## nab

nab is the preferred fetcher for source-explorer. It returns clean markdown,
bypasses anti-bot, injects browser cookies, and scans for prompt injection.

Install:

```
cargo install nab
```

Or download a prebuilt binary from https://github.com/MikkoParkkola/nab/releases
(Windows x64: `nab-x86_64-pc-windows-msvc.exe`).

Verify: `nab --version`.

nab state lives in `~/.nab/`. No config file needed for basic fetch.
Useful flags:

- `--cookies <browser>` — reuse a browser session (auto, brave, chrome, firefox, safari, edge)
- `--format json` — structured output with confidence scores
- `--max-output-tokens <n>` — cap output size for LLM context
- `--diff` — show what changed since last fetch

For URL monitoring: `nab watch add <url> --interval 5m`.

## License

Core fetch, analyze, watch, MCP server: MIT.

PolyForm Noncommercial (EE modules, free for personal use):
cookie injection, fingerprint spoofing, WAF evasion, prompt-injection guards.

If the product goes commercial, those modules need a paid license or you
replace them. See https://github.com/MikkoParkkola/nab/blob/main/COMMERCIAL.md.

## Fallback

If nab is not installed or a fetch fails, source-explorer falls back to
webfetch. If both fail, the spec records the failure and stops.

If a page needs JavaScript rendering, nab has an opt-in browser mode
(`nab browser <url>`) that requires an external Chrome DevTools Protocol
endpoint. Not enabled by default.
