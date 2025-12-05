import { useCallback, useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { describeHotkey, formatHotkeyFromEvent } from '../../utils/hotkeys';

interface HotkeyFieldProps {
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
  helper?: string;
  placeholder?: string;
}

export const HotkeyField = ({
  label,
  value,
  onChange,
  helper,
  placeholder = 'Set hotkey',
}: HotkeyFieldProps) => {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;

    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setListening(false);
        return;
      }

      const combo = formatHotkeyFromEvent(event);
      if (combo) {
        onChange(combo);
        setListening(false);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
    };
  }, [listening, onChange]);

  const handleToggle = useCallback(() => {
    setListening((prev) => !prev);
  }, []);

  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const labelClasses = 'text-xs uppercase tracking-[0.35em] text-white/50';
  const baseButtonClasses =
    'flex flex-1 items-center justify-between gap-3 rounded-2xl border border-dashed border-white/20 px-4 py-3 text-left text-sm text-white/80';

  return (
    <div className="flex flex-col gap-2">
      <span className={labelClasses}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${baseButtonClasses} ${listening ? 'border-brand-secondary/60 bg-brand-secondary/20 text-white' : 'bg-white/5'}`}
          onClick={handleToggle}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={16} />
            <span className="font-semibold">
              {listening ? 'Press any key…' : value ? describeHotkey(value) : placeholder}
            </span>
          </div>
          <span className="text-xs uppercase tracking-[0.4em] text-white/50">{listening ? 'Listening' : 'Set'}</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 rounded-2xl border border-white/15 px-3 py-2 text-xs uppercase tracking-[0.3em] text-white/60"
          >
            <X size={14} />
            Clear
          </button>
        )}
      </div>
      {helper && <p className="text-xs text-white/50">{helper}</p>}
    </div>
  );
};
