# Input v2 Specification

## Scope

This document defines the canonical input grammar for Spotgen frontend/backend integration.
It is intentionally stricter than legacy parser behavior to reduce ambiguous lookups.

## Input Contract

- Field: `input`
- Type: `string`
- Required: yes
- Validation: `input.trim().length > 0`
- Encoding: UTF-8
- Structure: multiline text, one directive or entry per line

## Line Processing

- Split on newlines (`\n`, `\r\n`).
- Trim each line.
- Ignore empty lines.
- Parse top-to-bottom in declared order.

## Canonical Syntax

### Track line

- Canonical form: `ARTIST - TITLE`
- Optional explicit album form: `ARTIST - TITLE - ALBUM` only when requested by advanced mode.

Examples:

- `Beach House - Walk in the Park`
- `Deerhunter - Desire Lines`

### Commands

- `#top <artist>`
- `#topN <artist>` where `N` is integer (`#top5`, `#top20`)
- `#similar <artist>`
- `#similarN <artist>`
- `#artist <artist>`
- `#artistN <artist>`
- `#album <artist> - <album>`
- `#albumN <artist> - <album>`
- `#albumid <spotify album uri|url|id>`
- `#playlist <owner>:<playlistId>`
- `#playlistN <owner>:<playlistId>`
- `#order by <property>`
- `#order by lastfm`
- `#order by lastfm:<username>`
- `#group by <property>`
- `#alternate by <property>`
- `#interleave by <property>` (alias of `#alternate by`)
- `#duplicates`
- `#unique`
- `#reverse`
- `#shuffle`
- `#csv`

### Raw Spotify references

- Track URI: `spotify:track:<id>`
- Album URI: `spotify:album:<id>`
- Artist URI: `spotify:artist:<id>`
- Playlist URI: `spotify:user:<user>:playlist:<id>`
- Equivalent `open.spotify.com` URLs are accepted.

### Web scraping URLs

- Plain URL line: `https://...`
- With page count prefix: `<N> https://...`

### M3U support

- Accept `#EXTM3U` and `#EXTINF:...` metadata lines.
- Track text extracted from `#EXTINF` title part.

## Frontend Validation Rules (Recommended)

- Reject empty input.
- Reject unknown directives (`#foo`) with line-level error.
- Enforce canonical track order: `ARTIST - TITLE`.
- For `#album`, enforce canonical order: `#album ARTIST - ALBUM`.
- For directives with `N`, enforce `N > 0` and integer.
- For `#order by` and `#group/#alternate by`, require non-empty property token.
- Warn (not block) on suspicious lines:
  - too short text (`< 3` chars)
  - all punctuation
  - multiple separators likely malformed (`---`, repeated tabs)

## Backend Normalization Rules (Recommended)

- Keep parser backward-compatible, but FE outputs canonical syntax only.
- Normalize multiple spaces to single spaces before submit.
- Preserve original user text for debugging in request logs.

## Error Model (API)

For parse/validation errors (future target):

```json
{
  "error": "Invalid input",
  "issues": [
    {
      "line": 12,
      "code": "UNKNOWN_DIRECTIVE",
      "message": "Unknown directive '#foo'."
    }
  ]
}
```

For now:

- Empty input => `400` with `input is required`.
- Runtime lookup failures are surfaced through output/logs.

## Output Expectations

Default format: `uri`

Supported formats from core:

- `uri`
- `list`
- `csv`
- `array`
- `log`
- `queue` (internal/debug, not for public FE contract)

## Compatibility Notes

- Legacy parser may still resolve reversed track order (`TITLE - ARTIST`) via fallback logic.
- Legacy parser accepts many loose forms; FE should not rely on permissive behavior.
- This spec defines the strict input the new UI should generate and validate.
