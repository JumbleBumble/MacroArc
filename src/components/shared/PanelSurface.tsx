import { motion, type Variants } from 'framer-motion';
import type { FC, ReactNode } from 'react';

const panelVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 16, scale: 0.95 },
};

export type PanelSurfaceProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  layout?: boolean;
  emphasis?: 'default' | 'subtle';
};

const emphasisStyles: Record<NonNullable<PanelSurfaceProps['emphasis']>, string> = {
  default: 'glass-panel rounded-3xl p-6',
  subtle: 'rounded-3xl border border-white/10 bg-white/5 p-6',
};

export const PanelSurface: FC<PanelSurfaceProps> = ({
  children,
  className = '',
  delay = 0,
  layout = false,
  emphasis = 'default',
}) => (
  <motion.section
    layout={layout}
    variants={panelVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
    transition={{ type: 'spring', stiffness: 210, damping: 26, delay }}
    className={`${emphasisStyles[emphasis]} ${className}`.trim()}
  >
    {children}
  </motion.section>
);
