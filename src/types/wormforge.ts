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
  type: string;
  description?: string;
  optional?: boolean;
  defaultValue?: string | number | boolean;
}

export interface ClassMemberDef {
  name: string;
  kind: 'method' | 'variable' | 'property' | 'constant';
  parameters?: ParameterDef[];
  returnType?: string;
  description: string;
  example?: string;
  deprecated?: boolean;
  isCustom?: boolean;
}

export type MemberDef = ClassMemberDef;

export interface ClassDef {
  name: string;
  description: string;
  parent?: string;
  syntaxExample?: string;
  members: ClassMemberDef[];
  isCustom?: boolean;
}

export interface EnumDef {
  name: string;
  description: string;
  values: { name: string; value: number | string; description?: string }[];
}

export interface FunctionDef {
  name: string;
  namespace?: string;
  parameters: ParameterDef[];
  returnType?: string;
  description: string;
  example?: string;
  scope?: 'global' | 'module' | 'hook';
  isCustom?: boolean;
}

export interface VariableDef {
  name: string;
  type: string;
  description: string;
  scope?: 'global' | 'module' | 'worm' | 'actor' | 'custom';
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
  category?: 'weapons' | 'gameplay' | 'rules' | 'weapon' | 'hud' | 'visual' | 'utility' | string;
  description?: string;
  replacesSlot?: string;
  exclusiveGroup?: string;
  isExclusiveWarning?: string;
  installed?: boolean;
  enabled?: boolean;
  isOnlineAvailable?: boolean;
  files: ModFileInfo[];
  declaredMethods?: string[];
  declaredVariables?: string[];
  customClasses?: string[];
  hooks?: string[];
  tags?: string[];
}

export interface ParsedSymbolTree {
  functions: FunctionDef[];
  variables: VariableDef[];
  classes: ClassDef[];
  enums: EnumDef[];
  customVerbs?: string[];
  diagnostics?: SyntaxDiagnostic[];
}

export interface ConsoleLogMessage {
  time: string;
  text: string;
  type: 'info' | 'warn' | 'error' | 'success';
}
