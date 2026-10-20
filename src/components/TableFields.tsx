// The nested field list for a documented spec table.
//
// Renders `TableField` trees from data/tableDocs.ts: one row per key, indented by
// depth, with the type, the enum names it accepts, and the caveats that actually
// bite (required, action-gated, removed in API 4). Tables collapse; leaves do not.
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TableField } from '../data/tableDocs';
import { fieldTypeLabel } from '../services/tableContext';

interface TableFieldsProps {
  fields: TableField[];
  isLight?: boolean;
  /** Path of the parent, for stable expand keys. */
  path?: string;
}

export const TableFields: React.FC<TableFieldsProps> = ({ fields, isLight = false, path = '' }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const muted = isLight ? 'text-slate-500' : 'text-[#66788c]';

  return (
    <div className="space-y-0.5">
      {fields.map((field) => {
        const key = path ? `${path}.${field.name}` : field.name;
        const hasChildren = !!field.children?.length;
        const isOpen = !!open[key];
        const type = fieldTypeLabel(field);
        const description = field.description;

        return (
          <div key={key}>
            <div
              onClick={hasChildren ? () => setOpen((p) => ({ ...p, [key]: !p[key] })) : undefined}
              title={field.offset !== undefined ? `record offset +0x${field.offset.toString(16)}` : undefined}
              className={`flex items-baseline gap-1 py-0.5 px-1 rounded ${
                hasChildren ? 'cursor-pointer' : ''
              } ${hasChildren ? (isLight ? 'hover:bg-slate-100' : 'hover:bg-[#1d232c]') : ''}`}
            >
              <span className="w-3 shrink-0 self-center">
                {hasChildren ? (
                  isOpen ? (
                    <ChevronDown className="w-3 h-3 text-[#67778b]" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-[#67778b]" />
                  )
                ) : null}
              </span>
              <span
                className={`font-mono text-[11.5px] truncate ${
                  field.gone
                    ? isLight
                      ? 'text-rose-600 line-through'
                      : 'text-rose-400 line-through'
                    : field.kind === 'table'
                    ? isLight
                      ? 'text-teal-700 font-semibold'
                      : 'text-teal-300 font-semibold'
                    : isLight
                    ? 'text-slate-800'
                    : 'text-[#cfd9e5]'
                }`}
              >
                {field.name}
              </span>
              {field.required && (
                <span
                  title="Required: the engine rejects the call without it"
                  className="text-[10px] text-amber-500 font-bold shrink-0"
                >
                  *
                </span>
              )}
              {field.gone && (
                <span className={`text-[10px] shrink-0 ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>
                  → {field.gone}
                </span>
              )}
              {field.action && (
                <span
                  title={`Only when missile.action = "${field.action}"`}
                  className={`text-[9.5px] px-1 rounded border shrink-0 ${
                    isLight
                      ? 'bg-amber-50 text-amber-700 border-amber-300'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {field.action}
                </span>
              )}
              <span className={`ml-auto text-[10px] font-mono shrink-0 ${muted}`}>{type}</span>
            </div>

            {description && (
              <div className={`pl-[18px] pr-1 pb-0.5 text-[10.5px] leading-snug ${isLight ? 'text-slate-500' : 'text-[#7d8fa3]'}`}>
                {description}
              </div>
            )}

            {field.values && field.values.length > 0 && (
              <div className="pl-[18px] pb-0.5 flex flex-wrap gap-1">
                {field.values.map(([name, value]) => (
                  <span
                    key={`${key}_${name}`}
                    className={`text-[9.5px] font-mono px-1 rounded border ${
                      isLight
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                    }`}
                  >
                    {name}
                    {typeof value === 'number' ? ` = ${value}` : ''}
                  </span>
                ))}
              </div>
            )}

            {hasChildren && isOpen && (
              <div className={`ml-[14px] pl-1 border-l ${isLight ? 'border-slate-200' : 'border-[#262c35]'}`}>
                <TableFields fields={field.children!} isLight={isLight} path={key} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
