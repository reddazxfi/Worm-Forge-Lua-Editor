export type SyntaxSeverity = 'error' | 'warning' | 'info';

export interface SyntaxDiagnostic {
  line: number;
  column: number;
  length?: number;
  message: string;
  severity: SyntaxSeverity;
  rule?: string;
  /**
   * The long-form explanation, shown only when the user expands the row.
   *
   * WHY THIS IS SPLIT OUT
   * `message` is what fits on one console row without truncation, so it leads with
   * the ACTIONABLE half -- the suggestion, or the consequence if ignored. Everything
   * that is true but not needed to decide what to do (why the engine behaves this
   * way, what happens at load time) goes here instead.
   *
   * The `worm-msg-filter` advisory was the reason this field exists: its message ran
   * to ~470 characters, four full sentences of explanation wrapped around one short
   * suggestion. On a 1366-wide display that is roughly 60 wrapped lines for a single
   * finding, which pushes every other row in the list off screen. Short message plus
   * an expandable detail keeps the suggestion visible and the reasoning one click away.
   *
   * Optional and absent on most findings, because most messages are already short.
   */
  detail?: string;
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

export interface CustomVerb {
  /** Target class, e.g. 'WormEntity', 'wa', or a brand-new class name. */
  class: string;
  /** Lua identifier, e.g. 'grapple'. */
  name: string;
  kind: 'method' | 'variable';
  /** ':' methods pass self; '.' is a namespaced function or property. */
  syntax: ':' | '.';
  returnType: string;
  parameters: ParameterDef[];
  description: string;
  example: string;
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
