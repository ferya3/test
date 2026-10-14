// WCAG contrast for every pairing the UI actually uses. Exits non-zero on a
// failure, so a palette edit that breaks legibility fails the build step that
// runs it rather than shipping.
const palette = {
  ink950: '#0f0d0b', ink900: '#1a1714', ink800: '#25211c', ink700: '#3a342d',
  ink600: '#544b42', ink500: '#6e645a', ink400: '#8f857a', ink300: '#b7aea3',
  ink200: '#d9d2c8', ink100: '#ece7df', ink50: '#f6f3ee', paper: '#faf8f5', white: '#ffffff',
  gold700: '#7a5518', gold600: '#946a22', gold500: '#b8893a', gold400: '#d4a853',
  gold300: '#e6c47e', gold100: '#f5e8c8', gold50: '#fbf5e6',
};

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [label, fg, bg, minimum]  — 4.5 body text, 3 large text / UI components.
const pairs = [
  ['body text on paper', 'ink900', 'paper', 4.5],
  ['muted text on paper', 'ink500', 'paper', 4.5],
  ['muted text on white card', 'ink500', 'white', 4.5],
  ['body text on subtle band', 'ink900', 'ink50', 4.5],
  ['muted text on subtle band', 'ink500', 'ink50', 4.5],
  ['link / accent text on paper', 'gold700', 'paper', 4.5],
  ['accent text on white card', 'gold700', 'white', 4.5],
  ['dark text on gold button', 'ink950', 'gold400', 4.5],
  ['dark text on gold button hover', 'ink950', 'gold300', 4.5],
  ['paper text on dark band', 'paper', 'ink950', 4.5],
  ['muted text on dark band', 'ink300', 'ink950', 4.5],
  ['gold heading on dark band', 'gold400', 'ink950', 3],
  ['gold text on dark band', 'gold300', 'ink950', 4.5],
  ['input border on white', 'ink400', 'white', 3],
  ['focus ring on paper', 'gold600', 'paper', 3],
  ['accent tint text', 'gold700', 'gold50', 4.5],
];

let failures = 0;
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(palette[fg], palette[bg]);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)} (>=${min})  ${label}  [${fg} / ${bg}]`);
}
console.log(`\n${failures} failure(s) of ${pairs.length}`);
process.exit(failures ? 1 : 0);
