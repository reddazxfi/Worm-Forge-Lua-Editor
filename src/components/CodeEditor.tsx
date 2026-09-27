import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Target, Crosshair, Plus, Check, Sliders } from 'lucide-react';
import { SyntaxDiagnostic } from '../types/wormforge';
import { BUILTIN_CLASSES, BUILTIN_ENUMERATIONS, BUILTIN_FUNCTIONS, BUILTIN_VARIABLES } from '../data/wormforgeDefinitions';

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

function highlightTomlLine(line: string, isLight: boolean = false): string {
  if (!line) return '&nbsp;';
  const trimmed = line.trim();
  // Comment (# ...)
  if (trimmed.startsWith('#')) {
    return `<span class="${isLight ? 'text-slate-500' : 'text-slate-500'} italic font-normal">${escapeHtml(line)}</span>`;
  }
  // Section header [section] or [[array_of_tables]]
  if (/^\s*\[\[?.*\]\]?\s*$/.test(line)) {
    return `<span class="${isLight ? 'text-amber-800 font-bold' : 'text-amber-400 font-bold'}">${escapeHtml(line)}</span>`;
  }
  // Key = Value
  const eqIdx = line.indexOf('=');
  if (eqIdx !== -1) {
    const key = line.slice(0, eqIdx);
    const rest = line.slice(eqIdx);
    return `<span class="${isLight ? 'text-sky-800 font-semibold' : 'text-sky-300 font-semibold'}">${escapeHtml(key)}</span>` +
           `<span class="${isLight ? 'text-slate-400' : 'text-[#64748b]'}">=</span>` +
           `<span class="${isLight ? 'text-emerald-700' : 'text-lime-300'} font-mono">${escapeHtml(rest.slice(1))}</span>`;
  }
  return escapeHtml(line);
}

interface AutocompleteItem {
  label: string;
  kind: 'method' | 'function' | 'variable' | 'property' | 'class' | 'keyword' | 'custom';
  detail?: string;
  insertText: string;
  documentation?: string;
}

