import React, { useState, useEffect } from 'react';
import { X, Keyboard, Copy, Check, Hash } from 'lucide-react';

interface KeycodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCode: (snippet: string) => void;
}

const COMMON_KEYS = [
  { name: 'Space (Shoot / Power Bar)', hex: '0x20', dec: 32, wfBit: 'bit 128 (0x80)', note: 'Space down = charge, up = shoot' },
  { name: 'Enter (Jump Forward)', hex: '0x0D', dec: 13, wfBit: 'wa.msg.JUMP (0x24)', note: 'Stock forward jump' },
  { name: 'Backspace (Backflip / Jump Up)', hex: '0x08', dec: 8, wfBit: 'wa.msg.JUMP_UP (0x25)', note: 'Stock vertical backflip jump' },
  { name: 'Left Arrow / A', hex: '0x25 / 0x41', dec: 37, wfBit: 'bit 1 (0x01)', note: 'Turn or move left' },
  { name: 'Right Arrow / D', hex: '0x27 / 0x44', dec: 39, wfBit: 'bit 2 (0x02)', note: 'Turn or move right' },
  { name: 'Up Arrow', hex: '0x26', dec: 38, wfBit: 'bit 4 (0x04)', note: 'Aim up' },
  { name: 'Down Arrow / S', hex: '0x28 / 0x53', dec: 40, wfBit: 'bit 8 (0x08)', note: 'Aim down' },
  { name: 'W (POOZ Jump / Climb)', hex: '0x57', dec: 87, wfBit: 'bit 16 (0x10)', note: 'wa.world.keys().jump' },
  { name: 'Shift (Sprint)', hex: '0x10', dec: 16, wfBit: 'bit 32 (0x20)', note: 'wa.world.keys().sprint' },
  { name: 'Q (Custom Equip / Hotkey)', hex: '0x51', dec: 81, wfBit: 'bit 64 (0x40)', note: 'wa.world.keys().q' },
  { name: 'Tab (Select Worm / Next)', hex: '0x09', dec: 9, wfBit: '-', note: 'Cycle active worm' },
  { name: 'F1 (Bazooka Slot Row)', hex: '0x70', dec: 112, wfBit: '-', note: 'F1 weapon cluster' },
  { name: 'F2 (Grenade Slot Row)', hex: '0x71', dec: 113, wfBit: '-', note: 'F2 weapon cluster' },
  { name: 'F3 (Shotgun Slot Row)', hex: '0x72', dec: 114, wfBit: '-', note: 'F3 weapon cluster' },
  { name: 'F4 (Punch / Axe Slot Row)', hex: '0x73', dec: 115, wfBit: '-', note: 'F4 weapon cluster' },
  { name: 'F5 (Dynamite / Mine)', hex: '0x74', dec: 116, wfBit: '-', note: 'F5 placed weapons' },
  { name: 'F6 (Air Strike Row)', hex: '0x75', dec: 117, wfBit: '-', note: 'F6 aerial strikes' },
  { name: 'F7 (Blowtorch / Drill)', hex: '0x76', dec: 118, wfBit: '-', note: 'F7 construction/tools' },
  { name: 'F8 (Girder / Bridge)', hex: '0x77', dec: 119, wfBit: '-', note: 'F8 utilities' },
  { name: 'F9 (Ninja Rope / Bungee)', hex: '0x78', dec: 120, wfBit: '-', note: 'F9 mobility tools' },
  { name: 'F10 (Teleport / Super)', hex: '0x79', dec: 121, wfBit: '-', note: 'F10 specials' },
];

