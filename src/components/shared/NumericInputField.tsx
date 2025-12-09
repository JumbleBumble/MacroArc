import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useId } from 'react';
import type { ChangeEvent, FC, InputHTMLAttributes } from 'react';

export interface NumericInputFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  label?: string;
  helper?: string;
  suffix?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

export const NumericInputField: FC<NumericInputFieldProps> = ({
  label,
  helper,
  suffix,
  value,
  onChange,
  id,
  disabled,
  placeholder,
  className = '',
  ...rest
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const focusSpring = useSpring(0, { stiffness: 300, damping: 32, mass: 0.6 });
  const borderColor = useTransform(
    focusSpring,
    (value) => `rgba(142, 103, 255, ${0.25 * value + 0.15})`,
  );
  const boxShadow = useTransform(
    focusSpring,
    (value) => `0px 12px 35px rgba(142, 103, 255, ${0.12 * value})`,
  );
  const background = useTransform(
    focusSpring,
    (value) => `rgba(255, 255, 255, ${0.05 + value * 0.05})`,
  );

  useEffect(() => {
    if (disabled) {
      focusSpring.set(0);
    }
  }, [disabled, focusSpring]);

  const normalizedValue = value ?? '';

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    if (next === '') {
      onChange(null);
      return;
    }
    const parsed = Number(next);
    onChange(Number.isNaN(parsed) ? null : parsed);
  };

  const baseWrapper = `mt-2 flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm text-white outline-none focus-visible:outline-none focus-visible:ring-0 focus-within:outline-none focus-within:ring-0 ${
    disabled ? 'opacity-40' : 'border-white/15'
  } ${className}`.trim();

  return (
    <label className="flex flex-col text-xs uppercase tracking-[0.35em] text-white/50" htmlFor={inputId}>
      {label}
      <motion.div
        layout
        className={baseWrapper}
        style={{ borderColor, boxShadow, background }}
      >
        <input
          {...rest}
          id={inputId}
          type="number"
          inputMode="numeric"
          placeholder={placeholder}
          value={normalizedValue}
          disabled={disabled}
          onFocus={() => focusSpring.set(1)}
          onBlur={() => focusSpring.set(0)}
          onChange={handleChange}
          data-focus-silent
          className="w-full bg-transparent text-base font-semibold text-white placeholder:text-white/40 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
        />
        {suffix ? (
          <span className="text-[0.7rem] uppercase tracking-[0.3em] text-white/50">{suffix}</span>
        ) : null}
      </motion.div>
      {helper ? <p className="mt-1 text-[0.65rem] text-white/50">{helper}</p> : null}
    </label>
  );
};
