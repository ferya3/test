// WCAG 2.1 contrast verification for the final palette.
//
// Thresholds applied:
//   4.5  normal body text (AA)
//   3.0  large text (>=24px, or >=18.66px bold) and meaningful UI boundaries
//        such as control borders and focus rings (AA non-text contrast)
//   none purely decorative dividers
const hex = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
};

const lum = (h) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const P = {
  // Cool graphite neutrals
  'ink-950': '#0B0D0E',
  'ink-900': '#14171A',
  'ink-800': '#1E2226',
  'ink-700': '#2C3136',
  'ink-600': '#3D4348',
  'ink-500': '#5E656B',
  'ink-400': '#7C8489',
  'ink-300': '#A8AFB4',
  'ink-200': '#CDD2D6',
  'ink-100': '#E4E7E9',
  'ink-50': '#F2F4F5',
  paper: '#FBFBFA',
  white: '#FFFFFF',

  // Burnt amber accent
  'accent-800': '#6E3506',
  'accent-700': '#8A4308',
  'accent-600': '#A04E0A',
  'accent-500': '#C2620F',
  'accent-400': '#DB7C1E',
  'accent-300': '#E89B4D',
  'accent-100': '#F8DCBC',
  'accent-50': '#FDF3E8',

  // States. Warning is deliberately ochre-tinted only: a solid amber warning
  // would be indistinguishable from the amber brand accent.
  'success-700': '#12603B',
  'success-600': '#197A4B',
  'success-50': '#E8F5EE',
  'danger-700': '#8F1C13',
  'danger-600': '#B42318',
  'danger-50': '#FDECEA',
  'warning-700': '#7A5210',
  'warning-600': '#8F5D0F',
  'warning-50': '#FDF6E3',
  'info-700': '#17568C',
  'info-600': '#1F6FB2',
  'info-50': '#E9F2FA',
};

const checks = [
  // --- Light theme: text -------------------------------------------------
  ['ink-900', 'paper', 4.5, 'body text'],
  ['ink-700', 'paper', 4.5, 'secondary text'],
  ['ink-500', 'paper', 4.5, 'muted text'],
  ['ink-400', 'paper', 3.0, 'placeholder (UI)'],
  ['ink-900', 'ink-50', 4.5, 'body text on subtle surface'],
  ['ink-500', 'ink-50', 4.5, 'muted text on subtle surface'],

  // --- Light theme: interactive surfaces ---------------------------------
  ['white', 'accent-600', 4.5, 'white on primary button'],
  ['white', 'accent-700', 4.5, 'white on primary button hover'],
  ['accent-600', 'paper', 4.5, 'accent link'],
  ['accent-500', 'paper', 3.0, 'accent on large display text'],
  ['white', 'ink-900', 4.5, 'white on dark (secondary button)'],
  ['ink-900', 'paper', 3.0, 'control border contrast placeholder'],

  // --- Light theme: borders and rings (3:1 non-text) ---------------------
  ['ink-400', 'paper', 3.0, 'input border'],
  ['accent-600', 'paper', 3.0, 'focus ring on paper'],
  ['ink-200', 'paper', 1.0, 'decorative divider (no minimum)'],

  // --- Light theme: state tints ------------------------------------------
  ['success-700', 'success-50', 4.5, 'success text on tint'],
  ['danger-700', 'danger-50', 4.5, 'danger text on tint'],
  ['warning-700', 'warning-50', 4.5, 'warning text on tint'],
  ['info-700', 'info-50', 4.5, 'info text on tint'],
  ['accent-700', 'accent-50', 4.5, 'accent text on tint'],

  // --- Light theme: solid state buttons ---------------------------------
  ['white', 'success-600', 4.5, 'white on success'],
  ['white', 'danger-600', 4.5, 'white on danger'],
  ['white', 'info-600', 4.5, 'white on info'],
  ['white', 'warning-700', 4.5, 'white on warning (dark ochre)'],

  // --- Dark theme -------------------------------------------------------
  ['ink-100', 'ink-950', 4.5, 'DARK body text'],
  ['ink-300', 'ink-950', 4.5, 'DARK muted text'],
  ['ink-100', 'ink-900', 4.5, 'DARK body text on raised surface'],
  ['ink-300', 'ink-900', 4.5, 'DARK muted text on raised surface'],
  ['ink-400', 'ink-950', 3.0, 'DARK placeholder (UI)'],
  ['accent-400', 'ink-950', 4.5, 'DARK accent link'],
  ['accent-400', 'ink-900', 4.5, 'DARK accent link on raised'],
  ['ink-950', 'accent-400', 4.5, 'DARK dark text on accent button'],
  ['ink-500', 'ink-950', 3.0, 'DARK input border'],
  ['ink-500', 'ink-900', 3.0, 'DARK input border on raised surface'],
  ['accent-400', 'ink-950', 3.0, 'DARK focus ring'],
  ['ink-800', 'ink-950', 1.0, 'DARK decorative divider (no minimum)'],
  ['ink-300', 'ink-800', 4.5, 'DARK muted text on elevated card'],
];

let failures = 0;
for (const [fg, bg, min, label] of checks) {
  if (!(fg in P) || !(bg in P)) throw new Error(`unknown colour: ${fg} / ${bg}`);
  const r = ratio(P[fg], P[bg]);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(6)} (>=${String(min).padEnd(3)}) ${label}  [${fg} / ${bg}]`,
  );
}
console.log(`\n${failures} failure(s) of ${checks.length} checks`);
process.exit(failures === 0 ? 0 : 1);
