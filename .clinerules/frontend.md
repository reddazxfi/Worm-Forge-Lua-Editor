---
paths: ["src/components/**", "src/App.tsx"]
---
# Frontend / React rules

- Tailwind CSS 4 utilities inline in JSX. Never add a `.css` file or CSS-in-JS.
- Dark mode is `isLight ? <light classes> : <dark classes>` on every element that
  changes. Adding an element means adding BOTH branches, or it will look broken
  in one theme.
- Spacing/resizing: panes are pixel or percent state in `App.tsx` with manual
  `mousemove`/`mouseup` listeners on `window`. There is no layout library.
  Follow that existing pattern rather than introducing one.
- `useEffect` for persistence wraps localStorage access in `try { } catch {}`
  with no binding. Keep that shape.
- `CodeEditor.tsx` is a hand-rolled editor, not CodeMirror/Monaco. It uses a
  `key={activeFile}` remount in `App.tsx` to reset scroll/cursor per file.
  Do not swap in an editor library without asking.
- `selectedSymbolItem` is typed `any` in `App.tsx` and feeds `DocPane`. Prefer
  not to widen this further.
- Before any UI work, read `docs/app-visuals.md` (screenshots + layout map) and
  any spec in `docs/requests/`. Those are NOT auto-loaded; open them on demand.
