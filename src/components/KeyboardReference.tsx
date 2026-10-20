// The keyboard reference.
//
// RENAMED, AND DELIBERATELY SO. This was "Keycode Reference & Tester" and it was
// lying. It showed Windows Virtual-Key codes (VK_LEFT 0x25, VK_SPACE 0x20) as if a
// pack could use them. WormForge has never mapped the keyboard to virtuals for
// Lua: `wa.world.keys()` returns nine plain values and a pack never sees a code.
// The old table also listed F1-F10, Enter, Backspace and Tab as if they were
// readable, and none of them are -- `poll_keys()` never polls those keys at all.
//
// So: no codes, no tester that "inspects" a virtual key. Just the nine real
// fields, which physical keys set them, and a live panel that lights up the rows
// you are actually pressing.
import React, { useState, useEffect } from 'react';
import { X, Keyboard, Copy, Check, CircleHelp } from 'lucide-react';
import {
  WORM_KEYS,
  KEYS_NOT_AVAILABLE,
  fieldForEventCode,
  digitForEventCode,
  prettyKeyName,
} from '../data/wormKeys';

interface KeyboardReferenceProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCode: (snippet: string) => void;
}

/** What the last press set. `field` is null for a key WormForge does not read. */
interface Pressed {
  /** The physical key, as the OS names it ("KeyQ"). Shown only for the label. */
  eventCode: string;
  field: string | null;
  /** For `digit`, the number it would read as. */
  digit: number | null;
  /** True when the press was NOT one of the keys the engine polls. */
  unmapped: boolean;
}

