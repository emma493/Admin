import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
  count?: number;
  leading?: ReactNode;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  ariaLabel: string;
  placeholder?: string;
}

/**
 * Modern custom listbox matching the shortxx.live feed-menu language
 * (dark popover, hover rows, accent check) re-skinned to the Admin palette.
 * Replaces native <select> so option rows can carry flags, icons + counts.
 */
export default function Dropdown({ value, onChange, options, ariaLabel, placeholder }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  useEffect(() => {
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [value, options]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onTriggerKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen((o) => !o);
    }
  };

  const onListKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) pick(opt.value);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className="w-full max-w-full min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-white text-[13px] font-semibold outline-none text-left transition-colors hover:border-white/25 focus:border-[#FF2B55]/60"
        style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {selected?.leading && <span className="shrink-0 flex items-center">{selected.leading}</span>}
        <span className="flex-1 min-w-0 truncate">{selected?.label ?? placeholder ?? 'Select…'}</span>
        {typeof selected?.count === 'number' && (
          <span className="shrink-0 text-[11px] font-bold text-[#8A8B91]">({selected.count})</span>
        )}
        <ChevronDown
          size={15}
          className={`shrink-0 text-[#8A8B91] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onListKey}
          className="absolute left-0 right-0 top-full mt-1.5 z-40 overflow-auto rounded-[12px] p-1.5 max-h-64"
          style={{
            background: '#1E1F27',
            border: '1px solid #2f2f2f',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          }}
        >
          {options.map((opt, i) => {
            const active = opt.value === value;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(opt.value)}
                  onMouseEnter={() => setHighlight(i)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-left text-[13px] font-semibold transition-colors"
                  style={
                    active
                      ? { background: 'rgba(255,43,85,0.12)', color: '#fff' }
                      : i === highlight
                        ? { background: 'rgba(255,255,255,0.08)', color: '#fff' }
                        : { background: 'transparent', color: '#E1E2E6' }
                  }
                >
                  {opt.leading && <span className="shrink-0 flex items-center text-[15px]">{opt.leading}</span>}
                  <span className="flex-1 min-w-0 truncate">{opt.label}</span>
                  {opt.hint && <span className="shrink-0 text-[11px] text-[#8A8B91] truncate max-w-[40%]">{opt.hint}</span>}
                  {typeof opt.count === 'number' && (
                    <span className="shrink-0 text-[11px] font-bold text-[#8A8B91]">({opt.count})</span>
                  )}
                  <span className="shrink-0 w-4 flex items-center justify-center">
                    {active && <Check size={14} style={{ color: '#FF2B55' }} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
