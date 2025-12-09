import { motion } from 'framer-motion';
import type { FC, ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  align?: 'start' | 'center';
}

export const SectionHeader: FC<SectionHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  trailing,
  align = 'start',
}) => (
  <motion.div
    layout
    className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
      align === 'center' ? 'text-center sm:text-left' : ''
    }`}
  >
    <div>
      <p className="text-xs uppercase tracking-[0.4em] text-white/50">{eyebrow}</p>
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      {subtitle ? (
        <p className="text-sm text-white/60">{subtitle}</p>
      ) : null}
    </div>
    {trailing ? <div className="flex flex-wrap items-center gap-2">{trailing}</div> : null}
  </motion.div>
);