interface CodeEditorProps {
  code: string;
  onChange: (newCode: string) => void;
  diagnostics: SyntaxDiagnostic[];
  onCursorChange?: (line: number, column: number) => void;
  activeFile: string;
  fontSize?: number;
  lineHeight?: number;
  theme?: 'dark' | 'light';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightLuaLine(line: string, isLight: boolean = false): string {
  if (!line) return '&nbsp;';

  let i = 0;
  let result = '';
  const len = line.length;

  while (i < len) {
    // 1. Comment (-- to end of line)
    if (line.slice(i, i + 2) === '--') {
      const commentText = line.slice(i);
      result += `<span class="${isLight ? 'text-slate-500' : 'text-slate-500'} italic font-normal">${escapeHtml(commentText)}</span>`;
      break;
    }

    // 2. String literal (double or single quote)
    const quote = line[i];
    if (quote === '"' || quote === "'") {
      let str = quote;
      let j = i + 1;
      let escaped = false;
      while (j < len) {
        const ch = line[j];
        str += ch;
        if (!escaped && ch === quote) {
          j++;
          break;
        }
        escaped = !escaped && ch === '\\';
        j++;
      }
      i = j;
      result += `<span class="${isLight ? 'text-emerald-700 font-semibold' : 'text-lime-300'} font-mono">${escapeHtml(str)}</span>`;
      continue;
    }

    // 3. Arrow operator -> (Flag as invalid in WormForge Lua)
    if (line.slice(i, i + 2) === '->') {
      result += `<span class="text-rose-500 font-bold underline decoration-wavy decoration-rose-500/70" title="'->' is not valid in Lua; use '.' (e.g. wa.log()) or ':' (e.g. a:gfx)">-&gt;</span>`;
      i += 2;
      continue;
    }

    // 4. Method call starting with colon :methodName
    if (line[i] === ':' && i + 1 < len && /[a-zA-Z_]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const meth = line.slice(i, j);
      result += `<span class="${isLight ? 'text-teal-700 font-bold' : 'text-emerald-400 font-medium'}">${escapeHtml(meth)}</span>`;
      i = j;
      continue;
    }

    // 5. Hex numbers (0x...) or Dec numbers
    if (line.slice(i, i + 2) === '0x' || line.slice(i, i + 2) === '0X') {
      let j = i + 2;
      while (j < len && /[0-9a-fA-F]/.test(line[j])) j++;
      const hex = line.slice(i, j);
      result += `<span class="${isLight ? 'text-amber-700 font-semibold' : 'text-orange-400'}">${escapeHtml(hex)}</span>`;
      i = j;
      continue;
    }
    if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_]/.test(line[i - 1]))) {
      let j = i;
      while (j < len && /[0-9.]/.test(line[j])) j++;
      const num = line.slice(i, j);
      result += `<span class="${isLight ? 'text-amber-700 font-semibold' : 'text-orange-400'}">${escapeHtml(num)}</span>`;
      i = j;
      continue;
    }

    // 6. Word / Identifier
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      i = j;

      if (/^(local|function|end|return|if|then|else|elseif|for|in|do|while|repeat|until|and|or|not|true|false|nil)$/.test(word)) {
        result += `<span class="${isLight ? 'text-purple-700 font-bold' : 'text-rose-400 font-medium'}">${escapeHtml(word)}</span>`;
      } else if (/^(int|float|string|bool|boolean|void)$/.test(word)) {
        result += `<span class="${isLight ? 'text-indigo-600 font-semibold' : 'text-purple-400 font-medium'}">${escapeHtml(word)}</span>`;
      } else if (word === 'wa' || word === 'require') {
        result += `<span class="${isLight ? 'text-blue-700 font-extrabold' : 'text-cyan-400 font-semibold'}">${escapeHtml(word)}</span>`;
      } else {
        result += escapeHtml(word);
      }
      continue;
    }

    // 7. Any other character (spaces, symbols, punctuation)
    result += escapeHtml(line[i]);
    i++;
  }

  return result;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChange,
  diagnostics,
  onCursorChange,
  activeFile,
  fontSize = 13,
  lineHeight = 1.5,
  theme = 'dark',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1, index: 0 });
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [selectedAutoIdx, setSelectedAutoIdx] = useState(0);

  const isToml = activeFile.toLowerCase().endsWith('.toml');
  const [selectedWeapon, setSelectedWeapon] = useState<string>('armageddon');
  const [insertedNotice, setInsertedNotice] = useState<string | null>(null);

  const insertTextAtCursor = (textToInsert: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart ?? code.length;
    const end = textareaRef.current.selectionEnd ?? code.length;
    const nextCode = code.slice(0, start) + textToInsert + code.slice(end);
    onChange(nextCode);
    setInsertedNotice(`Inserted "${textToInsert.trim()}"`);
    setTimeout(() => setInsertedNotice(null), 2500);

    setTimeout(() => {
      if (textareaRef.current) {
        const nextPos = start + textToInsert.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const lines = useMemo(() => code.split('\n'), [code]);

  // Reset selection and scroll cleanly whenever activeFile changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.selectionStart = 0;
      textareaRef.current.selectionEnd = 0;
      textareaRef.current.scrollTop = 0;
      textareaRef.current.scrollLeft = 0;
      textareaRef.current.focus();
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = 0;
      highlightRef.current.scrollLeft = 0;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = 0;
    }
    setCursorPos({ line: 1, column: 1, index: 0 });
    setAutocompleteVisible(false);
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

  // Sync scroll
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
  };

  // Cursor position and Autocomplete detection
  const updateCursorAndAutocomplete = () => {
    if (!textareaRef.current) return;
    const selStart = textareaRef.current.selectionStart;
    const textBefore = code.slice(0, selStart);
    const codeLines = textBefore.split('\n');
    const currentLine = codeLines.length;
    const currentCol = codeLines[codeLines.length - 1].length + 1;

    setCursorPos({ line: currentLine, column: currentCol, index: selStart });
    if (onCursorChange) {
      onCursorChange(currentLine, currentCol);
    }

    // Check for trigger prefix
    const currentLineText = codeLines[codeLines.length - 1];
    checkAutocompleteTrigger(currentLineText, currentLine, currentCol);
  };

  const checkAutocompleteTrigger = (lineText: string, lineNum: number, colNum: number) => {
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
      return;
    }

    // 1. Unified Object Member Trigger for both '.' and ':' (e.g. worm:abc, worm.abc, a:abc, a.abc)
    const memberMatch = lineText.match(/([a-zA-Z0-9_]+)([:.])([a-zA-Z0-9_]*)$/);
    if (memberMatch) {
      const obj = memberMatch[1];
      const sep = memberMatch[2]; // ':' or '.'
      const query = memberMatch[3].toLowerCase();
      const items: AutocompleteItem[] = [];

      // A. Worm Entity (worm, w, victim, target, attacker, owner, active)
      if (['worm', 'w', 'victim', 'target', 'attacker', 'owner', 'active'].includes(obj.toLowerCase())) {
        const wormCls = BUILTIN_CLASSES.find((c) => c.name === 'WormEntity')!;
        
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
      }
      // B. Actor Entity (a, actor, self, body, child, sentry, bullet, proj)
      else if (['a', 'actor', 'self', 'body', 'child', 'sentry', 'bullet', 'proj'].includes(obj.toLowerCase())) {
        const actorCls = BUILTIN_CLASSES.find((c) => c.name === 'LuaActor')!;
        
        // Add all methods
        for (const m of actorCls.members.filter((m) => m.kind === 'method')) {
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
        
        // Add all variables and properties (a.x, a:x, a.hp, etc.)
        for (const v of actorCls.members.filter((m) => m.kind !== 'method')) {
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
      }
      // D. Inventory Store (inv, store, inventory)
      else if (['inv', 'store', 'inventory'].includes(obj.toLowerCase())) {
        const invMethods = [
          { name: 'get', params: 'worm', doc: 'Reads a worm\'s inventory in this store.' },
          { name: 'set', params: 'worm, weapon, amount', doc: 'Sets a worm\'s amount for a weapon in this store.' },
          { name: 'add', params: 'worm, weapon, amount', doc: 'Adds to a worm\'s amount for a weapon in this store.' },
          { name: 'remove', params: 'worm, weapon', doc: 'Removes a weapon from a worm\'s inventory in this store.' },
          { name: 'clear', params: 'worm', doc: 'Clears a worm\'s inventory in this store.' },
          { name: 'list', params: 'worm', doc: 'Lists a worm\'s inventory contents in this store.' },
          { name: 'deal', params: 'worms', doc: 'Deterministically deals items among the given worms.' },
          { name: 'transfer', params: 'from, to, opts', doc: 'Moves or copies weapons between two explicit worms.' },
          { name: 'apply', params: 'worm, opts', doc: 'Materializes only this worm\'s inventory onto team row.' },
        ];
        for (const m of invMethods) {
          if (!query || m.name.toLowerCase().includes(query)) {
            items.push({
              label: m.name,
              kind: 'method',
              detail: `${obj}${sep}${m.name}(${m.params})`,
              insertText: `${m.name}(${m.params})`,
              documentation: m.doc,
            });
          }
        }
      }
      // E. Other custom classes in BUILTIN_CLASSES
      else {
        const cls = BUILTIN_CLASSES.find((c) => c.name.toLowerCase() === obj.toLowerCase());
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

    // 4. General identifier autocomplete (length >= 3)
    const wordMatch = lineText.match(/([a-zA-Z_][a-zA-Z0-9_]{2,})$/);
    if (wordMatch) {
      const word = wordMatch[1].toLowerCase();
      const items: AutocompleteItem[] = [];

      // Add matching functions
      for (const fn of BUILTIN_FUNCTIONS) {
        if (fn.name.toLowerCase().includes(word)) {
          items.push({
            label: fn.name,
            kind: 'function',
            detail: fn.name,
            insertText: fn.name,
            documentation: fn.description,
          });
        }
      }

      if (items.length > 0) {
        showAutocomplete(items, lineNum, colNum);
        return;
      }
    }

    setAutocompleteVisible(false);
  };

  const lineHeightPx = Math.round(fontSize * lineHeight);
  const charWidthPx = Math.max(6, Math.round(fontSize * 0.58));
  const isLight = theme === 'light';

  const showAutocomplete = (items: AutocompleteItem[], lineNum: number, colNum: number) => {
    if (items.length === 0) {
      setAutocompleteVisible(false);
      return;
    }
    setAutocompleteItems(items);
    setSelectedAutoIdx(0);

    const top = Math.min((lineNum - 1) * lineHeightPx + 30, (lines.length * lineHeightPx) - 80);
    const left = Math.min((colNum - 1) * charWidthPx + 60, window.innerWidth - 380);

    setAutocompletePos({ top: Math.max(20, top), left: Math.max(70, left) });
    setAutocompleteVisible(true);
  };

  const insertAutocomplete = (item: AutocompleteItem) => {
    if (!textareaRef.current) return;
    const selStart = textareaRef.current.selectionStart;
    const textBefore = code.slice(0, selStart);

    // Replace partial word or insert
    const lineBreakIdx = textBefore.lastIndexOf('\n');
    const currentLine = textBefore.slice(lineBreakIdx + 1);

    let replaceStart = selStart;
    // Check if replacing after -> fix
    const arrowIdx = currentLine.lastIndexOf('->');
    const colonIdx = currentLine.lastIndexOf(':');
    const dotIdx = currentLine.lastIndexOf('.');

    if (arrowIdx !== -1 && (item.insertText.startsWith('.') || item.insertText.startsWith(':'))) {
      // Replace the -> with . or :
      replaceStart = lineBreakIdx + 1 + arrowIdx;
    } else if (colonIdx !== -1 && (dotIdx === -1 || colonIdx > dotIdx)) {
      replaceStart = lineBreakIdx + 1 + colonIdx + 1;
    } else if (dotIdx !== -1 && currentLine.includes('wa.') && item.label.startsWith('wa.')) {
      const waIdx = currentLine.lastIndexOf('wa.');
      replaceStart = lineBreakIdx + 1 + waIdx;
    } else if (dotIdx !== -1) {
      replaceStart = lineBreakIdx + 1 + dotIdx + 1;
    } else {
      const wordMatch = currentLine.match(/([a-zA-Z0-9_]+)$/);
      if (wordMatch) {
        replaceStart = selStart - wordMatch[1].length;
      }
    }

    const newCode = code.slice(0, replaceStart) + item.insertText + code.slice(selStart);
    onChange(newCode);
    setAutocompleteVisible(false);

    // Focus back and place cursor
    setTimeout(() => {
      if (textareaRef.current) {
        const nextPos = replaceStart + item.insertText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

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
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        if (autocompleteItems[selectedAutoIdx]) {
          insertAutocomplete(autocompleteItems[selectedAutoIdx]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAutocompleteVisible(false);
        return;
      }
    }

    // Tab key indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const nextCode = code.substring(0, start) + '  ' + code.substring(end);
      onChange(nextCode);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  // Syntax Highlighting Engine
  const highlightedCode = useMemo(() => {
    return lines.map((lineText, lineIdx) => {
      const lineNum = lineIdx + 1;
      const diag = diagnostics.find((d) => d.line === lineNum);

      return (
        <div
          key={lineIdx}
          style={{ height: `${lineHeightPx}px`, lineHeight: `${lineHeightPx}px` }}
          className={`code-editor-line relative flex items-center ${
            cursorPos.line === lineNum
              ? isLight
                ? 'bg-amber-100/60'
                : 'bg-[#1b2029]/70'
              : ''
          } ${
            diag
              ? diag.severity === 'error'
                ? isLight
                  ? 'bg-rose-100/50'
                  : 'bg-rose-950/20'
                : isLight
                ? 'bg-amber-100/40'
                : 'bg-amber-950/20'
              : ''
          }`}
        >
          {diag && (
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
              __html: isToml ? highlightTomlLine(lineText, isLight) : highlightLuaLine(lineText, isLight),
            }}
          />
        </div>
      );
    });
  }, [lines, diagnostics, cursorPos.line, lineHeightPx, isLight, isToml]);

  return (
    <div
      className={`relative flex-1 flex flex-col h-full overflow-hidden select-none font-mono transition-colors ${
        isLight ? 'bg-white text-slate-800' : 'bg-[#111418] text-[#e0e6ed]'
      }`}
    >
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
          {lines.map((_, i) => {
            const lineNum = i + 1;
            const diag = diagnostics.find((d) => d.line === lineNum);
            const isCurrent = cursorPos.line === lineNum;
            return (
              <div
                key={i}
                style={{
                  height: `${lineHeightPx}px`,
                  lineHeight: `${lineHeightPx}px`,
                  fontSize: `${fontSize - 1}px`,
                }}
                className={`code-editor-line flex items-center justify-end w-full gap-1 ${
                  isCurrent ? (isLight ? 'text-amber-700 font-bold' : 'text-amber-400 font-bold') : ''
                }`}
              >
                {diag && (
                  <span
                    title={diag.message}
                    className={`w-1.5 h-1.5 rounded-full ${
                      diag.severity === 'error' ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
                  />
                )}
                <span>{lineNum}</span>
              </div>
            );
          })}
        </div>

        {/* Editor Center Stage */}
        <div className="relative flex-1 h-full overflow-hidden">
          {/* Syntax Highlight Backdrop */}
          <div
            ref={highlightRef}
            aria-hidden="true"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeightPx}px` }}
            className="absolute inset-0 p-2 pl-3 pointer-events-none overflow-hidden whitespace-pre font-mono"
          >
            {highlightedCode}
          </div>

          {/* Actual Input Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={updateCursorAndAutocomplete}
            onClick={updateCursorAndAutocomplete}
            onSelect={updateCursorAndAutocomplete}
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
              }}
              className={`absolute z-40 rounded-md shadow-2xl w-80 max-h-64 overflow-y-auto text-xs font-sans divide-y border ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-800 divide-slate-100 shadow-xl'
                  : 'bg-[#1a1e26] border-[#333d4e] text-[#d0dbe7] divide-[#242b36]'
              }`}
            >
              <div
                className={`px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider flex items-center justify-between ${
                  isLight ? 'bg-slate-100 text-slate-600' : 'bg-[#14171d] text-[#8ca0b8]'
                }`}
              >
                <span>Suggestions ({autocompleteItems.length})</span>
                <span className="text-[10px] text-[#556475] font-mono">Tab/Enter to insert</span>
              </div>
              <div className="py-0.5">
                {autocompleteItems.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => insertAutocomplete(item)}
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
};
