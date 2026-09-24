import React, { useState } from 'react';
import {
  Code2,
  Users,
  MessageSquare,
  Share2,
  Check,
  Radio,
  FileCode,
  Sparkles,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { CollabUser } from '../types/wormforge';

interface CollabHeaderProps {
  room: string;
  onRoomChange: (newRoom: string) => void;
  connectedUsers: CollabUser[];
  currentUser: CollabUser;
  onUpdateUserName: (name: string, color?: string) => void;
  isConnected: boolean;
  onToggleChat: () => void;
  isChatOpen: boolean;
  unreadChatCount: number;
  activeFile: string;
  onSelectFile: (file: string) => void;
  openFiles: string[];
  onCloseFile: (file: string) => void;
  onLoadTemplate: (templateId: string) => void;
}

export const CollabHeader: React.FC<CollabHeaderProps> = ({
  room,
  onRoomChange,
  connectedUsers,
  currentUser,
  onUpdateUserName,
  isConnected,
  onToggleChat,
  isChatOpen,
  unreadChatCount,
  activeFile,
  onSelectFile,
  openFiles,
  onCloseFile,
  onLoadTemplate,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser.name);
  const [isRoomModal, setIsRoomModal] = useState(false);
  const [roomInput, setRoomInput] = useState(room);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveUser = () => {
    if (nameInput.trim()) {
      onUpdateUserName(nameInput.trim());
    }
    setIsEditingUser(false);
  };

  const handleJoinRoom = () => {
    if (roomInput.trim()) {
      onRoomChange(roomInput.trim());
    }
    setIsRoomModal(false);
  };

  return (
    <header className="bg-[#14171c] border-b border-[#262c35] text-xs text-[#cfdbe8] select-none">
      {/* Top Main Bar */}
      <div className="px-3 py-2 flex items-center justify-between gap-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-md">
            W
          </div>
          <div>
            <h1 className="font-bold text-[13px] tracking-tight text-[#e4edf7] flex items-center gap-1.5">
              <span>WormForge Code Studio</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                v0.6-dev
              </span>
            </h1>
          </div>
        </div>

        {/* Center Collaboration / Room Bar */}
        <div className="flex items-center gap-2">
          {/* Room Pill */}
          <div className="flex items-center gap-1.5 bg-[#1b2028] px-2.5 py-1 rounded-full border border-[#2a3340] text-[11.5px]">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
              title={isConnected ? 'Real-time WebSocket Live' : 'Reconnecting...'}
            />
            <span className="text-[#899cb2]">Room:</span>
            <button
              onClick={() => {
                setRoomInput(room);
                setIsRoomModal(true);
              }}
              className="font-mono font-semibold text-amber-300 hover:underline"
            >
              {room}
            </button>
            <button
              onClick={handleCopyLink}
              title="Copy room link"
              className="ml-1 text-[#6f8095] hover:text-[#cfdbe8]"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Share2 className="w-3 h-3" />}
            </button>
          </div>

          {/* Active Collaborators Avatars */}
          <div className="hidden sm:flex items-center -space-x-1.5 ml-1">
            {connectedUsers.map((user) => (
              <div
                key={user.id}
                title={`${user.name} (${user.id === currentUser.id ? 'You' : 'Collaborator'})`}
                style={{ backgroundColor: user.color }}
                className="w-5 h-5 rounded-full border-2 border-[#14171c] flex items-center justify-center text-[9px] font-bold text-slate-950 cursor-pointer shadow"
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>

          {/* User Nickname Button */}
          <button
            onClick={() => {
              setNameInput(currentUser.name);
              setIsEditingUser(true);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#202631] text-[#93a6be] text-[11px]"
          >
            <span
              style={{ backgroundColor: currentUser.color }}
              className="w-2 h-2 rounded-full inline-block"
            />
            <span className="max-w-[90px] truncate">{currentUser.name}</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Quick Preset Selector */}
          <div className="relative">
            <button
              onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#20252e] hover:bg-[#2a313d] text-[#c9d7e6] border border-[#2e3745] font-medium"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Load Mod / Script</span>
              <ChevronDown className="w-3 h-3 text-[#708094]" />
            </button>

            {isTemplatesOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-[#1a1e26] border border-[#313a48] rounded-md shadow-2xl py-1 z-50 text-xs">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#637488]">
                  Demo &amp; Custom Scripts
                </div>
                <button
                  onClick={() => {
                    onLoadTemplate('custom_class_demo');
                    setIsTemplatesOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-[#242b36] text-amber-300 font-medium flex items-center justify-between"
                >
                  <span>customClass-&gt; Syntax Demo</span>
                  <span className="text-[10px] text-amber-400/70">Arrow operator</span>
                </button>
                <div className="h-px bg-[#262c36] my-1" />
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#637488]">
                  Existing Mod Source
                </div>
                {[
                  { id: 'example.saw', name: 'Saw (Proximity)' },
                  { id: 'example.sentry_gun', name: 'Sentry Gun' },
                  { id: 'example.worm_toss', name: 'Worm Toss' },
                  { id: 'example.pooz', name: 'POOZ Runner' },
                  { id: 'example.wormcraft', name: 'WormCraft' },
                  { id: 'example.turret', name: 'Turret' },
                  { id: 'example.hurt_lab', name: 'Ten (Hurt Lab)' },
                  { id: 'example.gif_donkey', name: 'Growth Hormones' },
                  { id: 'example.q_bazooka', name: 'Q Bazooka' },
                  { id: 'example.mine_emit', name: 'Echo Mine' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onLoadTemplate(m.id);
                      setIsTemplatesOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1 hover:bg-[#242b36] text-[#bccadb]"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Collaboration Chat Drawer Toggle */}
          <button
            onClick={onToggleChat}
            className={`relative flex items-center gap-1 px-2.5 py-1 rounded font-medium border transition-colors ${
              isChatOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-[#20252e] hover:bg-[#2a313d] text-[#c9d7e6] border-[#2e3745]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Collab Chat</span>
            {unreadChatCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 font-bold rounded-full text-[9px] flex items-center justify-center">
                {unreadChatCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Editor Tabs Bar */}
      <div className="px-2 bg-[#101317] border-t border-[#1e232c] flex items-center gap-1 overflow-x-auto">
        {openFiles.map((file) => (
          <div
            key={file}
            onClick={() => onSelectFile(file)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 border-r border-[#1e232c] cursor-pointer text-xs font-mono transition-colors ${
              activeFile === file
                ? 'bg-[#111418] text-amber-300 font-semibold border-t-2 border-t-amber-400'
                : 'text-[#6c7d92] hover:text-[#a9bacd] hover:bg-[#15191f]'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 opacity-80" />
            <span>{file}</span>
            {openFiles.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(file);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 ml-1"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Nickname Editor Modal */}
      {isEditingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#171b21] border border-[#2f3744] rounded-lg p-4 max-w-xs w-full shadow-2xl space-y-3">
            <h3 className="font-semibold text-sm text-[#e4edf7]">Edit Collaborator Profile</h3>
            <div className="space-y-1">
              <label className="text-[11px] text-[#7d8fA4]">Nickname</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-[#12151a] border border-[#2f3744] rounded px-2 py-1 text-xs text-[#dce7f3]"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsEditingUser(false)}
                className="px-3 py-1 rounded bg-[#20252e] text-[#8ea0b5]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveUser}
                className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch Room Modal */}
      {isRoomModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#171b21] border border-[#2f3744] rounded-lg p-4 max-w-xs w-full shadow-2xl space-y-3">
            <h3 className="font-semibold text-sm text-[#e4edf7]">Switch Collaborative Room</h3>
            <p className="text-[11px] text-[#7d8fA4]">
              Enter a room name. Anyone with the same room name will collaborate in real time.
            </p>
            <div className="space-y-1">
              <label className="text-[11px] text-[#7d8fA4]">Room Name</label>
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                className="w-full bg-[#12151a] border border-[#2f3744] rounded px-2 py-1 text-xs text-[#dce7f3] font-mono"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRoomModal(false)}
                className="px-3 py-1 rounded bg-[#20252e] text-[#8ea0b5]"
              >
                Cancel
              </button>
              <button
                onClick={handleJoinRoom}
                className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-bold"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
