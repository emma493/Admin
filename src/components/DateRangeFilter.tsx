import Dropdown from './Dropdown';
import { getFormattedDate } from '../lib/utils';

export type DatePreset = 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'all' | 'custom';

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7days': 'Last 7 days',
  '30days': 'Last 30 days',
  thisMonth: 'This month',
  all: 'All time',
  custom: 'Custom…',
};

const dateInputStyle = {
  background: '#16171D',
  border: '1px solid rgba(255,255,255,0.1)',
  colorScheme: 'dark' as const,
};

interface DateRangeFilterProps {
  ariaLabel: string;
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomChange: (start: string, end: string) => void;
  presetWidthClass?: string;
}

/**
 * Shared preset + custom from/to date filter (Admin palette).
 * Auto-swap is applied by the caller via normalizeDateRange; this component
 * just forwards raw input values so typing stays natural.
 */
export default function DateRangeFilter({
  ariaLabel,
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomChange,
  presetWidthClass = 'w-[190px]',
}: DateRangeFilterProps) {
  const today = getFormattedDate(0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className={presetWidthClass}>
        <Dropdown
          ariaLabel={ariaLabel}
          value={preset}
          onChange={(v) => onPresetChange(v as DatePreset)}
          options={(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p) => ({
            value: p,
            label: DATE_PRESET_LABELS[p],
          }))}
        />
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[12px] font-bold text-[#8A8B91]">
            From
            <input
              type="date"
              aria-label={`${ariaLabel} start date`}
              value={customStart}
              max={customEnd || today}
              onChange={(e) => onCustomChange(e.target.value, customEnd)}
              className="px-3 py-2.5 rounded-[10px] text-white text-[13px] font-semibold outline-none focus:border-[#FF2B55]/60"
              style={dateInputStyle}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] font-bold text-[#8A8B91]">
            To
            <input
              type="date"
              aria-label={`${ariaLabel} end date`}
              value={customEnd}
              min={customStart || undefined}
              max={today}
              onChange={(e) => onCustomChange(customStart, e.target.value)}
              className="px-3 py-2.5 rounded-[10px] text-white text-[13px] font-semibold outline-none focus:border-[#FF2B55]/60"
              style={dateInputStyle}
            />
          </label>
        </div>
      )}
    </div>
  );
}
