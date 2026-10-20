import React, { useRef, useState, useEffect, useMemo, useCallback, useImperativeHandle } from 'react';
import { Target, Crosshair, Plus, Check, Sliders, Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { SyntaxDiagnostic, CustomVerb } from '../types/wormforge';
import { BUILTIN_CLASSES, BUILTIN_ENUMERATIONS, BUILTIN_FUNCTIONS, BUILTIN_VARIABLES } from '../data/wormforgeDefinitions';
import { READABLE_WORM_STATES, SETTABLE_WORM_STATES } from '../data/wormStates';
import {
  getClass,
  resolveByName,
  rowForClass,
  traceLocalTypes,
  ALL_RECEIVER_PREFIXES,
  type HandleClassName,
} from '../data/handleRegistry';
import { buildScopes, visibleAt, type ScopeModel, type VisibleName } from '../services/scope';
import {
  escapeHtml,
  highlightLuaLine,
  resolveTokenClasses,
  themeSignature,
  type SyntaxOverrides,
  type TokenClasses,
} from '../services/editorHighlight';
import { LUA_GLOBALS_SET } from '../data/luaGlobals';
import { planInsertion } from '../services/completion';
import { lineStateBeforeCaret } from '../services/lineState';
import { tableKeySuggestions, tableValueSuggestions, tableContextAt } from '../services/tableContext';
import { startsNewUndoEntry, isWordBoundary } from '../services/undoPolicy';

export const STOCK_WA_WEAPON_SLOTS = [
  // Standard & Explosives
  { id: 'bazooka', name: 'Bazooka', category: 'Standard & Explosive' },
  { id: 'homing_missile', name: 'Homing Missile', category: 'Standard & Explosive' },
  { id: 'mortar', name: 'Mortar', category: 'Standard & Explosive' },
  { id: 'grenade', name: 'Grenade', category: 'Standard & Explosive' },
  { id: 'cluster_bomb', name: 'Cluster Bomb', category: 'Standard & Explosive' },
  { id: 'banana_bomb', name: 'Banana Bomb', category: 'Standard & Explosive' },
  { id: 'dynamite', name: 'Dynamite', category: 'Standard & Explosive' },
  { id: 'mine', name: 'Mine', category: 'Standard & Explosive' },
  { id: 'petrol_bomb', name: 'Petrol Bomb', category: 'Standard & Explosive' },
  { id: 'flame_thrower', name: 'Flame Thrower', category: 'Standard & Explosive' },

  // Firearms
  { id: 'shotgun', name: 'Shotgun', category: 'Firearms' },
  { id: 'handgun', name: 'Handgun / Pistol', category: 'Firearms' },
  { id: 'uzi', name: 'Uzi', category: 'Firearms' },
  { id: 'minigun', name: 'Minigun', category: 'Firearms' },
  { id: 'longbow', name: 'Longbow', category: 'Firearms' },

  // Melee & Close Combat
  { id: 'fire_punch', name: 'Fire Punch', category: 'Melee & Martial' },
  { id: 'dragon_ball', name: 'Dragon Ball', category: 'Melee & Martial' },
  { id: 'kamikaze', name: 'Kamikaze', category: 'Melee & Martial' },
  { id: 'suicide_bomber', name: 'Suicide Bomber', category: 'Melee & Martial' },
  { id: 'prod', name: 'Prod', category: 'Melee & Martial' },
  { id: 'battle_axe', name: 'Battle Axe', category: 'Melee & Martial' },
  { id: 'baseball_bat', name: 'Baseball Bat', category: 'Melee & Martial' },

  // Super Weapons
  { id: 'sheep', name: 'Sheep', category: 'Super Weapons' },
  { id: 'super_sheep', name: 'Super Sheep', category: 'Super Weapons' },
  { id: 'aqua_sheep', name: 'Aqua Sheep', category: 'Super Weapons' },
  { id: 'sheep_launcher', name: 'Sheep Launcher', category: 'Super Weapons' },
  { id: 'super_banana', name: 'Super Banana Bomb', category: 'Super Weapons' },
  { id: 'holy_grenade', name: 'Holy Hand Grenade', category: 'Super Weapons' },
  { id: 'armageddon', name: 'Armageddon (Global Meteor Shower)', category: 'Super Weapons' },
  { id: 'donkey', name: 'Concrete Donkey', category: 'Super Weapons' },
  { id: 'mad_cow', name: 'Mad Cow', category: 'Super Weapons' },
  { id: 'old_woman', name: 'Old Woman', category: 'Super Weapons' },
  { id: 'skunk', name: 'Skunk', category: 'Super Weapons' },
  { id: 'ming_vase', name: 'Ming Vase', category: 'Super Weapons' },
  { id: 'mole_bomb', name: 'Mole Bomb', category: 'Super Weapons' },
  { id: 'homing_pigeon', name: 'Homing Pigeon', category: 'Super Weapons' },
  { id: 'magic_bullet', name: 'Magic Bullet', category: 'Super Weapons' },
  { id: 'salvation_army', name: 'Salvation Army', category: 'Super Weapons' },
  { id: 'scales_of_justice', name: 'Scales of Justice', category: 'Super Weapons' },
  { id: 'earthquake', name: 'Earthquake', category: 'Super Weapons' },
  { id: 'nuclear_test', name: 'Nuclear Test / Reinforcement', category: 'Super Weapons' },
  { id: 'mb_bomb', name: 'MB Bomb', category: 'Super Weapons' },

  // Air Strikes
  { id: 'air_strike', name: 'Air Strike', category: 'Air Strikes' },
  { id: 'napalm_strike', name: 'Napalm Strike', category: 'Air Strikes' },
  { id: 'mail_strike', name: 'Mail Strike', category: 'Air Strikes' },
  { id: 'mine_strike', name: 'Mine Strike', category: 'Air Strikes' },
  { id: 'mole_squadron', name: 'Mole Squadron', category: 'Air Strikes' },
  { id: 'sheep_strike', name: 'Sheep Strike', category: 'Air Strikes' },
  { id: 'carpet_bomb', name: 'Carpet Bomb', category: 'Air Strikes' },

  // Movement & Transportation
  { id: 'ninja_rope', name: 'Ninja Rope', category: 'Movement & Utility' },
  { id: 'bungee', name: 'Bungee', category: 'Movement & Utility' },
  { id: 'parachute', name: 'Parachute', category: 'Movement & Utility' },
  { id: 'teleport', name: 'Teleport', category: 'Movement & Utility' },
  { id: 'jet_pack', name: 'Jet Pack', category: 'Movement & Utility' },

  // Construction & Match Utilities
  { id: 'girder', name: 'Girder', category: 'Construction & Utilities' },
  { id: 'girder_pack', name: 'Girder Pack (3/5)', category: 'Construction & Utilities' },
  { id: 'blow_torch', name: 'BlowTorch', category: 'Construction & Utilities' },
  { id: 'pneumatic_drill', name: 'Pneumatic Drill', category: 'Construction & Utilities' },
  { id: 'freeze', name: 'Freeze', category: 'Construction & Utilities' },
  { id: 'fast_walk', name: 'Fast Walk', category: 'Construction & Utilities' },
  { id: 'laser_sight', name: 'Laser Sight', category: 'Construction & Utilities' },
  { id: 'invisibility', name: 'Invisibility', category: 'Construction & Utilities' },
  { id: 'damage_x2', name: 'Damage x2', category: 'Construction & Utilities' },
  { id: 'double_turn_time', name: 'Double Turn Time', category: 'Construction & Utilities' },
  { id: 'crate_spy', name: 'Crate Spy', category: 'Construction & Utilities' },
  { id: 'crate_shower', name: 'Crate Shower', category: 'Construction & Utilities' },
  { id: 'select_worm', name: 'Select Worm', category: 'Construction & Utilities' },
  { id: 'low_gravity', name: 'Low Gravity', category: 'Construction & Utilities' },
];

// TOML (mod.toml) highlighting. §34: this now reads from the SAME palette as the
// Lua highlighter rather than keeping a second private set of colours, so picking
// a preset in the settings re-tints mod.toml too. TOML has three token kinds that
// map onto the Lua palette as: comment -> comment, `[section]` -> keyword,
// key -> declaration, value -> string.
function highlightTomlLine(
  line: string,
  isLight: boolean = false,
  palette?: TokenClasses,
): string {
  const p = palette ?? resolveTokenClasses(isLight);
  if (!line) return '&nbsp;';
  const trimmed = line.trim();
  // Comment (# ...)
  if (trimmed.startsWith('#')) {
    return `<span class="${p.comment}">${escapeHtml(line)}</span>`;
  }
  // Section header [section] or [[array_of_tables]]
  if (/^\s*\[\[?.*\]\]?\s*$/.test(line)) {
    return `<span class="${p.keyword}">${escapeHtml(line)}</span>`;
  }
  // Key = Value
  const eqIdx = line.indexOf('=');
  if (eqIdx !== -1) {
    const key = line.slice(0, eqIdx);
    const rest = line.slice(eqIdx);
    return `<span class="${p.declaration}">${escapeHtml(key)}</span>` +
           `<span class="${p.punctuation}">=</span>` +
           `<span class="${p.string}">${escapeHtml(rest.slice(1))}</span>`;
  }
  return escapeHtml(line);
}

interface AutocompleteItem {
  label: string;
  kind: 'method' | 'function' | 'variable' | 'property' | 'class' | 'keyword' | 'custom';
  detail?: string;
  insertText: string;
  documentation?: string;
  /**
   * How far back from the end of the inserted text the caret should land.
   * Used by table-key completions so `missile = {  }` leaves the caret inside
   * the braces instead of after them.
   */
  cursorBack?: number;
  /**
   * Sort weight, lower sorts first. Scope-aware entries get their distance from
   * the cursor's scope (see visibleAt().rank), engine entries get ENGINE_RANK so
   * a local declared two lines up always outranks the entire engine API.
   * Ties keep insertion order, which is why the items are appended scope-first.
   */
  rank?: number;
}

/** Anything from the engine definitions, sorted below every local name. */
const ENGINE_RANK = 1000;

// Autocomplete popup geometry. These are state (not fixed classes) because the
// window is user-resizable, and showAutocomplete() needs the current values to
// decide whether to flip above the caret. Keep them in sync with the style
// attributes on the popup element.
const AUTO_MIN_W = 240;
const AUTO_MAX_W = 900;
const AUTO_MIN_H = 120;
const AUTO_MAX_H = 560;
const AUTO_DEFAULT_W = 340;
const AUTO_DEFAULT_H = 264;

interface HistorySnapshot {
  code: string;
  cursorStart: number;
  cursorEnd: number;
}

// Persistent per-file undo/redo history across tab switches
const globalHistoryCache: Record<string, { undo: HistorySnapshot[]; redo: HistorySnapshot[] }> = {};

interface CodeEditorProps {
  code: string;
  onChange: (newCode: string) => void;
  diagnostics: SyntaxDiagnostic[];
  onCursorChange?: (line: number, column: number) => void;
  activeFile: string;
  fontSize?: number;
  lineHeight?: number;
  theme?: 'dark' | 'light';
  // Syntax palette (§34). Optional: omitted means the default 'classic' preset,
  // so every existing caller and the mount in App.tsx keep working unchanged.
  syntaxPreset?: string;
  syntaxOverridesDark?: SyntaxOverrides;
  syntaxOverridesLight?: SyntaxOverrides;
  jumpTarget?: { line: number; column: number; key: number } | null;
  /**
   * The custom_verbs.cfg overlay, passed per render from App (same list the
   * checkers get). Optional so every other caller keeps compiling; omitted
   * means autocomplete behaves exactly as before (engine tables only).
   */
  customVerbs?: CustomVerb[];
  /**
   * Show the suggestion popup while typing. Off is a real editor mode, not a
   * hidden setting: Tab then indents and nothing opens under the caret.
   */
  autocompleteEnabled?: boolean;
}

// Imperative handle exposed to App.tsx. Lets the DocPane / API Tree / Keycode
// "Insert" buttons drop a snippet at the caret instead of the end of the file.
export interface CodeEditorHandle {
  insertSnippet: (text: string) => string | null;
}

// (highlightLuaLine now lives in services/editorHighlight.ts, where it is testable.)

/**
 * Per-line highlighter cache.
 *
 * highlightLuaLine() is a character-by-character scan building an HTML string,
 * and it used to run for every line on every render -- including renders caused by
 * something unrelated to the text, like the cursor moving or a diagnostic
 * appearing. On rules.lua that is 4,689 string builds per keystroke.
 *
 * Keyed by the line text, so a keystroke that changes one line re-highlights one
 * line and reuses the other 4,688. The theme is folded into the key because the
 * two light/dark modes emit different markup.
 *
 * §34: the key must ALSO change when the user picks a different syntax preset or
 * edits a single colour override. Without that, changing the palette would appear
 * to do nothing until the file was closed and reopened -- the editor would keep
 * serving markup built for the old colours out of this cache. `themeSignature()`
 * collapses the whole palette choice (preset id + both override maps) into one
 * short string, and the resolved classes are appended so that changing the code
 * path that produces them also invalidates old entries.
 * Bounded: a big file would otherwise grow this without limit as the user types,
 * so the oldest half is dropped on overflow.
 */
const highlightCache = new Map<string, string>();
const HIGHLIGHT_CACHE_MAX = 20000;

function cachedHighlightLuaLine(
  line: string,
  isLight: boolean,
  sig: string,
  palette: TokenClasses,
): string {
  const key = `${isLight ? 'L' : 'D'}\u0000${sig}\u0000${line}`;
  const hit = highlightCache.get(key);
  if (hit !== undefined) return hit;

  const html = highlightLuaLine(line, isLight, palette);
  if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
    // Insertion-ordered Map: the first keys are the oldest. Dropping half keeps
    // the hot working set (recently typed lines) and caps memory.
    const drop = HIGHLIGHT_CACHE_MAX / 2;
    let i = 0;
    for (const k of highlightCache.keys()) {
      highlightCache.delete(k);
      if (++i >= drop) break;
    }
  }
  highlightCache.set(key, html);
  return html;
}
export const CodeEditor = React.forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    code,
    onChange,
    diagnostics,
    onCursorChange,
    activeFile,
    fontSize = 13,
    lineHeight = 1.5,
    theme = 'dark',
    syntaxPreset,
    syntaxOverridesDark,
    syntaxOverridesLight,
    jumpTarget,
    customVerbs = [],
    autocompleteEnabled = true,
  },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1, index: 0 });
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [selectedAutoIdx, setSelectedAutoIdx] = useState(0);

  // Autocomplete window size, user-resizable. Reset per file so a window widened
  // for one pack does not permanently change the next.
  const [autoSize, setAutoSize] = useState({ w: AUTO_DEFAULT_W, h: AUTO_DEFAULT_H });

  // Resize drag state. Kept in a ref because the mousemove/mouseup listeners are
  // attached to `window` (the pointer leaves the 4px handle otherwise) and must
  // not be torn down and rebuilt on every move.
  const autoDragRef = useRef<{ axis: 'w' | 'h'; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Signature (joined labels) of the list currently on screen. Arrow-key
  // navigation needs this: the textarea also runs the full trigger check on
  // keyup/select (onKeyUp/onSelect below), so pressing ArrowDown set the
  // highlight to 1 and the keyup immediately re-ran showAutocomplete, which
  // reset it to 0. The first item was then selected no matter how many times
  // you pressed the key. preventDefault() stops the caret moving but cannot
  // stop the keyup event. When the signature is unchanged this is a refresh of
  // the same context, so the highlight is preserved; a genuinely different list
  // (you typed another character) still starts at the top.
  const lastAutoSignatureRef = useRef<string | null>(null);

  const isToml = activeFile.toLowerCase().endsWith('.toml');
  const [selectedWeapon, setSelectedWeapon] = useState<string>('armageddon');
  const [insertedNotice, setInsertedNotice] = useState<string | null>(null);

  // Diagnostic line flash highlight state
  const [flashingLine, setFlashingLine] = useState<number | null>(null);

  // Find In Code State (F3 / Ctrl+F scoped strictly to editor)
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo Engine State
  const isInternalUndoRedoRef = useRef(false);
  const lastCodeRef = useRef(code);
  const lastTypingTimeRef = useRef(0);

  const getHistory = useCallback(() => {
    if (!globalHistoryCache[activeFile]) {
      globalHistoryCache[activeFile] = {
        undo: [{ code, cursorStart: 0, cursorEnd: 0 }],
        redo: [],
      };
    }
    return globalHistoryCache[activeFile];
  }, [activeFile, code]);

  // Synchronize external code updates (e.g. snippet insertions from DocPane/Tree, template loads, format) into undo stack
  useEffect(() => {
    if (isInternalUndoRedoRef.current) {
      isInternalUndoRedoRef.current = false;
      lastCodeRef.current = code;
      return;
    }

    if (code !== lastCodeRef.current) {
      const hist = getHistory();
      const top = hist.undo[hist.undo.length - 1];
      const now = Date.now();
      const timeDiff = now - lastTypingTimeRef.current;
      lastTypingTimeRef.current = now;

      const cursor = textareaRef.current
        ? { start: textareaRef.current.selectionStart, end: textareaRef.current.selectionEnd }
        : { start: code.length, end: code.length };

      const isNewline = code.length > (top?.code.length || 0) && code.endsWith('\n');
      const shouldPushNew =
        !top ||
        timeDiff > 600 ||
        isNewline ||
        Math.abs(code.length - (top?.code.length || 0)) > 8;

      if (shouldPushNew) {
        if (hist.undo.length >= 250) {
          hist.undo.shift();
        }
        hist.undo.push({
          code,
          cursorStart: cursor.start,
          cursorEnd: cursor.end,
        });
        hist.redo = [];
      } else {
        top.code = code;
        top.cursorStart = cursor.start;
        top.cursorEnd = cursor.end;
      }

      lastCodeRef.current = code;
    }
  }, [code, getHistory]);

  const applyProgrammaticChange = useCallback(
    (newCode: string, newCursorPos?: number) => {
      const hist = getHistory();
      const currentCursor = textareaRef.current
        ? { start: textareaRef.current.selectionStart, end: textareaRef.current.selectionEnd }
        : { start: code.length, end: code.length };

      // Preserve the viewport. This is a controlled <textarea>: when React
      // writes the new `value`, the browser auto-scrolls to the caret. Without
      // capturing and restoring scroll here the view would jump to the bottom
      // of the file even though the caret itself was restored correctly.
      const prevScroll = textareaRef.current
        ? { top: textareaRef.current.scrollTop, left: textareaRef.current.scrollLeft }
        : { top: 0, left: 0 };

      // Ensure current state is recorded
      if (hist.undo.length === 0 || hist.undo[hist.undo.length - 1].code !== code) {
        hist.undo.push({
          code,
          cursorStart: currentCursor.start,
          cursorEnd: currentCursor.end,
        });
      }

      // Clear redo history when user makes a new edit
      hist.redo = [];

      // Record the new state
      const targetPos = newCursorPos !== undefined ? newCursorPos : newCode.length;
      hist.undo.push({
        code: newCode,
        cursorStart: targetPos,
        cursorEnd: targetPos,
      });

      lastCodeRef.current = newCode;
      onChange(newCode);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(targetPos, targetPos);
          // Restore scroll AFTER the caret so the browser's auto-scroll is undone.
          textareaRef.current.scrollTop = prevScroll.top;
          textareaRef.current.scrollLeft = prevScroll.left;
          if (highlightRef.current) {
            highlightRef.current.scrollTop = prevScroll.top;
            highlightRef.current.scrollLeft = prevScroll.left;
          }
          if (gutterRef.current) {
            gutterRef.current.scrollTop = prevScroll.top;
          }
        }
      }, 0);
    },
    [code, getHistory, onChange]
  );

  const performUndo = useCallback(() => {
    const hist = getHistory();
    if (hist.undo.length <= 1) return;

    const currentCursor = textareaRef.current
      ? { start: textareaRef.current.selectionStart, end: textareaRef.current.selectionEnd }
      : { start: code.length, end: code.length };

    const current = hist.undo.pop()!;
    hist.redo.push({
      code: current.code,
      cursorStart: currentCursor.start,
      cursorEnd: currentCursor.end,
    });

    const prev = hist.undo[hist.undo.length - 1];
    if (prev) {
      isInternalUndoRedoRef.current = true;
      lastCodeRef.current = prev.code;
      onChange(prev.code);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(prev.cursorStart, prev.cursorEnd);
        }
      }, 0);
    }
  }, [getHistory, code, onChange]);

  const performRedo = useCallback(() => {
    const hist = getHistory();
    if (hist.redo.length === 0) return;

    const currentCursor = textareaRef.current
      ? { start: textareaRef.current.selectionStart, end: textareaRef.current.selectionEnd }
      : { start: code.length, end: code.length };

    const next = hist.redo.pop()!;
    hist.undo.push({
      code: next.code,
      cursorStart: currentCursor.start,
      cursorEnd: currentCursor.end,
    });

    isInternalUndoRedoRef.current = true;
    lastCodeRef.current = next.code;
    onChange(next.code);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(next.cursorStart, next.cursorEnd);
      }
    }, 0);
  }, [getHistory, onChange]);

  const insertTextAtCursor = (textToInsert: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart ?? code.length;
    const end = textareaRef.current.selectionEnd ?? code.length;
    const nextCode = code.slice(0, start) + textToInsert + code.slice(end);
    applyProgrammaticChange(nextCode, start + textToInsert.length);
    setInsertedNotice(`Inserted "${textToInsert.trim()}"`);
    setTimeout(() => setInsertedNotice(null), 2500);
  };

  // Public entry point for the "Insert" buttons in DocPane / API Tree / Keycode
  // modal. Drops the snippet at the caret (replacing any selection) instead of
  // appending to the end of the file, and mirrors the caret line's indentation
  // onto the inserted lines so a function body lands at the right depth.
  // Returns the new document text so App.tsx can re-run the syntax check.
  const insertSnippetAtCaret = (snippet: string): string | null => {
    if (!textareaRef.current) return null;

    const start = textareaRef.current.selectionStart ?? code.length;
    const end = textareaRef.current.selectionEnd ?? code.length;

    // Leading whitespace of the line the caret sits on.
    const lineStart = code.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const caretIndent = (code.slice(lineStart, start).match(/^[ \t]*/) ?? [''])[0];

    const indented = snippet
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line, i) => (i === 0 || line.length === 0 ? line : caretIndent + line))
      .join('\n');

    const nextCode = code.slice(0, start) + indented + code.slice(end);
    applyProgrammaticChange(nextCode, start + indented.length);
    setInsertedNotice(`Inserted "${snippet.trim().split('\n')[0].slice(0, 40)}"`);
    setTimeout(() => setInsertedNotice(null), 2500);
    return nextCode;
  };

  useImperativeHandle(ref, () => ({ insertSnippet: insertSnippetAtCaret }));

  const lines = useMemo(() => code.split('\n'), [code]);

  // Receiver-type trace. Also lazy rather than a useMemo: it is a full-file regex
  // pass (1.1 ms measured on rules.lua) and a useMemo on `code` re-ran it on every
  // keystroke for the same reason buildScopes did -- see getScopeModel above. It is
  // only consulted when the member branch (`worm:`, `obj.`) actually fires.
  const traceCacheRef = useRef<{ code: string; map: Map<string, HandleClassName> } | null>(null);

  const getTracedTypes = (): Map<string, HandleClassName> => {
    const cached = traceCacheRef.current;
    if (cached && cached.code === code) return cached.map;
    const map = traceLocalTypes(code);
    traceCacheRef.current = { code, map };
    return map;
  };

  // Scope model for identifier autocomplete (Track A / A4).
  //
  // LAZY, and deliberately not a useMemo. Measured on highlander's rules.lua
  // (165 KB, 4,689 lines):
  //
  //     buildScopes  17.6 ms   <- per call
  //     tokenize      8.9 ms   <- most of the above
  //
  // A useMemo keyed on `code` still re-ran that on every keystroke, because `code`
  // is what changes when you type. That put 17 ms of tokenizer work directly in
  // the typing path -- a regression introduced when this model was first wired in.
  // Memoisation only helps when a value is read many times for ONE code state; it
  // does nothing across edits.
  //
  // So the model is computed on demand, from a one-entry cache keyed by the exact
  // string. During a burst of typing the popup opens on every keyup, so consecutive
  // reads within one keystroke still hit the cache; the cost is paid once per
  // edit, only when something actually asks what is in scope.
  //
  // `console.warn` above 40ms stays, so a future regression names its cause rather
  // than just feeling slow.
  const scopeCacheRef = useRef<{ code: string; model: ScopeModel } | null>(null);

  // Above this many lines the popup skips the scope model entirely.
  //
  // MEASURED (buildScopes, 3 runs each, against the real packs):
  //     700 lines    2.6 ms
  //    1400 lines    3.8 ms
  //    2800 lines    5.3 ms   <- chosen threshold
  //    4689 lines   19.7 ms   (rules.lua, measured on the real file)
  //   11200 lines   23.0 ms
  //
  // ~2.3 ms per 1,000 lines, so the cost is linear and predictable. 2,800 sits at
  // the 8 ms mark: a quarter of a 60 fps frame, on a path that runs on EVERY keyup
  // and on every keyup that opens the popup. At rules.lua's size the popup was
  // spending ~20 ms synchronously per keystroke and appeared dead, which is
  // exactly the "suggestions don't work on large files" report.
  //
  // Above the threshold the popup still works -- it just falls back to the engine
  // declarations and the receiver registry, with no file scoping. Losing local
  // suggestions on a 4,000-line file is a far better trade than a stuttering
  // editor. The scope-aware DIAGNOSTICS in parser.ts are unaffected: they run on
  // demand, not per keystroke, so they keep their full accuracy at any size.
  const SCOPE_SUGGEST_MAX_LINES = 2800;

  const getScopeModel = (): ScopeModel | null => {
    if (lines.length > SCOPE_SUGGEST_MAX_LINES) return null;

    const cached = scopeCacheRef.current;
    if (cached && cached.code === code) return cached.model;

    const t0 = performance.now();
    const model = buildScopes(code);
    const took = performance.now() - t0;
    if (took > 40) {
      console.warn(`[scope] buildScopes took ${Math.round(took)}ms on ${code.length} chars`);
    }
    scopeCacheRef.current = { code, model };
    return model;
  };

  // Reset selection and scroll cleanly whenever activeFile changes.
  // focus() MUST come before setting the selection: focusing a textarea moves
  // the caret to the end of the text, so assigning selectionStart first and
  // focusing afterwards left the caret at end-of-file (snippets then appeared
  // to "append" even though the insert ran at the caret).
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
      textareaRef.current.scrollLeft = 0;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(0, 0);
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = 0;
      highlightRef.current.scrollLeft = 0;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = 0;
    }
    // Reset the virtualised window too. Assigning scrollTop fires no scroll event,
    // so without this the newly-opened file would render the previous file's
    // window until the user happened to scroll.
    setScrollTop(0);
    setCursorPos({ line: 1, column: 1, index: 0 });
    setAutocompleteVisible(false);
    lastAutoSignatureRef.current = null;
  }, [activeFile]);

  // Copy handler ensures the exact text from the active file's selection is copied
  const handleCopy = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      const textToCopy = code.slice(start, end);
      e.clipboardData.setData('text/plain', textToCopy);
      e.preventDefault();
    }
  };

  // Sync scroll with handleScroll.
  const handleScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
    // Reposition the popup from the corrected measureCaret(), which already accounts
    // for scrollTop with the correct sign.
    if (autocompleteVisible) {
      const at = measureCaret();
      if (at) setAutocompletePos({ top: at.top + lineHeightPx + 0.5, left: at.left });
    }
    // Feed the virtualised window. rAF-throttled inside, because a scroll gesture
    // fires far more events than the window can usefully change.
    noteScrollTop();
  };

  // Cursor position. Shared by typing, clicking, dragging and programmatic
  // selection, so the read happens in one place.
  //
  // Read lastCodeRef, NOT the `code` prop. handleTextareaChange calls this in
  // the same tick as onChange(), so React has not re-rendered yet and the prop
  // is one keystroke behind the DOM that selectionStart is read from. Every
  // trigger regex below is $-anchored, so a stale prop means the character just
  // typed is missing -- and that character is usually the one that opens the
  // popup: `:` in `worm:`, `.` in `wa.`. The popup then only appeared if you
  // pressed some other key afterwards.
  //
  // lastCodeRef is already synchronised on every mutation path: change (1227),
  // applyProgrammaticChange (388), undo (429), redo (456), and this effect
  // re-syncs it to `code` once the render catches up (349). So outside the
  // keystroke race it equals the prop and nothing changes.
  const readCaretContext = () => {
    if (!textareaRef.current) return null;
    const live = lastCodeRef.current;
    const selStart = textareaRef.current.selectionStart;
    const textBefore = live.slice(0, selStart);
    const codeLines = textBefore.split('\n');
    const line = codeLines.length;
    const col = codeLines[codeLines.length - 1].length + 1;

    setCursorPos({ line, column: col, index: selStart });
    if (onCursorChange) onCursorChange(line, col);

    return { textBefore, line, col, lineText: codeLines[codeLines.length - 1] };
  };

  const updateCursorAndAutocomplete = () => {
    const ctx = readCaretContext();
    if (!ctx) return;
    checkAutocompleteTrigger(ctx.lineText, ctx.line, ctx.col, ctx.textBefore);
  };

  // A click or drag is for placing the caret and selecting text, never for
  // opening the list. `onSelect` fires for mouse and keyboard both, so opening
  // from it put a suggestion row under the second click of a double-click: the
  // click landed on the row and inserted it instead of selecting the word.
  // Keyboard paths (onKeyUp) still open the popup.
  const handlePointerSelect = () => {
    readCaretContext();
    if (autocompleteVisible) {
      setAutocompleteVisible(false);
      lastAutoSignatureRef.current = null;
    }
  };

  const checkAutocompleteTrigger = (
    lineText: string,
    lineNum: number,
    colNum: number,
    sourceToCaret: string,
  ) => {
    // A disabled popup still lets the caret/scope state update above; it just
    // never builds a list. Tab then falls through to the indent handler.
    if (!autocompleteEnabled) {
      if (autocompleteVisible) {
        setAutocompleteVisible(false);
        lastAutoSignatureRef.current = null;
      }
      return;
    }

    // Exclusive TOML autocomplete for stock weapon slots
    if (isToml) {
      const wordMatch = lineText.match(/([a-zA-Z_][a-zA-Z0-9_]{1,})$/);
      if (wordMatch) {
        const query = wordMatch[1].toLowerCase();
        const matches = STOCK_WA_WEAPON_SLOTS.filter(
          (w) => w.id.includes(query) || w.name.toLowerCase().includes(query)
        ).slice(0, 12);
        if (matches.length > 0) {
          const items: AutocompleteItem[] = matches.map((m) => ({
            label: m.id,
            kind: 'property',
            detail: m.name,
            insertText: `"${m.id}"`,
            documentation: `Worms Armageddon stock weapon slot: ${m.name} (${m.category})`,
          }));
          showAutocomplete(items, lineNum, colNum);
          return;
        }
      }
      setAutocompleteVisible(false);
      lastAutoSignatureRef.current = null;
      return;
    }

    // Prose is not code. `-- see wa.` and `print("wa.` used to offer the whole
    // engine namespace; only the enum-value branch (1.5) belongs inside a
    // string, and it runs before the suppression below.
    const lineState = lineStateBeforeCaret(lineText);
    if (lineState.inComment) {
      setAutocompleteVisible(false);
      lastAutoSignatureRef.current = null;
      return;
    }

    // 1. Unified Object Member Trigger for both '.' and ':' (e.g. worm:abc, worm.abc, a:abc, a.abc)
    const memberMatch = lineState.inString
      ? null
      : lineText.match(/([a-zA-Z0-9_]+)([:.])([a-zA-Z0-9_]*)$/);
    if (memberMatch) {
      const obj = memberMatch[1];
      const sep = memberMatch[2]; // ':' or '.'
      const query = memberMatch[3].toLowerCase();
      const items: AutocompleteItem[] = [];

      // A. Handles. Receiver names resolve through data/handleRegistry.ts --
      // the SAME table services/parser.ts uses, so this popup can never offer a
      // member the checker then warns about, or miss one the checker knows.
      // One branch serves WormEntity, LuaActor, WorldHandle (mine/drum/oil/
      // crate/grave all resolve there), the missile_frame payload table, and
      // the inventory namespace.
      // Resolution order matches services/parser.ts exactly: traced call-site
      // returnType first, then the name table. Sharing it is the point -- a
      // suggestion and a warning for the same receiver must never disagree.
      const tracedClass = getTracedTypes().get(obj);
      const regRow = tracedClass ? rowForClass(tracedClass) : resolveByName(obj);
      if (regRow) {
        const wormCls = getClass(regRow.className);
        // A registry row whose className is missing from BUILTIN_CLASSES. The old
        // `!` turned that data gap into a render-adjacent TypeError instead of a
        // quiet skip, so it is checked rather than asserted.
        if (!wormCls) {
          setAutocompleteVisible(false);
          lastAutoSignatureRef.current = null;
          return;
        }
        
        // Add all methods
        for (const m of wormCls.members.filter((m) => m.kind === 'method')) {
          if (!query || m.name.toLowerCase().includes(query)) {
            const params = m.parameters?.map((p) => p.name).join(', ') || '';
            items.push({
              label: m.name,
              kind: 'method',
              detail: `${obj}${sep}${m.name}(${params})`,
              insertText: `${m.name}(${params})`,
              documentation: m.description,
            });
          }
        }
        
        // Add all variables and properties (worm:hp or worm.hp)
        for (const v of wormCls.members.filter((m) => m.kind !== 'method')) {
          if (!query || v.name.toLowerCase().includes(query)) {
            items.push({
              label: v.name,
              kind: v.kind === 'variable' ? 'variable' : 'property',
              detail: `${obj}${sep}${v.name} (${v.returnType || 'any'})`,
              insertText: v.name,
              documentation: v.description,
            });
          }
        }

        // Custom-verb overlay for THIS class (custom_verbs.cfg). Same list the
        // checkers get, so a suggestion here can never be a warning there. A
        // verb whose name collides with an engine member is skipped: the engine
        // row above already offers it, and a duplicate entry would just split
        // the arrow-key navigation.
        const engineNames = new Set(wormCls.members.map((m) => m.name));
        for (const v of customVerbs) {
          if (v.class !== regRow.className) continue;
          if (engineNames.has(v.name)) continue;
          if (query && !v.name.toLowerCase().includes(query)) continue;
          if (v.kind === 'method') {
            const params = v.parameters.map((p) => p.name).join(', ');
            items.push({
              label: v.name,
              kind: 'method',
              detail: `${obj}${sep}${v.name}(${params})`,
              insertText: `${v.name}(${params})`,
              documentation: v.description,
            });
          } else {
            items.push({
              label: v.name,
              kind: v.kind === 'variable' ? 'variable' : 'property',
              detail: `${obj}${sep}${v.name} (${v.returnType || 'any'})`,
              insertText: v.name,
              documentation: v.description,
            });
          }
        }
      }
      // C. wa namespace (wa.)
      else if (obj === 'wa') {
        // Functions
        for (const fn of BUILTIN_FUNCTIONS) {
          const sub = fn.name.replace(/^wa\./, '');
          if (!query || sub.toLowerCase().includes(query) || fn.name.toLowerCase().includes(query)) {
            const params = fn.parameters.map((p) => p.name).join(', ');
            items.push({
              label: fn.name,
              kind: 'function',
              detail: `${fn.name}(${params})`,
              insertText: `${fn.name}(${params})`,
              documentation: fn.description,
            });
          }
        }
        // Variables (wa.version, wa.cavern.ceiling_y, etc.)
        for (const vb of BUILTIN_VARIABLES) {
          const sub = vb.name.replace(/^wa\./, '');
          if (!query || sub.toLowerCase().includes(query) || vb.name.toLowerCase().includes(query)) {
            items.push({
              label: vb.name,
              kind: 'variable',
              detail: `${vb.name} (${vb.type})`,
              insertText: vb.name,
              documentation: vb.description,
            });
          }
        }
        // Enums (wa.msg...)
        for (const en of BUILTIN_ENUMERATIONS) {
          if (en.name.startsWith('wa.')) {
            for (const val of en.values) {
              const full = `${en.name}.${val.name}`;
              if (!query || full.toLowerCase().includes(query)) {
                items.push({
                  label: full,
                  kind: 'variable',
                  detail: `Enum ${val.value}`,
                  insertText: full,
                  documentation: val.description,
                });
              }
            }
          }
        }
        // Custom verbs registered ON the wa namespace (class: "wa"), so
        // `wa.my_thing` autocompletes like any engine function.
        for (const v of customVerbs) {
          if (v.class !== 'wa') continue;
          if (query && !v.name.toLowerCase().includes(query)) continue;
          items.push({
            label: v.name,
            kind: v.kind === 'method' ? 'method' : 'variable',
            detail: `wa.${v.name} (${v.returnType || 'any'})`,
            insertText: v.parameters.length > 0 ? `${v.name}(${v.parameters.map((p) => p.name).join(', ')})` : v.name,
            documentation: v.description,
          });
        }
      }
      // D. (InventoryStore is served by the registry branch above; its class members
      // are the same get/set/add/remove/clear/list/deal/transfer/apply list
      // this branch used to carry by hand.)
      // E. Other custom classes in BUILTIN_CLASSES
      else {
        const cls = BUILTIN_CLASSES.find((c) => c.name.toLowerCase() === obj.toLowerCase());
        // Custom verbs whose class matches the receiver by name. This covers
        // a brand-new class invented in the modal (MyHands does not exist in
        // BUILTIN_CLASSES, so `cls` is undefined and the old chain fell
        // through to `hit`/`fire` and offered nothing), AND verbs registered
        // on an engine class that is not behind a receiver prefix (a literal
        // `WormEntity:grapple` -- WormEntity is found by cls, the verb is not).
        const overlayVerbs = customVerbs.filter((v) => v.class.toLowerCase() === obj.toLowerCase());
        if (cls || overlayVerbs.length > 0) {
          if (cls) {
            for (const m of cls.members) {
              if (!query || m.name.toLowerCase().includes(query)) {
                if (m.kind === 'method') {
                  const params = m.parameters?.map((p) => p.name).join(', ') || '';
                  items.push({
                    label: m.name,
                    kind: 'method',
                    detail: `${obj}${sep}${m.name}(${params})`,
                    insertText: `${m.name}(${params})`,
                    documentation: m.description,
                  });
                } else {
                  items.push({
                    label: m.name,
                    kind: m.kind === 'variable' ? 'variable' : 'property',
                    detail: `${obj}${sep}${m.name} (${m.returnType || 'any'})`,
                    insertText: m.name,
                    documentation: m.description,
                  });
                }
              }
            }
          }
          const seen = new Set(cls ? cls.members.map((m) => m.name) : []);
          for (const v of overlayVerbs) {
            if (seen.has(v.name)) continue;
            if (query && !v.name.toLowerCase().includes(query)) continue;
            if (v.kind === 'method') {
              const params = v.parameters.map((p) => p.name).join(', ');
              items.push({
                label: v.name,
                kind: 'method',
                detail: `${obj}${sep}${v.name}(${params})`,
                insertText: `${v.name}(${params})`,
                documentation: v.description,
              });
            } else {
              items.push({
                label: v.name,
                kind: v.kind === 'variable' ? 'variable' : 'property',
                detail: `${obj}${sep}${v.name} (${v.returnType || 'any'})`,
                insertText: v.name,
                documentation: v.description,
              });
            }
          }
        } else if (obj === 'hit') {
          const hitProps = [
            { name: 'phase', detail: 'string: "pre" | "post"', doc: 'Damage processing phase' },
            { name: 'lost', detail: 'int: HP damage amount', doc: 'Amount of HP lost' },
            { name: 'kind', detail: 'string: "blast" | "impact" | "fall" | "drown"', doc: 'Damage message type' },
            { name: 'land', detail: 'bool: hit terrain land', doc: 'True if colliding with terrain' },
            { name: 'worm', detail: 'WormHandle | nil', doc: 'Target worm damaged' },
          ];
          for (const p of hitProps) {
            if (!query || p.name.includes(query)) {
              items.push({
                label: p.name,
                kind: 'variable',
                detail: `hit.${p.name} (${p.detail})`,
                insertText: p.name,
                documentation: p.doc,
              });
            }
          }
        } else if (obj === 'fire') {
          const fireProps = [
            { name: 'x', detail: 'int: 16.16 Fixed Point', doc: 'Muzzle X position' },
            { name: 'y', detail: 'int: 16.16 Fixed Point', doc: 'Muzzle Y position' },
            { name: 'vx', detail: 'int: 16.16 Fixed Point', doc: 'Initial velocity X' },
            { name: 'vy', detail: 'int: 16.16 Fixed Point', doc: 'Initial velocity Y' },
            { name: 'worm', detail: 'WormHandle', doc: 'Firing worm handle' },
          ];
          for (const p of fireProps) {
            if (!query || p.name.includes(query)) {
              items.push({
                label: p.name,
                kind: 'variable',
                detail: `fire.${p.name} (${p.detail})`,
                insertText: p.name,
                documentation: p.doc,
              });
            }
          }
        }
      }

      if (items.length > 0) {
        showAutocomplete(items, lineNum, colNum);
        return;
      }
    }

    // 1.4 Spec-table keys.
    //
    // `wa.weapons.launch({ missile = { fus| } })` is not a member expression and
    // not a local: `fuse` belongs to a weapon record. tableContextAt resolves the
    // brace stack to the call that owns it and hands back the keys at this level.
    //
    // Placed before the string-enum and identifier branches, and it RETURNS even
    // when nothing matched: in key position a scope name with the same spelling
    // (`fuse`, `count`, `power`) is the wrong answer.
    const tableCtx = tableContextAt(sourceToCaret);
    if (tableCtx && tableCtx.trigger) {
      const suggestions = tableCtx.valueField
        ? tableValueSuggestions(tableCtx)
        : tableKeySuggestions(tableCtx);
      const tableItems: AutocompleteItem[] = suggestions.map((s) => ({
        label: s.name,
        kind: s.nested ? 'class' : 'property',
        rank: 0,
        detail: s.detail,
        insertText: s.insertText,
        cursorBack: s.cursorBack,
        documentation: s.documentation,
      }));
      if (tableItems.length > 0) {
        showAutocomplete(tableItems, lineNum, colNum);
        return;
      }
      setAutocompleteVisible(false);
      lastAutoSignatureRef.current = null;
      return;
    }

    // 1.5 String-enum values: `obj.kind == "`, `obj.kind ~= "`, `worm.state == "`,
    // `worm:set_state("`. The member-name triggers below cannot help here -- they
    // fire on `obj.kind` and stop at the identifier, whereas the caret now sits
    // INSIDE a string, so nothing matches and the popup goes quiet.
    //
    // This must come before the general identifier branch (4) or it would be
    // swallowed by it, and before nothing else matters: the member regex is
    // $-anchored on `[a-zA-Z0-9_]*`, so a trailing `"` disables it entirely.
    //
    // The candidate set is chosen by WHICH member is being compared, because the
    // four worm-state tables are genuinely different and offering the wrong one
    // is a false promise:
    //   .kind         -> 9 kind_name() strings (a union, not a class)
    //   .state        -> 12 READABLE: what worm.state actually returns
    //   .state_label  -> 28 WORM_STATES: the DEBUG label table, log-only
    //   :set_state(   -> 6 SETTABLE: anything else is a hard engine error
    // `state_label` deliberately offers the full 28 while `state` offers 12 --
    // suggesting `walking` after `.state` would hand back nil at runtime.
    const stringMatch = lineText.match(
      /([a-zA-Z0-9_]+)([.:])([a-zA-Z0-9_]+)\s*(==|~=)\s*"([^"]*)$/
    );
    if (stringMatch) {
      const strObj = stringMatch[1];
      const strSep = stringMatch[2];
      const strMember = stringMatch[3];
      const strOp = stringMatch[4]; // '==' or '~='
      const strQuery = stringMatch[5].toLowerCase();

      // (values, label, doc) per member. Sourced from the same tables the engine
      // reads, so the popup can never suggest a state the engine rejects.
      let candidates: { value: string; description: string }[] | null = null;
      let enumLabel = '';

      if (strMember === 'kind') {
        // WorldHandle.kind -- a mine, an oil drum and a grave are all the SAME
        // class discriminated at run time, so this is the only way to tell them.
        const kindEnum = BUILTIN_ENUMERATIONS.find((e) => e.name === 'WorldHandle.kind');
        if (kindEnum) {
          candidates = kindEnum.values.map((v) => ({
            value: String(v.value),
            description: v.description || '',
          }));
          enumLabel = 'WorldHandle.kind';
        }
      } else if (strMember === 'state_label') {
        const labelEnum = BUILTIN_ENUMERATIONS.find((e) => e.name === 'WormEntity.state_label');
        if (labelEnum) {
          candidates = labelEnum.values.map((v) => ({
            value: String(v.value),
            description: v.description || '',
          }));
          enumLabel = 'worm.state_label (debug label -- log only, not for game logic)';
        }
      } else if (strMember === 'state') {
        candidates = READABLE_WORM_STATES.map((s) => ({
          value: s,
          description: 'A state worm.state can actually return.',
        }));
        enumLabel = 'worm.state (readable states)';
      } else if (strMember === 'set_state') {
        candidates = SETTABLE_WORM_STATES.map((s) => ({
          value: s.name,
          description: s.alias
            ? 'Legacy alias for tumbling -- accepted, but prefer "tumbling".'
            : `Settable state (0x${s.id.toString(16).toUpperCase()}).`,
        }));
        enumLabel = 'worm:set_state (accepted states -- anything else is a hard error)';
      }

      if (candidates) {
        const items: AutocompleteItem[] = candidates
          .filter((c) => !strQuery || c.value.toLowerCase().includes(strQuery))
          .map((c) => ({
            label: c.value,
            kind: 'property' as const,
            detail: enumLabel || `${strObj}${strSep}${strMember} ${strOp}`,
            // The caret is already inside the quotes the user typed, so the
            // replacement is the bare word -- inserting `"value"` here would
            // leave a doubled quote and break the Lua string.
            insertText: c.value,
            documentation: c.description,
          }));

        if (items.length > 0) {
          showAutocomplete(items, lineNum, colNum);
          return;
        }
      }
    }

    // Anything else inside a string is prose. The enum branch above returned if
    // it matched; if execution reaches here, stay quiet rather than suggesting
    // Lua names into a sentence.
    if (lineState.inString) {
      setAutocompleteVisible(false);
      lastAutoSignatureRef.current = null;
      return;
    }

    // 3. Arrow operator warning / helper: e.g. "wa->" or "a->"
    const arrowMatch = lineText.match(/([a-zA-Z0-9_]+)->$/);
    if (arrowMatch) {
      const obj = arrowMatch[1];
      const items: AutocompleteItem[] = [
        {
          label: `Fix: ${obj}. (function/property)`,
          kind: 'function',
          detail: `Replace '->' with '.' for standard Lua member access`,
          insertText: '.',
          documentation: `'->' is not valid in WormForge Lua. Use '.' for functions and properties (e.g. wa.log(), wa.on.hurt()).`,
        },
        {
          label: `Fix: ${obj}: (method with self)`,
          kind: 'method',
          detail: `Replace '->' with ':' for Lua object methods`,
          insertText: `:${obj === 'a' || obj === 'actor' ? 'gfx()' : ''}`,
          documentation: `'->' is not valid in WormForge Lua. Use ':' for object methods (e.g. a:gfx(), actor:move()).`,
        },
      ];
      showAutocomplete(items, lineNum, colNum);
      return;
    }

    // 4. General identifier autocomplete.
    //
    // Replaces a branch that only ever searched BUILTIN_FUNCTIONS, whose names are
    // all dotted (`wa.log`, `wa.world.size`). A bare `includes(word)` test against
    // those can never match a plain local, so typing `drum`, `obj`, `wa` or `w`
    // produced an empty list and the popup never opened -- which is what was
    // reported. The list is now built from three sources, scope-first:
    //
    //   1. names visible at the cursor, innermost scope first (buildScopes)
    //   2. engine variables (wa.*) and functions, as a fallback
    //   3. the receiver registry prefixes, so `obj` / `mine` / `crate` resolve to
    //      the handle they name even in a brand-new empty file
    //
    // The old `{2,}` minimum (3+ chars) is dropped to 2: `wa` is two characters
    // and is the single most-typed token in this engine. One character is still
    // too little -- `a` matched every name containing an `a`, which is what made
    // the popup feel like it was in the way.
    const wordMatch = lineText.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (wordMatch && wordMatch[1].length >= 2) {
      const word = wordMatch[1].toLowerCase();
      const items: AutocompleteItem[] = [];
      const seen = new Set<string>();

      const push = (label: string, item: Omit<AutocompleteItem, 'label'>) => {
        if (seen.has(label)) return;
        seen.add(label);
        items.push({ label, ...item });
      };

      // 1. Scope-visible names, ranked by how close the scope is to the cursor.
      //    This is the whole point of the A4 work: `t` declared in another
      //    function no longer competes with the `t` two lines above you.
      //    This is the whole point of the A4 work: `t` declared in another
      //    function no longer competes with the `t` two lines above you.
      const scopeModel = getScopeModel();
      const visible: VisibleName[] = scopeModel ? visibleAt(scopeModel, lineNum) : [];
      for (const v of visible) {
        if (!v.name.toLowerCase().includes(word)) continue;
        push(v.name, {
          kind: 'variable',
          rank: v.rank,
          detail: `${v.name} - ${v.scopeLabel} (line ${v.line})`,
          insertText: v.name,
          documentation: `Declared at line ${v.line} in ${v.scopeLabel} as a ${v.kind}.`,
        });
      }

      // 2. Engine variables, e.g. wa.version, wa.cavern.ceiling_y. These were
      //    unreachable before: nothing in the old branch read BUILTIN_VARIABLES.
      for (const vb of BUILTIN_VARIABLES) {
        if (!vb.name.toLowerCase().includes(word)) continue;
        push(vb.name, {
          kind: 'variable',
          rank: ENGINE_RANK,
          detail: `${vb.name} (${vb.type})`,
          insertText: vb.name,
          documentation: vb.description,
        });
      }

      // 3. Engine functions. Matched against the LAST dotted segment as well as
      //    the full name, so `world.size` finds `wa.world.size`.
      for (const fn of BUILTIN_FUNCTIONS) {
        const full = fn.name.toLowerCase();
        const tail = full.slice(full.lastIndexOf('.') + 1);
        if (!full.includes(word) && !tail.includes(word)) continue;
        push(fn.name, {
          kind: 'function',
          rank: ENGINE_RANK + 1,
          detail: fn.name,
          insertText: fn.name,
          documentation: fn.description,
        });
      }

      // 3. Receiver conventions. Last, and below everything else: these are
      //    NAMES people use for handles, not values in scope, so they only appear
      //    when nothing else matched. This is what makes `obj` / `mine` / `crate`
      //    suggest on a brand-new file with no declarations at all.
      if (items.length === 0) {
        for (const p of ALL_RECEIVER_PREFIXES) {
          if (!p.toLowerCase().includes(word)) continue;
          const row = resolveByName(p);
          push(p, {
            kind: 'variable',
            rank: ENGINE_RANK + 2,
            detail: `${p} - ${row?.className ?? 'handle'} receiver`,
            insertText: p,
            documentation: `Conventional name for a ${row?.className ?? 'WormForge'} handle. Type ":" or "." after it for members.`,
          });
        }
      }

      // Innermost scope first, engine API last. Stable within a rank.
      items.sort((a, b) => (a.rank ?? ENGINE_RANK) - (b.rank ?? ENGINE_RANK));

      if (items.length > 0) {
        // Cap the list. A big pack can put 300+ names in file scope; a popup with
        // 300 rows is unusable and re-sorts on every keystroke. The scope-ordered
        // head is the useful part -- innermost declarations always survive the cut.
        showAutocomplete(items.slice(0, 60), lineNum, colNum);
        return;
      }
    }

    setAutocompleteVisible(false);
    lastAutoSignatureRef.current = null;
  };

  const lineHeightPx = Math.round(fontSize * lineHeight);
  const isLight = theme === 'light';

  // §34 -- the syntax palette for this mode. useMemo because resolving it walks
  // the override map for all 14 tokens, and the highlight cache key below depends
  // on the result being referentially stable between renders. The signature is
  // kept separately as a STRING so the cache can key on the choice itself rather
  // than on object identity.
  const tokenPalette = useMemo<TokenClasses>(
    () => resolveTokenClasses(isLight, syntaxPreset, syntaxOverridesDark, syntaxOverridesLight),
    [isLight, syntaxPreset, syntaxOverridesDark, syntaxOverridesLight],
  );
  const themeSig = useMemo(
    () =>
      `${themeSignature(syntaxPreset, syntaxOverridesDark, syntaxOverridesLight)}::${Object.values(
        tokenPalette,
      ).join('|')}`,
    [syntaxPreset, syntaxOverridesDark, syntaxOverridesLight, tokenPalette],
  );

  // ---- Caret geometry, measured instead of guessed ------------------------
  //
  // The popup position used to be computed as
  //     top  = (lineNum - 1) * lineHeightPx + 30
  //     left = (colNum  - 1) * charWidthPx  + 60
  // which is a DOCUMENT coordinate, then applied as `position: absolute` inside
  // the editor's scroll container. Three things were missing, and together they
  // put the popup somewhere other than under the caret:
  //
  //   1. scrollTop / scrollLeft -- at line 2000 of a big pack the popup was placed
  //      2000 lines below the viewport, i.e. effectively invisible
  //   2. the textarea's own padding (p-2 pl-3) and its offset inside the editor
  //   3. charWidthPx, a hardcoded 0.58em guess. The real monospace advance width
  //      is whatever the font says, so the horizontal position drifted further the
  //      further right you typed.
  //
  // The fix measures. A hidden <span> holds the text up to the caret using the
  // EXACT same classes as the textarea, and the caret offset is read from
  // getBoundingClientRect(). That gives the true pixel position regardless of font,
  // zoom, or DPI -- no constants to tune.
  const caretRef = useRef<HTMLSpanElement>(null);

  // The popup's offsetParent. MUST be the element the popup is actually rendered
  // inside -- not `editorContainerRef`. They differ by the toolbar height and the
  // gutter width, and mixing them up offsets every position by a constant.
  const popupHostRef = useRef<HTMLDivElement>(null);

  // Text of the caret's line up to the caret, plus a marker span. Rendered inside
  // a mirror of the textarea so the browser lays it out with identical metrics.
  const caretLine = lines[cursorPos.line - 1] ?? '';
  const caretPrefix = caretLine.slice(0, Math.max(0, cursorPos.column - 1));
  const caretTail = caretLine.slice(Math.max(0, cursorPos.column - 1));

  /**
   * Caret position in the coordinate space the popup's `absolute` offsets resolve
   * against, or null before the mirror has been laid out.
   *
   * THREE BUGS lived in the previous version. The reported symptom was "the popup
   * scrolls DOWN further than I scroll", which is the signature of the first one.
   *
   * 1. SIGN. It did `m.top - h.top + ta.scrollTop`. The mirror is laid out inside a
   *    NON-scrolling container, so `m.top - h.top` is already a VIEWPORT offset and
   *    must NOT have scrollTop added. Adding it made the popup travel downward as
   *    the view travelled downward -- it accelerated away from the caret instead of
   *    tracking it. Correct is `- ta.scrollTop`.
   *
   * 2. WRONG HOST. The offsets were resolved against `editorContainerRef` (the whole
   *    editor, toolbar included) but the popup is `absolute` inside the centre stage,
   *    which sits below the toolbar and to the right of the gutter. Every position
   *    was therefore off by the toolbar height and the gutter width, which is why it
   *    looked right "strictly up top" in a fresh file and wrong everywhere else.
   *    The host must be the popup's own offsetParent.
   *
   * 3. NO VERTICAL COMPONENT FROM THE MIRROR. The mirror holds one line of text, so
   *    its top edge is the top of the LINE, not of the document. The caret's line
   *    number has to contribute `(line - 1) * lineHeightPx`; measuring alone cannot
   *    know it.
   *
   * Horizontal position comes from the mirror (true font metrics, no 0.58em guess);
   * vertical comes from line arithmetic plus scroll compensation.
   */
  const measureCaret = (): { top: number; left: number } | null => {
    const ta = textareaRef.current;
    const marker = caretRef.current;
    // The popup's offsetParent: the centre-stage div it is rendered inside.
    const host = popupHostRef.current;
    if (!ta || !marker || !host) return null;

    const m = marker.getBoundingClientRect();
    const h = host.getBoundingClientRect();

    // Horizontal: measured text width, minus horizontal scroll. paddingLeft is the
    // textarea's own `p-2 pl-3` (12px), which the mirror also carries.
    const left = m.left - h.left - ta.scrollLeft;

    // Vertical: the mirror sits at the top of the caret's own line, so add every
    // line above it, then undo the scroll.
    const top = (cursorPos.line - 1) * lineHeightPx - ta.scrollTop;

    return { top, left };
  };

  const showAutocomplete = (items: AutocompleteItem[], lineNum: number, colNum: number) => {
    if (items.length === 0) {
      setAutocompleteVisible(false);
      lastAutoSignatureRef.current = null;
      return;
    }
    setAutocompleteItems(items);

    const signature = items.map((i) => i.label).join('\u0000');
    if (signature === lastAutoSignatureRef.current) {
      // Same suggestions as the last render: keep the user's position, but
      // clamp in case the list shrank underneath the highlight.
      setSelectedAutoIdx((prev) => (prev < items.length ? prev : 0));
    } else {
      // New context (or a fresh popup after Escape/insert): start at the top.
      lastAutoSignatureRef.current = signature;
      setSelectedAutoIdx(0);
    }

    // Position under the caret, flipping above it when there is not enough room.
    // Measured, so this is correct at any font size, zoom level or DPI.
    const at = measureCaret();
    if (at) {
      const host = editorContainerRef.current;
      const hostH = host?.clientHeight ?? 0;
      const hostW = host?.clientWidth ?? 0;
      // Popup geometry must match the classes/style on the popup element, since the
      // position depends on how tall it is. `autoSize` rather than a constant so a
      // window the user has resized flips at the right moment.
      const rowH = 22;
      const chromeH = 34;
      const wantH = Math.min(items.length * rowH + chromeH, autoSize.h);
      const wantW = autoSize.w;

      let top = at.top + lineHeightPx + 0.5;
      // Flip above when the popup would hang off the bottom. Without this the list
      // is unreachable on the last few lines of the viewport.
      if (top + wantH > hostH - 8) top = Math.max(8, at.top - wantH - 0.5);

      let left = at.left;
      // Keep it on screen when the caret is near the right edge.
      if (left + wantW > hostW - 8) left = Math.max(8, hostW - wantW - 8);

      setAutocompletePos({ top, left });
    }
    setAutocompleteVisible(true);
  };

  // ---- Resizable autocomplete window -------------------------------------
  // Follows the existing manual mousemove/mouseup-on-window pattern used for the
  // app's pane resizers (see App.tsx handleStartSidebarResize). No layout library.
  const startAutoResize = (axis: 'w' | 'h', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    autoDragRef.current = {
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startW: autoSize.w,
      startH: autoSize.h,
    };

    const onMove = (ev: MouseEvent) => {
      const d = autoDragRef.current;
      if (!d) return;
      if (d.axis === 'w') {
        const w = Math.min(AUTO_MAX_W, Math.max(AUTO_MIN_W, d.startW + (ev.clientX - d.startX)));
        setAutoSize((s) => ({ ...s, w }));
      } else {
        const h = Math.min(AUTO_MAX_H, Math.max(AUTO_MIN_H, d.startH + (ev.clientY - d.startY)));
        setAutoSize((s) => ({ ...s, h }));
      }
    };
    const onUp = () => {
      autoDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Keep the highlighted item visible.
  //
  // ArrowDown past the bottom of a shortened popup used to move the selection
  // off-screen with no visual feedback, so the list appeared frozen while the
  // selection was in fact moving. Browsers only scroll an element into view on
  // focus or explicit scrollIntoView, not when a className changes, so this has
  // to be driven from the selected index.
  const autoListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = autoListRef.current;
    if (!list) return;
    const rows = list.children;
    const row = rows[selectedAutoIdx] as HTMLElement | undefined;
    if (!row) return;
    // Nearest keeps it minimal: scrolling the row fully into view on every step
    // makes the list jumpy.
    row.scrollIntoView({ block: 'nearest' });
  }, [selectedAutoIdx, autocompleteItems]);

  const insertAutocomplete = (item: AutocompleteItem) => {
    if (!textareaRef.current) return;
    const selStart = textareaRef.current.selectionStart;
    const textBefore = code.slice(0, selStart);

    // Replace only what is still being typed. The rule lives in
    // services/completion.ts, where it is tested: a fully qualified suggestion
    // must not repeat a receiver the user already wrote (`wa.world` + Tab used
    // to produce `wa.wa.world`).
    const lineBreakIdx = textBefore.lastIndexOf('\n');
    const currentLine = textBefore.slice(lineBreakIdx + 1);
    const caretInLine = selStart - (lineBreakIdx + 1);
    const plan = planInsertion(currentLine, caretInLine, item.insertText, item.cursorBack ?? 0);

    const replaceStart = lineBreakIdx + 1 + plan.start;
    const newCode = code.slice(0, replaceStart) + plan.text + code.slice(selStart);
    const nextPos = replaceStart + plan.text.length - plan.cursorBack;
    applyProgrammaticChange(newCode, nextPos);
    setAutocompleteVisible(false);
    lastAutoSignatureRef.current = null;
  };

  // Find in Code matches computation
  const findMatches = useMemo(() => {
    if (!findQuery) return [];
    const matches: { index: number; length: number; line: number; col: number }[] = [];
    const targetCode = findCaseSensitive ? code : code.toLowerCase();
    const query = findCaseSensitive ? findQuery : findQuery.toLowerCase();
    if (!query) return [];

    // Line numbers are computed by counting newlines ONCE into a prefix table,
    // then binary-searched per match.
    //
    // The old version did `code.slice(0, pos).split('\n').length` for EVERY match,
    // which is O(document x matches): on a 169 KB file with 200 matches that is
    // ~34 million characters copied and split, on every keystroke while Find is
    // open. This is the version that was reported as sluggish.
    const newlines: number[] = [0];
    for (let i = 0; i < code.length; i++) {
      if (code.charCodeAt(i) === 10) newlines.push(i + 1);
    }

    // Index of the last newline at or before `pos`, via binary search.
    const lineStarts = newlines;
    const findLine = (pos: number): number => {
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= pos) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };

    let pos = 0;
    while ((pos = targetCode.indexOf(query, pos)) !== -1) {
      const li = findLine(pos);
      matches.push({
        index: pos,
        length: query.length,
        line: li + 1,
        col: pos - lineStarts[li] + 1,
      });
      pos += query.length || 1;
    }
    return matches;
  }, [code, findQuery, findCaseSensitive]);

  const goToMatch = useCallback(
    (match: { index: number; length: number; line: number }) => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(match.index, match.index + match.length);
      const lineTop = (match.line - 1) * lineHeightPx;
      const containerHeight = textareaRef.current.clientHeight || 400;
      const targetScroll = Math.max(0, lineTop - containerHeight / 2 + lineHeightPx);
      textareaRef.current.scrollTop = targetScroll;
      if (highlightRef.current) highlightRef.current.scrollTop = targetScroll;
      if (gutterRef.current) gutterRef.current.scrollTop = targetScroll;
      // Assigning scrollTop fires NO scroll event, so the virtualised window would
      // keep rendering the old slice after a Find jump.
      noteScrollTop();
    },
    [lineHeightPx]
  );

  const navigateFind = useCallback(
    (direction: 'next' | 'prev') => {
      if (findMatches.length === 0) return;
      let nextIdx = findMatchIndex;
      if (direction === 'next') {
        nextIdx = (findMatchIndex + 1) % findMatches.length;
      } else {
        nextIdx = (findMatchIndex - 1 + findMatches.length) % findMatches.length;
      }
      setFindMatchIndex(nextIdx);
      goToMatch(findMatches[nextIdx]);
    },
    [findMatches, findMatchIndex, goToMatch]
  );

  const openFind = useCallback(() => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== end && end - start < 80) {
        const selected = code.slice(start, end);
        if (selected.trim() && !selected.includes('\n')) {
          setFindQuery(selected);
        }
      }
    }
    setFindOpen(true);
    setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 20);
  }, [code]);

  // Global F3 shortcut handler: ensures F3 NEVER invokes browser find on sidebar or DOM
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        if (!findOpen) {
          openFind();
        } else {
          navigateFind(e.shiftKey ? 'prev' : 'next');
        }
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [findOpen, openFind, navigateFind]);

  // Jump to diagnostic line / column handler.
  // lastJumpKeyRef makes this one-shot: without it, editing the code would
  // re-run this effect and yank the caret back to the diagnostic on every
  // keystroke. App bumps `key` each click so the SAME diagnostic can be
  // re-jumped by clicking it again.
  const lastJumpKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!jumpTarget || !textareaRef.current) return;
    if (lastJumpKeyRef.current === jumpTarget.key) return;
    lastJumpKeyRef.current = jumpTarget.key;

    const { line, column } = jumpTarget;
    const codeLines = code.split('\n');

    let offset = 0;
    for (let i = 0; i < Math.min(line - 1, codeLines.length); i++) {
      offset += codeLines[i].length + 1;
    }
    offset += Math.max(0, column - 1);
    offset = Math.min(offset, code.length);

    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(offset, offset);

    const lineTop = (line - 1) * lineHeightPx;
    const containerHeight = textareaRef.current.clientHeight || 400;
    const targetScroll = Math.max(0, lineTop - containerHeight / 2 + lineHeightPx);
    textareaRef.current.scrollTop = targetScroll;
    if (highlightRef.current) highlightRef.current.scrollTop = targetScroll;
    if (gutterRef.current) gutterRef.current.scrollTop = targetScroll;
    // Same reason as goToMatch: a programmatic scroll fires no scroll event, so
    // the virtualised window has to be told.
    noteScrollTop();

    setFlashingLine(line);
    const timer = setTimeout(() => setFlashingLine(null), 2000);
    return () => clearTimeout(timer);
  }, [jumpTarget, code, lineHeightPx]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocompleteVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedAutoIdx((prev) => (prev + 1) % autocompleteItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedAutoIdx((prev) => (prev - 1 + autocompleteItems.length) % autocompleteItems.length);
        return;
      }
      // Accept: Tab only.
      //
      // Enter used to accept too, which was actively harmful: the popup is open
      // constantly while typing normal Lua, item 0 is highlighted by default, and
      // Enter is the key you press to get to the next line. So every Enter deleted
      // a partial word and inserted whatever happened to be suggestion #0 --
      // "obj.worm_id == worm_id / e = ammo / return obj" plus Enter turned into a
      // declaration like `endure`. Code that was mid-edit got replaced with a
      // guess, and since Enter is how you commit a line, it happened constantly.
      //
      // Enter is now NEVER captured by the popup. Tab accepts, matching VS Code,
      // which also uses Tab rather than Enter for exactly this reason.
      if (e.key === 'Tab') {
        e.preventDefault();
        if (autocompleteItems[selectedAutoIdx]) {
          insertAutocomplete(autocompleteItems[selectedAutoIdx]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAutocompleteVisible(false);
        lastAutoSignatureRef.current = null;
        return;
      }
      // Enter deliberately falls through to the textarea, so it inserts a newline
      // and closes the popup via the next keyup rather than swallowing the key.
    }

    // F3 Find in Code
    if (e.key === 'F3') {
      e.preventDefault();
      e.stopPropagation();
      if (!findOpen) {
        openFind();
      } else {
        navigateFind(e.shiftKey ? 'prev' : 'next');
      }
      return;
    }

    // Ctrl+F / Cmd+F Find in Code
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      e.stopPropagation();
      openFind();
      return;
    }

    // Undo: Ctrl+Z / Cmd+Z (or Ctrl+Shift+Z / Cmd+Shift+Z for Redo)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
      return;
    }

    // Redo: Ctrl+Y / Cmd+Y
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();
      performRedo();
      return;
    }

    // Tab key indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const nextCode = code.substring(0, start) + '  ' + code.substring(end);
      applyProgrammaticChange(nextCode, start + 2);
    }
  };

  // Per-line diagnostic index, shared by the gutter and the highlight backdrop.
  //
  // BOTH used to call `diagnostics.find((d) => d.line === lineNum)` INSIDE a
  // per-line map -- a full scan of every diagnostic repeated once per line, i.e.
  // O(lines x diagnostics) on every render, done twice per keystroke because the
  // gutter and the backdrop each did it independently. One map, built once.
  const diagByLine = useMemo(() => {
    const m = new Map<number, SyntaxDiagnostic>();
    for (const d of diagnostics) if (!m.has(d.line)) m.set(d.line, d);
    return m;
  }, [diagnostics]);

  // ---- Virtualisation -----------------------------------------------------
  //
  // Measured on rules.lua (165 KB, 4,689 lines): rendering every line produced
  // 4,689 <div> + 4,689 <span> = ~9,378 DOM nodes that React re-diffed on every
  // keystroke. After removing the JS hot spots the profile showed NO remaining
  // single-function bottleneck -- the cost WAS the node count. That is the part a
  // JS profiler cannot attribute to a function, which is why it survived the
  // earlier rounds of optimisation.
  //
  // Only the on-screen window is rendered. A spacer above and below preserves the
  // total scroll height, so the scrollbar and the native textarea's own scrolling
  // are unaffected -- the textarea still holds the whole document and does its own
  // caret/scroll work; only the decorative backdrop behind it is windowed.
  //
  // Overscan of 20 lines means a fast flick renders a blank frame at worst, which
  // is far less noticeable than the stutter this replaces.
  // Overscan is 400 lines, not 20.
  //
  // Measured on the real file at 20, a fast mouse-wheel flick (~700 lines/sec at a
  // 20px line height is 14,000 px/sec) outran the window: at 60fps the content
  // moves ~233px, ~12 lines, per frame, and the rAF-throttled state update means
  // the window can lag a frame or two behind the actual scroll position. 20 lines
  // of overscan was not enough to cover that, and the backdrop showed blank while
  // a fast scroll was in progress.
  //
  // 400 covers roughly 8,000px of travel -- about 34 frames at that speed, which
  // is more than any plausible lag. The cost is trivial now that rendering is
  // windowed at all: ~470 lines instead of 4,689 is still ~90% fewer DOM nodes,
  // and the highlight cache means those extra lines cost one map lookup each.
  const VISIBLE_OVERSCAN = 400;
  const [scrollTop, setScrollTop] = useState(0);
  const rafScrollRef = useRef<number | null>(null);

  // rAF-throttled. A scroll gesture fires dozens of events and only the final one
  // matters; setting state per event would re-render per event, which is the exact
  // cost being removed.
  const noteScrollTop = () => {
    if (rafScrollRef.current !== null) return;
    rafScrollRef.current = requestAnimationFrame(() => {
      rafScrollRef.current = null;
      setScrollTop(textareaRef.current?.scrollTop ?? 0);
    });
  };

  useEffect(
    () => () => {
      if (rafScrollRef.current !== null) cancelAnimationFrame(rafScrollRef.current);
    },
    []
  );

  const lh = Math.max(1, lineHeightPx);
  const viewRows = Math.ceil((editorContainerRef.current?.clientHeight ?? 600) / lh) + 2;
  const firstVisible = Math.max(0, Math.floor(scrollTop / lh) - VISIBLE_OVERSCAN);
  const lastVisible = Math.min(lines.length, firstVisible + viewRows + VISIBLE_OVERSCAN * 2);
  const topSpacerPx = firstVisible * lineHeightPx;
  const bottomSpacerPx = Math.max(0, (lines.length - lastVisible) * lineHeightPx);
  const renderedLineCount = lastVisible - firstVisible;

  // Syntax Highlighting Engine
  const highlightedCode = useMemo(() => {
    const currentMatch = findMatches[findMatchIndex];
    const hasMatchByLine = new Set<number>();
    for (const m of findMatches) hasMatchByLine.add(m.line);

    // The windowed slice of lines. `diagByLine` replaces the per-line
    // `diagnostics.find` this used to do.
    const slice: { lineText: string; lineIdx: number }[] = [];
    for (let i = firstVisible; i < lastVisible; i++) slice.push({ lineText: lines[i], lineIdx: i });

    return (
      <>
        {/* Spacer preserves the scroll height of the lines above the window. */}
        <div style={{ height: `${topSpacerPx}px` }} aria-hidden="true" />
        {slice.map(({ lineText, lineIdx }) => {
          const lineNum = lineIdx + 1;
          const diag = diagByLine.get(lineNum);
          const isCurrent = cursorPos.line === lineNum;
          const isFlashing = flashingLine === lineNum;
          const hasMatch = findOpen && !!findQuery.trim() && hasMatchByLine.has(lineNum);
          const isCurrentMatchLine = findOpen && currentMatch && currentMatch.line === lineNum;

          // INFO gets NO tint and NO underline. These are the advisory findings --
          // desync advice, handle-union notices, the worm-msg-filter optimisation
          // -- which are CORRECT as written and will not break the match. The
          // console already gives `info` its own pill precisely so it stops
          // burying the warnings you need to read; tinting the source line amber
          // for one put it back on equal footing with `warning`, which is the
          // thing being warned ABOUT. Light blue dot in the gutter, nothing else.
          // `error` (rose) and `warning` (amber) keep both the tint and the
          // dotted underline: those two mean something is actually wrong.
          return (
        <div
          key={lineIdx}
          style={{ height: `${lineHeightPx}px`, lineHeight: `${lineHeightPx}px` }}
          className={`code-editor-line relative flex items-center transition-colors duration-200 ${
            isFlashing
              ? isLight
                ? 'bg-amber-300/70 ring-2 ring-amber-500 font-bold'
                : 'bg-amber-500/40 ring-2 ring-amber-400 font-bold'
              : isCurrentMatchLine
              ? isLight
                ? 'bg-amber-200/50'
                : 'bg-amber-500/20'
              : isCurrent
              ? isLight
                ? 'bg-amber-100/60'
                : 'bg-[#1b2029]/70'
              : hasMatch
              ? isLight
                ? 'bg-amber-50/70'
                : 'bg-amber-950/20'
              : ''
          } ${
            diag && (diag.severity === 'error'
              ? isLight
                ? 'bg-rose-100/50'
                : 'bg-rose-950/20'
              : diag.severity === 'warning'
              ? isLight
                ? 'bg-amber-100/40'
                : 'bg-amber-950/20'
              : '')
          }`}
        >
          {/* Underline only for severities that imply something is wrong. */}
          {diag && diag.severity !== 'info' && (
            <span
              className={`absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none ${
                diag.severity === 'error'
                  ? 'border-b-2 border-dotted border-rose-500'
                  : 'border-b-2 border-dotted border-amber-500'
              }`}
            />
          )}
          <span
            className="whitespace-pre font-mono"
            dangerouslySetInnerHTML={{
              __html: isToml
                ? highlightTomlLine(lineText, isLight, tokenPalette)
                : cachedHighlightLuaLine(lineText, isLight, themeSig, tokenPalette),
            }}
          />
        </div>
          );
        })}
        {/* Spacer preserves the scroll height of the lines below the window. */}
        <div style={{ height: `${bottomSpacerPx}px` }} aria-hidden="true" />
      </>
    );
  }, [
    lines,
    // The window is part of the output, so the slice bounds belong here. Without
    // them the memo would keep rendering the old window after a scroll.
    firstVisible,
    lastVisible,
    topSpacerPx,
    bottomSpacerPx,
    diagByLine,
    cursorPos.line,
    lineHeightPx,
    isLight,
    // §34: the palette and its signature must be in this list. Without them the
    // memo keeps returning markup built for the previous preset, because nothing
    // else in the editor's state changes when the user picks a different theme.
    tokenPalette,
    themeSig,
    isToml,
    flashingLine,
    findOpen,
    findQuery,
    findMatches,
    findMatchIndex,
  ]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    const now = Date.now();
    const hist = getHistory();
    const lastSnapshot = hist.undo[hist.undo.length - 1];
    const timeDiff = now - lastTypingTimeRef.current;
    lastTypingTimeRef.current = now;

    // New undo entry, or fold this keystroke into the one being typed? See
    // services/undoPolicy.ts -- the short version is that this used to require a pause
    // AND a word boundary, so an ordinary character satisfied neither, got folded into
    // the entry holding the text before you started typing, and destroyed it. The stack
    // never grew past one entry, so Ctrl+Z did nothing at all.
    const newEntry = startsNewUndoEntry({
      hasSnapshot: !!lastSnapshot,
      timeSinceLastEdit: timeDiff,
      atWordBoundary: isWordBoundary(newCode, e.target.selectionStart),
      lengthDelta: newCode.length - (lastSnapshot?.code.length ?? 0),
    });

    if (newEntry) {
      if (hist.undo.length >= 250) hist.undo.shift();
      hist.undo.push({
        code: newCode,
        cursorStart: e.target.selectionStart,
        cursorEnd: e.target.selectionEnd,
      });
      hist.redo = [];
    } else {
      lastSnapshot.code = newCode;
      lastSnapshot.cursorStart = e.target.selectionStart;
      lastSnapshot.cursorEnd = e.target.selectionEnd;
    }
    lastCodeRef.current = newCode;
    onChange(newCode);
    updateCursorAndAutocomplete();
  };

  return (
    <div
      ref={editorContainerRef}
      className={`relative flex-1 flex flex-col h-full overflow-hidden select-none font-mono transition-colors ${
        isLight ? 'bg-white text-slate-800' : 'bg-[#111418] text-[#e0e6ed]'
      }`}
    >
      {/* In-Editor Find Bar (F3 / Ctrl+F scoped exclusively to code) */}
      {findOpen && (
        <div
          className={`absolute top-2 right-4 z-40 flex items-center gap-1.5 p-1.5 rounded-md border shadow-2xl backdrop-blur-md text-xs font-sans transition-all animate-in fade-in slide-in-from-top-1 ${
            isLight
              ? 'bg-white/95 border-slate-300 text-slate-800 shadow-slate-400/30'
              : 'bg-[#181d26]/95 border-[#2f3948] text-[#d6e2f0] shadow-black/60'
          }`}
        >
          <Search className="w-3.5 h-3.5 text-amber-500 ml-1 shrink-0" />
          <input
            ref={findInputRef}
            type="text"
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setFindMatchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'F3') {
                e.preventDefault();
                e.stopPropagation();
                navigateFind(e.shiftKey ? 'prev' : 'next');
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setFindOpen(false);
                textareaRef.current?.focus();
              }
            }}
            placeholder="Find in code (F3)..."
            className={`px-2 py-1 rounded text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 w-44 md:w-56 transition-colors ${
              isLight
                ? 'bg-slate-50 border-slate-300 text-slate-800'
                : 'bg-[#11141a] border-[#293240] text-[#e0eaf5]'
            }`}
          />

          {/* Counter */}
          <span className="text-[11px] font-mono px-1 min-w-[50px] text-center opacity-80">
            {findQuery.trim()
              ? findMatches.length > 0
                ? `${findMatchIndex + 1}/${findMatches.length}`
                : 'No match'
              : ''}
          </span>

          {/* Case Sensitivity Toggle */}
          <button
            type="button"
            onClick={() => setFindCaseSensitive(!findCaseSensitive)}
            title="Match Case"
            className={`px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border transition-colors ${
              findCaseSensitive
                ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                : isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-200'
                : 'bg-[#202632] hover:bg-[#2b3545] text-[#718298] border-[#2b3442]'
            }`}
          >
            Aa
          </button>

          {/* Previous */}
          <button
            type="button"
            onClick={() => navigateFind('prev')}
            title="Previous Match (Shift+Enter or Shift+F3)"
            disabled={findMatches.length === 0}
            className="p-1 rounded hover:bg-slate-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={() => navigateFind('next')}
            title="Next Match (Enter or F3)"
            disabled={findMatches.length === 0}
            className="p-1 rounded hover:bg-slate-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={() => {
              setFindOpen(false);
              textareaRef.current?.focus();
            }}
            title="Close (Escape)"
            className="p-1 rounded hover:bg-rose-500/20 hover:text-rose-400 transition-colors ml-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Exclusive TOML Stock Weapons Dropdown Toolbar */}
      {isToml && (
        <div
          className={`px-3 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs font-sans transition-colors ${
            isLight
              ? 'bg-amber-50/90 border-amber-200 text-amber-950'
              : 'bg-[#181b22] border-[#293240] text-[#cde0f5]'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-semibold text-amber-500">
              <Crosshair className="w-3.5 h-3.5 text-amber-500" />
              <span>TOML Weapon Slots:</span>
            </div>

            <select
              value={selectedWeapon}
              onChange={(e) => setSelectedWeapon(e.target.value)}
              className={`py-1 px-2 rounded text-xs font-mono border focus:outline-none focus:border-amber-500 transition-colors ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-[#12151b] border-[#313b4a] text-[#e0eaf5]'
              }`}
            >
              {Array.from(new Set(STOCK_WA_WEAPON_SLOTS.map((w) => w.category))).map((cat) => (
                <optgroup key={cat} label={`-- ${cat} --`}>
                  {STOCK_WA_WEAPON_SLOTS.filter((w) => w.category === cat).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ("{w.id}")
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <button
              type="button"
              onClick={() => insertTextAtCursor(`"${selectedWeapon}"`)}
              title={`Insert "${selectedWeapon}" at cursor`}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border font-mono text-[11px] font-semibold transition-colors shadow-xs ${
                isLight
                  ? 'bg-white hover:bg-amber-100/60 border-slate-300 text-amber-900'
                  : 'bg-[#202632] hover:bg-[#2b3545] border-[#354052] text-amber-400'
              }`}
            >
              <Plus className="w-3 h-3 text-amber-500" />
              <span>"{selectedWeapon}"</span>
            </button>

            <button
              type="button"
              onClick={() => insertTextAtCursor(`replace = ["${selectedWeapon}"]\n`)}
              title={`Insert replace = ["${selectedWeapon}"]`}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border font-mono text-[11px] transition-colors shadow-xs ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-[#1b212b] hover:bg-[#262e3c] border-[#2f3948] text-[#9db0c4]'
              }`}
            >
              <span>+ replace = ["{selectedWeapon}"]</span>
            </button>

            <button
              type="button"
              onClick={() => insertTextAtCursor(`copy_from = "${selectedWeapon}"\n`)}
              title={`Insert copy_from = "${selectedWeapon}"`}
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded border font-mono text-[11px] transition-colors ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-[#1b212b] hover:bg-[#262e3c] border-[#2f3948] text-[#9db0c4]'
              }`}
            >
              <span>+ copy_from = "{selectedWeapon}"</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            {insertedNotice ? (
              <span className="text-emerald-500 flex items-center gap-1 font-mono font-semibold animate-pulse">
                <Check className="w-3 h-3" />
                {insertedNotice}
              </span>
            ) : (
              <span className={isLight ? 'text-slate-500' : 'text-[#63758b]'}>
                Instant slot insertion (prevents typos)
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          className={`w-12 py-2 flex flex-col items-end pr-2.5 font-mono select-none overflow-hidden shrink-0 border-r transition-colors ${
            isLight
              ? 'bg-slate-50 border-slate-200 text-slate-400'
              : 'bg-[#14171d] border-[#242932] text-[#516072]'
          }`}
        >
          {/* Same window as the highlight backdrop, so the two never disagree. */}
          <div className="shrink-0" style={{ height: `${topSpacerPx}px` }} aria-hidden="true" />
          {lines.slice(firstVisible, lastVisible).map((_, i) => {
            const lineNum = firstVisible + i + 1;
            const diag = diagByLine.get(lineNum);
            const isCurrent = cursorPos.line === lineNum;
            return (
              <div
                key={i}
                style={{
                  height: `${lineHeightPx}px`,
                  lineHeight: `${lineHeightPx}px`,
                  fontSize: `${fontSize - 1}px`,
                }}
                className={`code-editor-line shrink-0 flex items-center justify-end w-full gap-1 ${
                  isCurrent ? (isLight ? 'text-amber-700 font-bold' : 'text-amber-400 font-bold') : ''
                }`}
              >
                {diag && (
                  <span
                    title={diag.message}
                    // Three distinct severities, not two. `info` is sky/blue to
                    // match the console's Info pill and its sky icon; it used to
                    // be amber, the same colour as `warning`, which is exactly
                    // the confusion this fixes.
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      diag.severity === 'error'
                        ? 'bg-rose-500'
                        : diag.severity === 'warning'
                        ? 'bg-amber-500'
                        : 'bg-sky-400'
                    }`}
                  />
                )}
                <span>{lineNum}</span>
              </div>
            );
          })}
          <div className="shrink-0" style={{ height: `${bottomSpacerPx}px` }} aria-hidden="true" />
        </div>

        {/* Editor Center Stage -- this is the popup's offsetParent. `popupHostRef` MUST
          * point here, not at the outer container. */}
        <div ref={popupHostRef} className="relative flex-1 h-full overflow-hidden">
          {/* Syntax Highlight Backdrop */}
          <div
            ref={highlightRef}
            aria-hidden="true"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeightPx}px` }}
            className="absolute inset-0 p-2 pl-3 pointer-events-none overflow-hidden whitespace-pre font-mono"
          >
            {highlightedCode}
          </div>

          {/* Caret measurement mirror.
          * Layout-identical to the textarea above (same padding, font, line-height,
          * whitespace handling) so the marker's rect IS the caret's position. Only
          * the text before the caret is rendered -- its width is what matters.
          * Hidden but still laid out, hence visibility rather than display:none. */}
          <div
            aria-hidden="true"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeightPx}px` }}
            className={`absolute p-2 pl-3 whitespace-pre font-mono pointer-events-none invisible ${
              isLight ? 'text-slate-800' : 'text-[#e0e6ed]'
            }`}
          >
            {caretPrefix}
            <span ref={caretRef} className="inline-block w-0" />
            {caretTail}
          </div>

          {/* Actual Input Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => {
              // Ctrl/Cmd chords (select-all, copy, save) are not typing gestures;
              // running the trigger after them reopened the popup for no reason.
              if (e.ctrlKey || e.metaKey || e.altKey) return;
              updateCursorAndAutocomplete();
            }}
            onClick={handlePointerSelect}
            onSelect={handlePointerSelect}
            onCopy={handleCopy}
            onScroll={handleScroll}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeightPx}px` }}
            className={`absolute inset-0 p-2 pl-3 bg-transparent text-transparent outline-none resize-none overflow-auto whitespace-pre font-mono ${
              isLight
                ? 'caret-amber-600 selection:bg-amber-200 selection:text-slate-900'
                : 'caret-amber-400 selection:bg-amber-500/40 selection:text-white'
            }`}
          />

          {/* Autocomplete Popup (IntelliSense) */}
          {autocompleteVisible && autocompleteItems.length > 0 && (
            <div
              style={{
                top: `${autocompletePos.top}px`,
                left: `${autocompletePos.left}px`,
                width: `${autoSize.w}px`,
                height: `${autoSize.h}px`,
              }}
              className={`absolute z-40 flex flex-col rounded-md shadow-2xl text-xs font-sans border ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-800 shadow-xl'
                  : 'bg-[#1a1e26] border-[#333d4e] text-[#d0dbe7]'
              }`}
            >
              {/* Resize handles. Bottom-right corner resizes both axes at once;
                  the right edge is width only and the bottom edge height only, so
                  a long list can be widened without also making it taller. */}
              <div
                onMouseDown={(e) => startAutoResize('h', e)}
                title="Drag to resize height"
                className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-10"
              />
              <div
                onMouseDown={(e) => startAutoResize('w', e)}
                title="Drag to resize width"
                className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize z-10"
              />
              <div
                onMouseDown={(e) => startAutoResize('w', e)}
                title="Drag to resize"
                className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-20"
              />
              <div
                className={`px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider flex items-center justify-between ${
                  isLight ? 'bg-slate-100 text-slate-600' : 'bg-[#14171d] text-[#8ca0b8]'
                }`}
              >
                <span>Suggestions ({autocompleteItems.length})</span>
                <span className="text-[10px] text-[#556475] font-mono">Tab to accept</span>
              </div>
              {/* min-h-0 is required: this is a flex child, and without it the
                  browser refuses to shrink it below its content height, so the
                  list would spill out of the popup instead of scrolling. */}
              <div ref={autoListRef} className="flex-1 min-h-0 overflow-y-auto py-0.5">
                {autocompleteItems.map((item, idx) => (
                  <div
                    key={idx}
                    // mousedown, not click: preventDefault keeps the textarea's
                    // caret and focus intact while the item inserts, and a single
                    // press always inserts exactly once.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertAutocomplete(item);
                    }}
                    className={`px-2 py-1.5 flex items-center justify-between cursor-pointer transition-colors ${
                      selectedAutoIdx === idx
                        ? isLight
                          ? 'bg-amber-100 text-amber-900 font-medium'
                          : 'bg-amber-500/20 text-amber-200'
                        : isLight
                        ? 'hover:bg-slate-50 text-slate-700'
                        : 'text-[#d0dbe7] hover:bg-[#222731]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase font-bold ${
                          item.kind === 'custom'
                            ? 'bg-amber-500/30 text-amber-600'
                            : item.kind === 'method'
                            ? 'bg-emerald-500/30 text-emerald-600'
                            : item.kind === 'function'
                            ? 'bg-sky-500/30 text-sky-600'
                            : item.kind === 'variable'
                            ? 'bg-blue-500/30 text-blue-600'
                            : 'bg-purple-500/30 text-purple-600'
                        }`}
                      >
                        {item.kind}
                      </span>
                      <span className="font-mono text-xs truncate">{item.label}</span>
                    </div>
                    {item.detail && (
                      <span
                        className={`text-[10px] truncate max-w-[120px] font-mono ${
                          isLight ? 'text-slate-400' : 'text-[#697a8e]'
                        }`}
                      >
                        {item.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {autocompleteItems[selectedAutoIdx]?.documentation && (
                <div
                  className={`p-2 text-[11px] border-t ${
                    isLight
                      ? 'bg-slate-50 text-slate-600 border-slate-200'
                      : 'bg-[#14171e] text-[#8ea2b8] border-[#252c38]'
                  }`}
                >
                  {autocompleteItems[selectedAutoIdx].documentation}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
