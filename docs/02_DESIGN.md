# 02 · Design

## Rule: the prototype is the spec
`docs/reference/verity-prototype.html` defines every pixel. The React app reproduces it exactly:

- `frontend/src/styles/verity.css` is the prototype's `<style>` block **copied verbatim**. Do not restyle in components; change this file only together with the prototype.
- Components render the **same HTML structure and class names** as the prototype's view functions (`vApps` → `pages/Apps.tsx`, `vReview` → `pages/Review.tsx`, …). Inline styles are carried over 1:1.
- No UI library (MUI, Fluent, Tailwind). They would change spacing, fonts and focus styles.
- Fonts: IBM Plex Sans 400/500/600/700 and IBM Plex Mono 400/500, bundled with `@fontsource` (same files as Google Fonts, no external request).
- Icons: `src/lib/icons.tsx`, same SVG paths and stroke widths.

## Tokens (from verity.css)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--acf` | #3730A3 | #5B5BD6 | Accent (deep indigo) fills |
| `--ps` / `--psb` | #047857 / #E6F5EE | #4ADE9B / #0F2F23 | Pass |
| `--fl` / `--flb` | #B42318 / #FDECEA | #FF8A80 / #3A1714 | Fail |
| `--bk` / `--bkb` | #9A5B06 / #FEF4E2 | #F7C266 / #36270C | Blocked / needs attention |
| `--nr` / `--nrb` | #4B5563 / #EEF0F3 | #B4BAC6 / #252A35 | Not run |

Light/dark is `data-theme` on `<html>`, remembered in localStorage.

## Verified parity
`npm run visual` drives the prototype and the app through the same 18 states at 1440px and pixel-diffs them. Current result: identical page heights on every screen, ≤0.011% pixel difference (sub-pixel anti-aliasing only), except two screens changed on purpose:

| Screen | Intentional change |
|---|---|
| "Run AI" provider modal | Option 2 is now "Claude — Automatic" instead of the download/paste hand-off |
| Report before validation | Buttons "Run with Azure OpenAI" / "Run with Claude" |
| Settings | Provider choices "Azure OpenAI only / Claude only"; "Claude model" field; Claude API in Integration health |

## Demo-only UI
Shown only when `VITE_MODE_DATA=demo`: the "Viewing as" role switcher, "Prototype only: sign in as", "Prototype: fill sample results" and the walkthrough panel. In API mode the role comes from Entra ID.
