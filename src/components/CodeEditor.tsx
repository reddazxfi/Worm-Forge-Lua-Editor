import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CollabUser, SyntaxDiagnostic } from '../types/wormforge';
import { BUILTIN_CLASSES, BUILTIN_ENUMERATIONS, BUILTIN_FUNCTIONS } from '../data/wormforgeDefinitions';

interface AutocompleteItem {
  label: string;
  kind: 'method' | 'function' | 'variable' | 'class' | 'keyword' | 'custom';
  detail?: string;
  insertText: string;
  documentation?: string;
}

interface CodeEditorProps {
  code: string;
  onChange: (newCode: string) => void;
  diagnostics: SyntaxDiagnostic[];
  onCursorChange?: (line: number, column: number) => void;
  remoteUsers: CollabUser[];
  activeFile: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightLuaLine(line: string): string {
  if (!line) return '&nbsp;';

  let i = 0;
  let result = '';
  const len = line.length;

  while (i < len) {
    // 1. Comment (-- to end of line)
    if (line.slice(i, i + 2) === '--') {
      const commentText = line.slice(i);
      result += `<span class="text-slate-500 italic font-normal">${escapeHtml(commentText)}</span>`;
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
      result += `<span class="text-lime-300 font-mono">${escapeHtml(str)}</span>`;
      continue;
    }

    // 3. Arrow operator -> (Flag as invalid in WormForge Lua)
    if (line.slice(i, i + 2) === '->') {
      result += `<span class="text-rose-400 font-bold underline decoration-wavy decoration-rose-500/70" title="'->' is not valid in Lua; use '.' (e.g. wa.log()) or ':' (e.g. a:gfx)">-&gt;</span>`;
      i += 2;
      continue;
    }

    // 4. Method call starting with colon :methodName
    if (line[i] === ':' && i + 1 < len && /[a-zA-Z_]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const meth = line.slice(i, j);
      result += `<span class="text-emerald-400 font-medium">${escapeHtml(meth)}</span>`;
      i = j;
      continue;
    }

    // 5. Hex numbers (0x...) or Dec numbers
    if (line.slice(i, i + 2) === '0x' || line.slice(i, i + 2) === '0X') {
      let j = i + 2;
      while (j < len && /[0-9a-fA-F]/.test(line[j])) j++;
      const hex = line.slice(i, j);
      result += `<span class="text-orange-400">${escapeHtml(hex)}</span>`;
      i = j;
      continue;
    }
    if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_]/.test(line[i - 1]))) {
      let j = i;
      while (j < len && /[0-9.]/.test(line[j])) j++;
      const num = line.slice(i, j);
      result += `<span class="text-orange-400">${escapeHtml(num)}</span>`;
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
        result += `<span class="text-rose-400 font-medium">${escapeHtml(word)}</span>`;
      } else if (/^(int|float|string|bool|boolean|void)$/.test(word)) {
        result += `<span class="text-purple-400 font-medium">${escapeHtml(word)}</span>`;
      } else if (word === 'wa' || word === 'require') {
        result += `<span class="text-cyan-400 font-semibold">${escapeHtml(word)}</span>`;
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
  remoteUsers,
  activeFile,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1, index: 0 });
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [selectedAutoIdx, setSelectedAutoIdx] = useState(0);

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
    // 1. Colon method trigger: e.g. "a:", "actor:", "worm:"
    const colonMatch = lineText.match(/([a-zA-Z0-9_]+):([a-zA-Z0-9_]*)$/);
    if (colonMatch) {
      const obj = colonMatch[1];
      const query = colonMatch[2].toLowerCase();
      const items: AutocompleteItem[] = [];

      if (obj === 'a' || obj === 'actor') {
        const actorCls = BUILTIN_CLASSES.find((c) => c.name === 'LuaActor')!;
        for (const m of actorCls.members.filter((m) => m.kind === 'method')) {
          if (!query || m.name.toLowerCase().includes(query)) {
            const params = m.parameters?.map((p) => p.name).join(', ') || '';
            items.push({
              label: m.name,
              kind: 'method',
              detail: `${obj}:${m.name}(${params})`,
              insertText: `${m.name}(${params})`,
              documentation: m.description,
            });
          }
        }
      } else if (obj === 'worm') {
        const wormCls = BUILTIN_CLASSES.find((c) => c.name === 'WormEntity')!;
        for (const m of wormCls.members.filter((m) => m.kind === 'method')) {
          if (!query || m.name.toLowerCase().includes(query)) {
            const params = m.parameters?.map((p) => p.name).join(', ') || '';
            items.push({
              label: m.name,
              kind: 'method',
              detail: `worm:${m.name}(${params})`,
              insertText: `${m.name}(${params})`,
              documentation: m.description,
            });
          }
        }
      } else {
        // Any other class method calls
        const cls = BUILTIN_CLASSES.find((c) => c.name.toLowerCase() === obj.toLowerCase());
        if (cls) {
          for (const m of cls.members.filter((m) => m.kind === 'method')) {
            if (!query || m.name.toLowerCase().includes(query)) {
              const params = m.parameters?.map((p) => p.name).join(', ') || '';
              items.push({
                label: m.name,
                kind: 'method',
                detail: `${obj}:${m.name}(${params})`,
                insertText: `${m.name}(${params})`,
                documentation: m.description,
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

    // 2. Dot member / function / namespace trigger: e.g. "wa.", "hit.", "fire."
    const dotMatch = lineText.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_.]*)$/);
    if (dotMatch) {
      const obj = dotMatch[1];
      const query = dotMatch[2].toLowerCase();
      const items: AutocompleteItem[] = [];

      if (obj === 'wa') {
        // All wa functions
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

        // All wa enums
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

  const showAutocomplete = (items: AutocompleteItem[], lineNum: number, colNum: number) => {
    if (items.length === 0) {
      setAutocompleteVisible(false);
      return;
    }
    setAutocompleteItems(items);
    setSelectedAutoIdx(0);

    const lineHeight = 24.8; // px line height
    const charWidth = 7.7; // average mono char width
    const top = Math.min((lineNum - 1) * lineHeight + 30, (lines.length * lineHeight) - 80);
    const left = Math.min((colNum - 1) * charWidth + 60, window.innerWidth - 380);

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

    if (arrowIdx !== -1 && item.insertText.startsWith('.') || item.insertText.startsWith(':')) {
      // Replace the -> with . or :
      replaceStart = lineBreakIdx + 1 + arrowIdx;
    } else if (colonIdx !== -1) {
      replaceStart = lineBreakIdx + 1 + colonIdx + 1;
    } else if (dotIdx !== -1 && currentLine.includes('wa.')) {
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
          className={`code-editor-line relative flex items-center ${
            cursorPos.line === lineNum ? 'bg-[#1b2029]/70' : ''
          } ${diag ? (diag.severity === 'error' ? 'bg-rose-950/20' : 'bg-amber-950/20') : ''}`}
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
              __html: highlightLuaLine(lineText),
            }}
          />
        </div>
      );
    });
  }, [lines, diagnostics, cursorPos.line]);

  return (
    <div className="relative flex-1 flex flex-col h-full bg-[#111418] text-[#e0e6ed] overflow-hidden select-none font-mono">
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          className="w-12 bg-[#14171d] border-r border-[#242932] py-2 flex flex-col items-end pr-2.5 text-[#516072] text-xs font-mono select-none overflow-hidden shrink-0"
        >
          {lines.map((_, i) => {
            const lineNum = i + 1;
            const diag = diagnostics.find((d) => d.line === lineNum);
            const isCurrent = cursorPos.line === lineNum;
            return (
              <div
                key={i}
                className={`code-editor-line flex items-center justify-end w-full gap-1 ${
                  isCurrent ? 'text-amber-400 font-bold' : ''
                }`}
              >
                {diag && (
                  <span
                    title={diag.message}
                    className={`w-1.5 h-1.5 rounded-full ${
                      diag.severity === 'error' ? 'bg-rose-400' : 'bg-amber-400'
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
            className="absolute inset-0 p-2 pl-3 pointer-events-none overflow-hidden whitespace-pre text-xs font-mono leading-[1.55rem]"
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
            className="absolute inset-0 p-2 pl-3 bg-transparent text-transparent caret-amber-400 outline-none resize-none overflow-auto whitespace-pre text-xs font-mono leading-[1.55rem] selection:bg-amber-500/40 selection:text-white"
          />

          {/* Remote Collaborator Cursors */}
          {remoteUsers
            .filter((u) => u.cursor && u.activeFile === activeFile)
            .map((user) => {
              if (!user.cursor) return null;
              const lineHeight = 24.8;
              const charWidth = 7.7;
              const top = (user.cursor.line - 1) * lineHeight + 8;
              const left = (user.cursor.column - 1) * charWidth + 12;

              return (
                <div
                  key={user.id}
                  style={{ top: `${top}px`, left: `${left}px` }}
                  className="absolute pointer-events-none z-20 transition-all duration-100 flex flex-col items-start"
                >
                  {/* Caret */}
                  <div
                    style={{ backgroundColor: user.color }}
                    className="w-[2px] h-[18px] animate-pulse shadow-sm"
                  />
                  {/* Label */}
                  <div
                    style={{ backgroundColor: user.color }}
                    className="px-1.5 py-0.2 rounded text-[10px] text-slate-950 font-bold tracking-tight shadow-md whitespace-nowrap -mt-5 -ml-1 opacity-90"
                  >
                    {user.name} ({user.cursor.line}:{user.cursor.column})
                  </div>
                </div>
              );
            })}

          {/* Autocomplete Popup (IntelliSense) */}
          {autocompleteVisible && autocompleteItems.length > 0 && (
            <div
              style={{
                top: `${autocompletePos.top}px`,
                left: `${autocompletePos.left}px`,
              }}
              className="absolute z-40 bg-[#1a1e26] border border-[#333d4e] rounded-md shadow-2xl w-80 max-h-64 overflow-y-auto text-xs font-sans divide-y divide-[#242b36]"
            >
              <div className="px-2 py-1 bg-[#14171d] text-[10.5px] font-semibold text-[#8ca0b8] uppercase tracking-wider flex items-center justify-between">
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
                        ? 'bg-amber-500/20 text-amber-200'
                        : 'text-[#d0dbe7] hover:bg-[#222731]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase font-bold ${
                          item.kind === 'custom'
                            ? 'bg-amber-500/30 text-amber-300'
                            : item.kind === 'method'
                            ? 'bg-emerald-500/30 text-emerald-300'
                            : item.kind === 'function'
                            ? 'bg-sky-500/30 text-sky-300'
                            : 'bg-purple-500/30 text-purple-300'
                        }`}
                      >
                        {item.kind}
                      </span>
                      <span className="font-mono text-xs truncate">{item.label}</span>
                    </div>
                    {item.detail && (
                      <span className="text-[10px] text-[#697a8e] truncate max-w-[120px] font-mono">
                        {item.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {autocompleteItems[selectedAutoIdx]?.documentation && (
                <div className="p-2 bg-[#14171e] text-[11px] text-[#8ea2b8] border-t border-[#252c38]">
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