export const KeycodeModal: React.FC<KeycodeModalProps> = ({ isOpen, onClose, onInsertCode }) => {
  const [pressedKey, setPressedKey] = useState<{
    key: string;
    code: string;
    keyCode: number;
    hex: string;
    wfBit: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture Escape if closing
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      e.preventDefault();

      let wfBit = '-';
      if (e.keyCode === 37 || e.keyCode === 65) wfBit = 'k.left (bit 1 / 0x01)';
      else if (e.keyCode === 39 || e.keyCode === 68) wfBit = 'k.right (bit 2 / 0x02)';
      else if (e.keyCode === 38) wfBit = 'k.up (bit 4 / 0x04)';
      else if (e.keyCode === 40 || e.keyCode === 83) wfBit = 'k.down (bit 8 / 0x08)';
      else if (e.keyCode === 87) wfBit = 'k.jump (bit 16 / 0x10)';
      else if (e.keyCode === 16) wfBit = 'k.sprint (bit 32 / 0x20)';
      else if (e.keyCode === 81) wfBit = 'k.q (bit 64 / 0x40)';
      else if (e.keyCode === 32) wfBit = 'k.space (bit 128 / 0x80)';

      setPressedKey({
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        hex: `0x${e.keyCode.toString(16).toUpperCase().padStart(2, '0')}`,
        wfBit,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const insertSnippet = () => {
    if (!pressedKey) return;
    const snippet = `-- Check key ${pressedKey.key} (${pressedKey.hex})\nlocal k = wa.world.keys()\n`;
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
            <span className="font-semibold text-sm text-[#e4edf7]">WormForge Keycode Reference &amp; Tester</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#8192a6] hover:text-[#e4edf7] hover:bg-[#2b3340]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Key Tester Bar */}
        <div className="p-4 bg-[#12151a] border-b border-[#242b36] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[#8899ac] font-medium text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Live Key Tester: Press any key to inspect Virtual-Key code</span>
            </div>
            {pressedKey ? (
              <div className="flex items-center gap-3 font-mono mt-1 text-sm">
                <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  {pressedKey.key === ' ' ? 'Space' : pressedKey.key}
                </span>
                <span className="text-[#a4b5c7]">Hex: <b className="text-purple-300">{pressedKey.hex}</b></span>
                <span className="text-[#a4b5c7]">Dec: <b className="text-sky-300">{pressedKey.keyCode}</b></span>
                <span className="text-[#a4b5c7]">WormForge: <b className="text-emerald-300">{pressedKey.wfBit}</b></span>
              </div>
            ) : (
              <div className="text-[#566577] italic font-mono text-[11px] mt-1">
                Waiting for keypress... (e.g. tap Space, Q, Enter, Shift, Arrows)
              </div>
            )}
          </div>

          {pressedKey && (
            <button
              onClick={insertSnippet}
              className="px-3 py-1.5 bg-[#262e3b] hover:bg-[#323d4e] text-amber-300 rounded border border-amber-500/30 flex items-center gap-1.5 text-xs font-medium"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Insert Code</span>
            </button>
          )}
        </div>

        {/* Reference Table */}
        <div className="flex-1 overflow-y-auto p-3">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-[#2a323e] text-[#6f8095] text-[10.5px] uppercase font-sans">
                <th className="pb-2">Action / Key</th>
                <th className="pb-2">Hex</th>
                <th className="pb-2">Dec</th>
                <th className="pb-2">WormForge Bitmask</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e242d] text-[#cfd9e5]">
              {COMMON_KEYS.map((k, i) => (
                <tr key={i} className="hover:bg-[#1f242d] transition-colors">
                  <td className="py-1.5 font-medium text-[#e0ebf7]">{k.name}</td>
                  <td className="py-1.5 text-purple-300">{k.hex}</td>
                  <td className="py-1.5 text-sky-300">{k.dec}</td>
                  <td className="py-1.5 text-emerald-300">{k.wfBit}</td>
                  <td className="py-1.5 text-[#7c8e9f] font-sans text-[11px]">{k.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-2.5 bg-[#171b21] border-t border-[#252b35] flex items-center justify-between text-[#687789] text-[11px]">
          <span>Tip: WormForge synchronizes keyboard and pointer inputs deterministically in lockstep.</span>
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
