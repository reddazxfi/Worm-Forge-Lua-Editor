import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageSquare, Users } from 'lucide-react';
import { CollabMessage, CollabUser } from '../types/wormforge';

interface CollabChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: NonNullable<CollabMessage['chatMsg']>[];
  onSendMessage: (text: string) => void;
  currentUser: CollabUser;
  connectedUsers: CollabUser[];
}

export const CollabChatDrawer: React.FC<CollabChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUser,
  connectedUsers,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <aside className="w-72 bg-[#16191f] border-l border-[#272e39] flex flex-col h-full text-xs shadow-2xl z-30 select-none">
      {/* Header */}
      <div className="p-3 bg-[#191d24] border-b border-[#252c37] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-[#e1ebf7]">Modders Live Chat</span>
        </div>
        <button onClick={onClose} className="p-1 rounded text-[#718296] hover:text-[#e1ebf7] hover:bg-[#252c37]">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Online Users List */}
      <div className="p-2 bg-[#12151a] border-b border-[#222731]">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase font-bold text-[#647486] mb-1.5 px-1">
          <Users className="w-3 h-3" />
          <span>Active in Room ({connectedUsers.length})</span>
        </div>
        <div className="flex flex-wrap gap-1.5 px-1">
          {connectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1e232c] text-[11px] text-[#bccadb] border border-[#2b3340]"
            >
              <span style={{ backgroundColor: u.color }} className="w-1.5 h-1.5 rounded-full" />
              <span>{u.name}</span>
              {u.id === currentUser.id && <span className="text-[9px] text-amber-400 font-bold">(You)</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 select-text">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-[#556475] italic p-4 text-[11px]">
            No messages yet. Say hello to other modders in this room!
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.sender === currentUser.name;
            return (
              <div key={m.id} className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span style={{ color: m.color }} className="font-bold">
                    {m.sender} {isMe && '(You)'}
                  </span>
                  <span className="text-[#566576] font-mono">{m.time}</span>
                </div>
                <div className="p-2 rounded bg-[#1f242d] border border-[#29323f] text-[#cfd9e5] break-words leading-relaxed text-[11.5px]">
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="p-2.5 bg-[#14171d] border-t border-[#232933] flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Message room..."
          className="flex-1 bg-[#1a1f27] border border-[#2c3543] rounded px-2.5 py-1.5 text-xs text-[#dce7f3] placeholder-[#576475] focus:outline-none focus:border-amber-500/70 font-sans"
        />
        <button
          type="submit"
          className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-bold transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </aside>
  );
};
