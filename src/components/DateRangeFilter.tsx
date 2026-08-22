import React, { useState } from 'react';
import { Calendar, Filter, RotateCcw, ChevronRight } from 'lucide-react';
import { DateRangeState, DateRangePreset } from '../types';
import { getPresetDates } from '../lib/utils';
import { CustomDropdown } from './CustomDropdown';

interface DateRangeFilterProps {
  value: DateRangeState;
  onChange: (newValue: DateRangeState) => void;
  isDark?: boolean;
  className?: string;
  compact?: boolean;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  value,
  onChange,
  isDark = true,
  className = '',
  compact = false,
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(value.preset === 'custom');

  const handlePresetSelect = (presetStr: string) => {
    const preset = presetStr as DateRangePreset;
    if (preset === 'custom') {
      setShowCustomPicker(true);
      onChange({
        ...value,
        preset: 'custom',
      });
    } else {
      setShowCustomPicker(false);
      const { startDate, endDate } = getPresetDates(preset);
      onChange({
        preset,
        startDate,
        endDate,
      });
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      preset: 'custom',
      startDate: e.target.value,
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      preset: 'custom',
      endDate: e.target.value,
    });
  };

  const presetOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7days', label: 'Last 7 Days' },
    { value: '30days', label: 'Last 30 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'custom', label: 'Custom Date Range...' },
  ];

  return (
    <div
      className={`p-2.5 sm:p-3 rounded-2xl border transition-all duration-150 ${
        isDark
          ? 'bg-zinc-900/90 border-zinc-800 text-white shadow-lg shadow-black/40'
          : 'bg-white border-zinc-200 text-zinc-900 shadow-md shadow-zinc-200/50'
      } ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Left: Label & Dropdown */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5 text-red-500 font-extrabold text-xs uppercase tracking-wider flex-shrink-0">
            <Calendar className="w-4 h-4" />
            <span className="hidden xs:inline">Date Filter</span>
          </div>

          <div className="w-44 xs:w-48 sm:w-52 flex-shrink-0">
            <CustomDropdown
              isDark={isDark}
              value={value.preset}
              onChange={handlePresetSelect}
              options={presetOptions}
              size="sm"
            />
          </div>

          {/* Quick preset buttons on wider screens */}
          {!compact && (
            <div className="hidden lg:flex items-center gap-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: '7days', label: '7D' },
                { id: '30days', label: '30D' },
              ].map((p) => {
                const isActive = value.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetSelect(p.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      isActive
                        ? 'bg-red-600 text-white shadow-xs'
                        : isDark
                        ? 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                        : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Active Range Display or Inputs */}
        <div className="flex items-center gap-2 justify-end flex-wrap">
          {(showCustomPicker || value.preset === 'custom') ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold flex-wrap">
              <input
                type="date"
                value={value.startDate}
                onChange={handleStartDateChange}
                placeholder="Start Date"
                className={`px-2.5 py-1 rounded-xl border text-xs font-mono focus:outline-none focus:border-red-600 ${
                  isDark
                    ? 'bg-zinc-950 text-white border-zinc-700'
                    : 'bg-zinc-50 text-zinc-900 border-zinc-300'
                }`}
              />
              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
              <input
                type="date"
                value={value.endDate}
                onChange={handleEndDateChange}
                placeholder="End Date"
                className={`px-2.5 py-1 rounded-xl border text-xs font-mono focus:outline-none focus:border-red-600 ${
                  isDark
                    ? 'bg-zinc-950 text-white border-zinc-700'
                    : 'bg-zinc-50 text-zinc-900 border-zinc-300'
                }`}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold border flex items-center gap-1.5 ${
                  isDark
                    ? 'bg-zinc-950/80 text-zinc-300 border-zinc-800'
                    : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                }`}
              >
                <Filter className="w-3 h-3 text-red-500" />
                <span>
                  {value.startDate && value.endDate
                    ? `${value.startDate} → ${value.endDate}`
                    : value.startDate
                    ? `From ${value.startDate}`
                    : value.endDate
                    ? `Until ${value.endDate}`
                    : 'Showing All Time Records'}
                </span>
              </span>

              {value.preset !== 'all' && (
                <button
                  type="button"
                  onClick={() => handlePresetSelect('all')}
                  title="Reset date filter"
                  className={`p-1.5 rounded-xl border transition-all ${
                    isDark
                      ? 'bg-zinc-800 text-zinc-400 hover:text-white border-zinc-700'
                      : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 border-zinc-200'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
