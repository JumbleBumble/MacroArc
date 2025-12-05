import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface AppShellProps {
  children: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => (
  <div className="relative min-h-screen w-full overflow-x-hidden bg-(--surface) text-(--subtle)">
    <div className="pointer-events-none absolute inset-0 opacity-80">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9 }}
        className="absolute inset-0"
      >
        <div className="absolute -top-32 left-12 h-72 w-72 animate-floaty rounded-full bg-brand-primary/30 blur-3xl" />
        <div className="absolute top-12 right-0 h-80 w-80 animate-wiggle-slow rounded-full bg-brand-secondary/20 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent" />
      </motion.div>
    </div>

    <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {children}
    </main>
  </div>
);
