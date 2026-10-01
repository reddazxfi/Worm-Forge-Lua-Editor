# App Visuals

Reference screenshots of the running app. Read these before UI work so changes
match the existing look instead of guessing at it.

## Screenshots

- `screenshots/01-main-editor.png` - main window, dark theme, LiveHP mod open
- `screenshots/02-config-modal.png` - Editor Configuration modal, dark theme

## Reading the main window (shot 01)

Layout is a 3-column studio, all heights fixed to `h-screen`:

1. **StudioHeader** - brand block left ("WormForge Code Studio" + `v0.8.22 dev`
   chip), centre pill showing `Active Mod File: <path>` in amber, right side has
   "Load Mod / Script" dropdown and "Config" button.
2. **File tab strip** - one tab per open file, active tab gets an amber
   underline. Close button on hover.
3. **Action toolbar** - left group: SYNTAX CHECK (amber, turns rose when
   `errorCount > 0`), Keycode Tester, + Custom Verb, Format. Right group:
   Open Folder, Save (shows dirty count), Import, Save As.
4. **Left sidebar** - split vertically by a drag handle into:
   - UpperCornerTree: search box + "+ New" button, then collapsible sections
     (workspace, variables, enumerations, functions, classes, mods).
   - DocPane: docs for the selected symbol, with a `+ Insert` button.
5. **Centre stage** - CodeEditor: line-number gutter, syntax-highlighted Lua,
   transparent textarea on top holding the real caret.
6. **Bottom** - ConsoleOutput: `All / Errors / Warn` filter pills, diagnostics
   list, log stream, clear (trash) button.

## Reading the config modal (shot 02)

Single scrollable panel, sections stacked with amber uppercase headings:
THEME & APPEARANCE, TYPOGRAPHY & CODE SPACING, STARTUP & AUTO-LOAD BEHAVIOR,
RESIZABLE PANES STATE. Sticky footer with Export .ini / Export .json /
Import Config / Done (amber).

## Things that look like bugs but are not

- Theme buttons render as "DarkTheme" / "LightTheme" with no visible gap. The
  source says `Dark Theme` (ConfigModal.tsx:195). It is tight letter-spacing at
  that font size, not a missing space. Do not "fix" it.

## Conventions to match

- Amber (`amber-500`) is the single accent. Rose is reserved for errors.
- Dark surfaces: `#0e1115` app bg, `#171b21` panels, `#242b35` borders,
  `#cfdbe8` text.
- Every element needs BOTH light and dark classes via `isLight ? ... : ...`.
- Pane sizes are px/percent state in App.tsx with manual mousemove handlers.
## State captured 2026-09-30 (shot 01)

- Mod folder `D:\Worms Armageddon\Mods` open, `LiveHP/live.lua` active.
- Tree shows "Mods (83)" / "29 mod subfolders" - ExTurnSide, KillTheKing,
  LiveHP (expanded, 2 files), SpecialisIts_fffa, agility, endure...
- DocPane showing `wa.msg` (Enum with 11 values) with an `+ Insert` button.
- Console: `All (1)`, `Errors (0)`, `Warn (0)`, green "Syntax Check Succeeded"
  banner, one log line at 19:45:25.
- Pane sizes in shot 02: Sidebar 275px, Tree Height 39%, Console 222px.

## Caveat on reading these

- Light theme is NOT captured yet. Several classes are `isLight ? ... : ...`
  and a wrong light branch is invisible in these shots. Capture a light-theme
  screenshot before doing theme work.
- Fine detail is unreliable at this resolution: exact px padding and the precise
  hex of a border are guesses. Treat this doc as a map of the layout, not a
  stylesheet. The source is always the authority on values.
- The shot predates the "collapse sidebar sections by default" change, so the
  tree here is shown expanded. Current code defaults every section closed.