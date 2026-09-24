export type SyntaxSeverity = 'error' | 'warning' | 'info';

export interface SyntaxDiagnostic {
  line: number;
  column: number;
  length?: number;
  message: string;
  severity: SyntaxSeverity;
  rule?: string;
}

export interface ParameterDef {
  name: string;
  type: 'int' | 'float' | 'string' | 'bool' | 'table' | 'function' | 'any';
  optional?: boolean;
  defaultValue?: string | number | boolean;
  description?: string;
}

export interface MemberDef {
  name: string;
  kind: 'method' | 'variable' | 'property' | 'constant';
  returnType?: string;
  parameters?: ParameterDef[];
  description: string;
  example?: string;
  deprecated?: boolean;
  isCustom?: boolean;
}

export interface ClassDef {
  name: string;
  description: string;
  parent?: string;
  members: MemberDef[];
  isCustom?: boolean;
  syntaxExample?: string;
}

export interface EnumDef {
  name: string;
  description: string;
  values: { name: string; value: string | number; description?: string }[];
}

export interface FunctionDef {
  name: string;
  namespace?: string;
  parameters: ParameterDef[];
  returnType?: string;
  description: string;
  example?: string;
  isCustom?: boolean;
}

export interface VariableDef {
  name: string;
  type: string;
  description: string;
  scope: 'global' | 'module' | 'worm' | 'actor' | 'custom';
  example?: string;
  isCustom?: boolean;
}

export interface ModFileInfo {
  path: string;
  name: string;
  content: string;
  language: 'lua' | 'toml' | 'markdown';
}

export interface ModFolderInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description?: string;
  replacesSlot?: string;
  files: ModFileInfo[];
  declaredMethods: string[];
  declaredVariables: string[];
  customClasses: string[];
  hooks: string[];
}

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { line: number; column: number };
  selection?: { startLine: number; startCol: number; endLine: number; endCol: number };
  activeFile?: string;
  lastActive: number;
}

export interface CollabMessage {
  type: 'init' | 'join' | 'leave' | 'change' | 'cursor' | 'chat' | 'sync_request' | 'state';
  userId?: string;
  userName?: string;
  userColor?: string;
  room?: string;
  file?: string;
  code?: string;
  version?: number;
  cursor?: { line: number; column: number };
  selection?: { startLine: number; startCol: number; endLine: number; endCol: number };
  chatMsg?: { id: string; sender: string; text: string; time: string; color: string };
  users?: CollabUser[];
}

export interface ParsedSymbolTree {
  variables: VariableDef[];
  functions: FunctionDef[];
  classes: ClassDef[];
  enums: EnumDef[];
  customVerbs: string[];
}
