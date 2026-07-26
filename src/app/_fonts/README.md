# Bundled fonts (OG / share cards)

These WOFF files are vendored only for the `next/og` (satori) share-card
renderer, which needs the raw font bytes at build/runtime. They are embedded as
base64 in `src/lib/og/fontData.ts` and loaded via `src/lib/og/fonts.ts` (no fs /
no remote fetch, so the same path works in the Node build and on Cloudflare
Workers). The rest of the site loads these same families via `next/font/google`.

| File | Family | Weight | License |
|------|--------|--------|---------|
| `InstrumentSerif-Regular.woff` | Instrument Serif | 400 | SIL Open Font License 1.1 |
| `IBMPlexMono-Regular.woff` | IBM Plex Mono | 400 | SIL Open Font License 1.1 |

Both are OFL-1.1 and free to embed and redistribute. Latin subset only (the
glyphs the cards render). Sourced from the Fontsource distributions of the
upstream Google Fonts / IBM Plex projects.

To regenerate `fontData.ts` after replacing a font file, base64-encode each WOFF
into its exported constant.
