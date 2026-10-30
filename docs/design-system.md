# WORD-AL design system

The interface uses a compact centered title, square letter tiles, the familiar green/yellow/gray feedback palette, and a restrained QWERTY keyboard. The home-screen tile/keyboard preview and live practice board are the visual references; reusable components receive states from game data and never infer correctness themselves.

## Tokens and conventions

Theme colors are defined once in `src/styles.css` (`--bg`, `--text`, `--muted`, `--line`, `--green`, `--yellow`, `--gray`) and exposed through semantic aliases (`--color-background`, `--color-correct`, etc.). Tile sizing, tile/keyboard gaps, header sizing, focus ring, transition timing, control radius, and safe-area inset are also tokens. Prefer these aliases in new component rules. `Board` takes word length and row data; `Tile` maps the explicit state class; `Keyboard` maps shared feedback values. The keyboard feedback priority is implemented in `keyboardFeedback` in `src/game.ts`.

The light theme is the default. Dark theme values override the same palette variables. Controls use visible `:focus-visible` outlines, icon-only header controls have accessible labels, tile cells expose state/letter labels, and the UI reduces animation duration under `prefers-reduced-motion`. Mobile styles reduce tile dimensions and allow keyboard keys to flex within the viewport; bottom padding includes the device safe area.

Avoid decorative backgrounds, glows, excessive rounding, or colors outside the feedback palette. Test both 320px-wide screens and desktop layouts when changing game geometry.
