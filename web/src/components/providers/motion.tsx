'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Reduced motion, honoured in one place: with the system setting on, Framer
 * skips movement (rises, slides) and keeps only fades. Components render the
 * same on the server and in the browser either way — choosing different
 * initial states from the setting made hydration fail for those visitors.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
