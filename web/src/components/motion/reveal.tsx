'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';

type RevealProps = HTMLMotionProps<'div'> & {
  delay?: number;
  /** Distance to rise from, in px. */
  y?: number;
};

/** Fades and lifts its children into place the first time they scroll into view. */
// With reduced motion on, MotionProvider drops the rise and keeps the fade.
export function Reveal({ delay = 0, y = 24, children, ...props }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
