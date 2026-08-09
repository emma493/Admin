import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  description?: string;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  isDark?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  label?: string;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  icon,
  isDark = true,
  className = '',
  size = 'md',
  fullWidth = true,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs rounded-lg',
    md: 'px-3 py-2 text-xs rounded-xl font-semibold',
    lg: 'px-3.5 py-2.5 text-sm rounded-xl font-bold',
  };

  const currentSizeClass = sizeStyles[size] || sizeStyles.md;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {label && (
        <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
          {label}
        </label>
      )}

      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full inline-flex items-center justify-between gap-2 border transition-all duration-150 shadow-xs focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 ${currentSizeClass} ${
          isDark
            ? 'bg-zinc-950 hover:bg-zinc-900 border-zinc-800 text-white'
            : 'bg-zinc-50 hover:bg-white border-zinc-300 text-zinc-900'
        } ${isOpen ? 'border-red-600 ring-2 ring-red-600/20' : ''}`}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {icon && <span className="text-red-500 flex-shrink-0">{icon}</span>}
          {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
          <span className="truncate font-bold">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedOption?.badge && (
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md bg-red-600/20 text-red-400 border border-red-500/30">
              {selectedOption.badge}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 text-zinc-400 ${
              isOpen ? 'rotate-180 text-red-500' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Menu Popover */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 w-full rounded-2xl shadow-xl border overflow-hidden p-1.5 backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-100 ${
            isDark
              ? 'bg-zinc-900/95 border-zinc-800 text-white shadow-black/60'
              : 'bg-white/95 border-zinc-200 text-zinc-900 shadow-zinc-300/50'
          }`}
          style={{ minWidth: '180px', maxHeight: '280px', overflowY: 'auto' }}
        >
          <div className="space-y-0.5">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                    isSelected
                      ? 'bg-red-600 text-white shadow-xs'
                      : isDark
                      ? 'hover:bg-zinc-800 text-zinc-200'
                      : 'hover:bg-zinc-100 text-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <div className="truncate">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div
                          className={`text-[10px] font-normal truncate ${
                            isSelected
                              ? 'text-white/80'
                              : isDark
                              ? 'text-zinc-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          {option.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {option.badge && !isSelected && (
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md ${
                          isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {option.badge}
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