export const KeyboardReference: React.FC<KeyboardReferenceProps> = ({
  isOpen,
  onClose,
  onInsertCode,
}) => {
  const [pressed, setPressed] = useState<Pressed | null>(null);
  const [copied, setCopied] = useState(false);
  // Which rows to highlight. Held rather than a single key so that pressing two
  // keys at once (Space + Shift, say) lights both, which is the normal way to
  // play and would otherwise look broken.
  const [held, setHeld] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setPressed(null);
      setHeld({});
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // The dialog is not a game: swallow the key so Space does not scroll and
      // Ctrl+S does not save. Previously this called preventDefault() on every
      // key including Escape's siblings, which broke Escape on some layouts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();

      const field = fieldForEventCode(e.code);
      const digit = digitForEventCode(e.code);
      setPressed({ eventCode: e.code, field, digit, unmapped: field === null });
      if (field) setHeld((prev) => ({ ...prev, [field]: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const field = fieldForEventCode(e.code);
      if (field) setHeld((prev) => ({ ...prev, [field]: false }));
    };

    // A key held while the dialog is closed never gets a keyup, so it would stay
    // stuck lit forever. Clearing on blur is the fix; without it the panel lies.
    const handleBlur = () => setHeld({});

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const insertSnippet = () => {
    const field = pressed?.field;
    if (!field) return;
    // Only ever insert something the engine really returns. `digit` is a value,
    // so the snippet compares against a number rather than testing truthiness --
    // which is the exact mistake its own note warns about.
    const snippet =
      field === 'digit'
        ? `-- Which number key is held (nil when none)\nlocal n = wa.world.keys().digit\nprint(n)\n`
        : `-- Is "${field}" held right now?\nlocal held = wa.world.keys().${field}\nif held then\n  -- ...\nend\n`;
    onInsertCode(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };


  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#171b21] border border-[#2e3744] rounded-lg max-w-2xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="p-3 bg-[#1d222b] border-b border-[#2b3340] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-sm text-[#e4edf7]">
              Keyboard Reference
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#8192a6] hover:text-[#e4edf7] hover:bg-[#2b3340]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live panel -- the only interactive part. It answers "what does pressing
            this do", which is the question this dialog should have been asking. */}
        <div className="px-3 py-2.5 bg-[#1a1f28] border-b border-[#2b3340] flex sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[#8899ac] font-medium text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  pressed && !pressed.unmapped ? 'bg-emerald-400' : 'bg-[#3d4854]'
                }`}
              />
              <span>Press a key to see what it does</span>
            </div>
            {pressed ? (
              pressed.unmapped ? (
                <div className="font-mono text-[11.5px] mt-1 text-amber-300">
                  <b>{prettyKeyName(pressed.eventCode)}</b> is not one of the keys
                  WormForge reads. Nothing in wa.world.keys() will change.
                </div>
              ) : (
                <div className="flex items-center gap-2 font-mono mt-1 text-sm flex-wrap">
                  <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                    {prettyKeyName(pressed.eventCode)}
                  </span>
                  <span className="text-[#a4b5c7]">
                    sets{' '}
                    <b className="text-emerald-300">
                      k.{pressed.field} = {pressed.digit ?? 'true'}
                    </b>
                  </span>
                </div>
              )
            ) : (
              <div className="text-[#566577] italic font-mono text-[11px] mt-1">
                Try Space, W, Shift, Q, the arrow keys, or a number.
              </div>
            )}
          </div>

          {pressed && !pressed.unmapped && (
            <button
              onClick={insertSnippet}
              className="px-3 py-1.5 bg-[#262e3b] hover:bg-[#323d4e] text-amber-300 rounded border border-amber-500/30 flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>Insert Snippet</span>
            </button>
          )}
        </div>


        {/* Reference table -- press a key and its row lights up. */}
        <div className="flex-1 overflow-y-auto p-3">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-[#2a323e] text-[#6f8095] text-[10.5px] uppercase font-sans">
                <th className="pb-2">keys() field</th>
                <th className="pb-2">What it does</th>
                <th className="pb-2">Press</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e242d] text-[#cfd9e5]">
              {WORM_KEYS.map((k) => {
                // An alias row (sprint, pre-0.9.1) shares its bit with the
                // current name, so pressing Shift lights both rows. One bit,
                // two spellings: showing only one would misrepresent the table.
                const on = !!held[k.field] || (k.aliasOf ? !!held[k.aliasOf] : false);
                return (
                  <tr
                    key={k.field}
                    className={`transition-colors ${
                      on ? 'bg-emerald-500/15' : 'hover:bg-[#1f242d]'
                    }`}
                  >
                    <td className="py-1.5 font-medium">
                      <span className="text-emerald-300">{k.field}</span>
                      {on && (
                        <span className="ml-2 text-[10px] text-emerald-400 font-sans">
                          held
                        </span>
                      )}
                      <span className="ml-2 text-[10px] text-[#5d6b7c] font-sans">
                        {k.numeric ? '0-9 or nil' : 'true / false'}
                      </span>
                    </td>
                    <td className="py-1.5 font-sans text-[11px] text-[#a8b8c9]">
                      {k.action}
                      {k.note && (
                        <span className="block text-[10px] text-[#6f8095] mt-0.5 max-w-[260px]">
                          {k.note}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <span className="flex flex-wrap gap-1">
                        {k.keys.map((key) => (
                          <kbd
                            key={key}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${
                              on
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                : 'bg-[#1f242d] border-[#2e3745] text-[#8fa0b3]'
                            }`}
                          >
                            {key}
                          </kbd>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* What is NOT there. Stating the gaps is the point: the old table listed
              F1-F10 and Enter as if they were readable, and they are not. */}
          <div className="mt-4 rounded-lg border border-[#2a323e] bg-[#151a21] p-3">
            <div className="flex items-center gap-1.5 text-[#8fa0b3] font-sans text-[11px] font-semibold mb-2">
              <CircleHelp className="w-3.5 h-3.5 text-amber-500" />
              <span>Not available through keys()</span>
            </div>
            <div className="space-y-1">
              {KEYS_NOT_AVAILABLE.map((row) => (
                <div key={row.keys} className="flex flex-col sm:flex-row gap-1 sm:gap-3">
                  <span className="font-mono text-[11px] text-[#c9a227] w-32 shrink-0">
                    {row.keys}
                  </span>
                  <span className="font-sans text-[11px] text-[#7c8e9f]">
                    {row.actually}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 font-sans text-[10.5px] leading-relaxed text-[#6f8095]">
            These are the only nine values{' '}
            <span className="font-mono">wa.world.keys()</span> returns. There are no
            keycodes: WormForge has not mapped the keyboard to virtual keys for Lua, so a
            pack cannot read a raw key value. Every field above is sampled once per frame
            and locked for that frame, so two reads in the same frame always agree.
          </p>
        </div>

        {/* Footer */}
        <div className="p-2.5 bg-[#171b21] border-t border-[#252b35] flex items-center justify-between text-[#687789] text-[11px]">
          <span className="font-sans">
            Example:{' '}
            <span className="font-mono text-amber-500">local k = wa.world.keys()</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1 rounded bg-[#252c38] hover:bg-[#313a4a] text-[#cfd9e5] font-sans font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
