# AGENT Scratchpad

## Current Patterns

- Bun TLS to `irc.libera.chat:6697` can fail with `Cannot destructure property 'subject'` unless IPv4 is forced.

## Entries

Date: 2026-02-15
Issue: Reconnect loop on Libera with Bun TLS subject-destructure error.
Correction: Force IPv4 for Bun+TLS+Libera via `outgoing_addr: "0.0.0.0"`.
Preference: Keep TLS enabled; avoid dropping to plain IRC as first fix.
Action: Added workaround in `src/irc.ts` before `ircClient.connect(...)`.
