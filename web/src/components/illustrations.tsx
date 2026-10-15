/**
 * Drawn stand-ins for photographs: one scene per production step, and a
 * kitchen or a row of cubicles for a project, in the project's own material
 * colour. Shown until an editor uploads a real photo in the admin — and
 * honest about being drawings, rather than borrowed stock images passed off
 * as this factory's line or its customers' rooms.
 *
 * Pure SVG, no state: these render on the server.
 */

const GOLD = '#d4a853';
const GOLD_LIGHT = '#e6c47e';
const KRAFT = '#8a6a45';

/** Scale a hex colour's channels — below 1 darkens, above 1 lightens. */
function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}

/* --------------------------------------------------------------------------
   Production steps (viewBox 400 × 500; the art keeps to the top part, the
   card lays its text over the bottom)
   -------------------------------------------------------------------------- */

function Backdrop({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="30%" r="65%">
          <stop offset="0" stopColor={GOLD} stopOpacity="0.28" />
          <stop offset="1" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="#fff" strokeOpacity="0.04" />
        </pattern>
      </defs>
      <rect width="400" height="500" fill="#1a1714" />
      <rect width="400" height="500" fill={`url(#${id}-grid)`} />
      <rect width="400" height="500" fill={`url(#${id}-glow)`} />
    </>
  );
}

/** An isometric sheet (a flat diamond), centred on (cx, cy). */
const sheet = (cx: number, cy: number, w: number, h: number) =>
  `${cx - w},${cy} ${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h}`;

function Impregnation() {
  return (
    <svg viewBox="0 0 400 500" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <Backdrop id="s1" />
      {/* the paper roll */}
      <circle cx="105" cy="105" r="58" fill={KRAFT} stroke="#000" strokeOpacity="0.3" />
      <circle cx="105" cy="105" r="42" fill="none" stroke="#000" strokeOpacity="0.18" />
      <circle cx="105" cy="105" r="26" fill="none" stroke="#000" strokeOpacity="0.18" />
      <circle cx="105" cy="105" r="11" fill="#2a2420" />
      {/* the sheet, down through the resin bath and up to the dryer */}
      <path
        d="M150 140 C 185 175, 195 205, 200 250 C 205 205, 255 165, 310 112"
        fill="none"
        stroke={GOLD_LIGHT}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="120" y="215" width="170" height="70" rx="12" fill={GOLD} fillOpacity="0.22" stroke={GOLD} strokeWidth="2" />
      <path d="M122 232 q 14 -8 28 0 t 28 0 t 28 0 t 28 0 t 28 0 t 28 0" fill="none" stroke={GOLD} strokeWidth="2" />
      <circle cx="200" cy="252" r="12" fill="#3a342d" stroke={GOLD} strokeWidth="2" />
      <circle cx="318" cy="104" r="20" fill="#3a342d" stroke={GOLD} strokeWidth="2" />
      {/* drops */}
      {[150, 178, 236, 262].map((x, i) => (
        <path key={x} d={`M${x} ${196 - (i % 2) * 10} q 5 8 0 12 q -5 -4 0 -12`} fill={GOLD} opacity="0.7" />
      ))}
    </svg>
  );
}

function Layering() {
  const layers = 8;
  return (
    <svg viewBox="0 0 400 500" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <Backdrop id="s2" />
      {Array.from({ length: layers }, (_, i) => layers - 1 - i).map((i) => {
        const y = 140 + i * 17;
        const top = i === 0;
        return (
          <g key={i}>
            <polygon
              points={sheet(200, y, 140, 62)}
              fill={top ? GOLD_LIGHT : i % 2 ? KRAFT : '#7a5c3c'}
              stroke="#0f0d0b"
              strokeOpacity="0.5"
            />
            {top &&
              [-60, -30, 0, 30, 60].map((o) => (
                <line key={o} x1={200 - 70 + o} y1={y + 31 - o / 2.25 - 31} x2={200 + 70 + o} y2={y - o / 2.25} stroke="#7a5518" strokeOpacity="0.35" strokeWidth="3" />
              ))}
          </g>
        );
      })}
      {/* the protective overlay, about to land */}
      <polygon points={sheet(200, 92, 140, 62)} fill="#fff" fillOpacity="0.12" stroke="#fff" strokeOpacity="0.5" strokeDasharray="6 6" />
    </svg>
  );
}

function Pressing() {
  return (
    <svg viewBox="0 0 400 500" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <Backdrop id="s3" />
      {/* pistons */}
      <rect x="120" y="0" width="34" height="58" fill="#544b42" />
      <rect x="246" y="0" width="34" height="58" fill="#544b42" />
      {/* upper platen */}
      <rect x="60" y="56" width="280" height="54" rx="6" fill="#3a342d" stroke={GOLD} strokeWidth="2" />
      {/* the stack, squeezed */}
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x="78" y={124 + i * 8} width="244" height="7" fill={i === 0 ? GOLD_LIGHT : KRAFT} stroke="#0f0d0b" strokeOpacity="0.35" />
      ))}
      {/* lower platen */}
      <rect x="60" y="184" width="280" height="54" rx="6" fill="#3a342d" stroke={GOLD} strokeWidth="2" />
      {/* force */}
      {[90, 310].map((x) => (
        <path key={x} d={`M${x} 6 v 34 m -12 -12 l 12 12 l 12 -12`} fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {/* heat */}
      {[150, 200, 250].map((x) => (
        <path key={x} d={`M${x} 252 q 8 10 0 20 t 0 20`} fill="none" stroke="#e8743b" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      ))}
    </svg>
  );
}

function Cutting() {
  const teeth = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 40 : 48;
    return `${(285 + Math.cos(a) * r).toFixed(1)},${(105 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 400 500" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <Backdrop id="s4" />
      <polygon points={sheet(200, 170, 160, 74)} fill="#c49a6c" stroke="#0f0d0b" strokeOpacity="0.4" />
      <polygon points={`40,170 200,244 200,252 40,178`} fill="#8a6a45" />
      <polygon points={`200,244 360,170 360,178 200,252`} fill="#6b4f33" />
      {/* cut already made, and the line still to go */}
      <line x1="118" y1="208" x2="200" y2="170" stroke="#0f0d0b" strokeOpacity="0.6" strokeWidth="3" />
      <line x1="200" y1="170" x2="282" y2="132" stroke="#fff" strokeWidth="2" strokeDasharray="8 7" opacity="0.85" />
      <polygon points={teeth} fill="#b7aea3" stroke="#0f0d0b" strokeOpacity="0.4" />
      <circle cx="285" cy="105" r="12" fill="#3a342d" stroke={GOLD} strokeWidth="2" />
      {/* sawdust */}
      {[[250, 150], [262, 160], [240, 162], [272, 150]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill={GOLD_LIGHT} opacity="0.8" />
      ))}
    </svg>
  );
}

function Inspection() {
  return (
    <svg viewBox="0 0 400 500" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <Backdrop id="s5" />
      <polygon points={sheet(190, 190, 150, 70)} fill="#ecebe6" stroke="#0f0d0b" strokeOpacity="0.4" />
      <path d="M100 205 q 40 -30 70 -10 t 80 -20" fill="none" stroke="#8f857a" strokeOpacity="0.5" strokeWidth="2" />
      {/* magnifier */}
      <circle cx="225" cy="140" r="56" fill="#fff" fillOpacity="0.1" stroke={GOLD} strokeWidth="9" />
      <line x1="265" y1="180" x2="315" y2="232" stroke={GOLD} strokeWidth="14" strokeLinecap="round" />
      {/* approved */}
      <circle cx="105" cy="92" r="34" fill={GOLD} />
      <path d="M88 93 l 12 12 l 22 -24" fill="none" stroke="#0f0d0b" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {/* a thickness gauge */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={60 + i * 12} y1="268" x2={60 + i * 12} y2={i % 4 ? 278 : 286} stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
      ))}
    </svg>
  );
}

const STEP_ART = [Impregnation, Layering, Pressing, Cutting, Inspection];

/** The drawing for production step `position` (1-based). */
export function ProcessArt({ position }: { position: number }) {
  const Art = STEP_ART[(position - 1) % STEP_ART.length] ?? Impregnation;
  return <Art />;
}

/* --------------------------------------------------------------------------
   Projects (viewBox 600 × 450)
   -------------------------------------------------------------------------- */

function Kitchen({ color }: { color: string }) {
  const edge = shade(color, 0.78);
  const doors = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 600 450" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="k-light" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
        <pattern id="k-tile" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V20" fill="none" stroke="#b7aea3" strokeOpacity="0.5" />
        </pattern>
      </defs>
      <rect width="600" height="450" fill="#efe9df" />
      <rect y="372" width="600" height="78" fill="#cfc6b8" />
      <path d="M0 372 H600" stroke="#b7aea3" />
      {/* backsplash */}
      <rect x="40" y="190" width="520" height="62" fill="#e4ddd2" />
      <rect x="40" y="190" width="520" height="62" fill="url(#k-tile)" />
      {/* wall cabinets */}
      {doors.map((i) => (
        <g key={`u${i}`}>
          <rect x={52 + i * 126} y="52" width="118" height="128" rx="3" fill={color} stroke={edge} strokeWidth="2" />
          <rect x={52 + i * 126 + (i % 2 ? 10 : 100)} y="150" width="8" height="22" rx="2" fill="#2a2622" opacity="0.7" />
        </g>
      ))}
      {/* hood */}
      <polygon points="262,180 338,180 352,200 248,200" fill="#b7aea3" />
      {/* worktop and base cabinets */}
      <rect x="34" y="252" width="532" height="14" fill="#2a2622" />
      {doors.map((i) => (
        <g key={`b${i}`}>
          <rect x={52 + i * 126} y="270" width="118" height="98" rx="3" fill={color} stroke={edge} strokeWidth="2" />
          {i === 1 ? (
            <>
              <path d={`M${52 + i * 126} 302 h118 M${52 + i * 126} 335 h118`} stroke={edge} strokeWidth="2" />
              {[0, 1, 2].map((r) => (
                <rect key={r} x={52 + i * 126 + 44} y={282 + r * 33} width="30" height="5" rx="2" fill="#2a2622" opacity="0.7" />
              ))}
            </>
          ) : (
            <rect x={52 + i * 126 + 50} y="278" width="18" height="5" rx="2" fill="#2a2622" opacity="0.7" />
          )}
        </g>
      ))}
      {/* tap and a plant */}
      <path d="M440 252 v-26 q0 -10 10 -10 h14 v8" fill="none" stroke="#8f857a" strokeWidth="5" strokeLinecap="round" />
      <rect x="96" y="226" width="26" height="26" rx="4" fill="#d9d2c8" />
      <path d="M109 228 q-14 -22 -4 -36 M109 228 q2 -26 14 -34 M109 228 q-2 -18 -18 -24" fill="none" stroke="#5f7d55" strokeWidth="5" strokeLinecap="round" />
      <rect width="600" height="450" fill="url(#k-light)" />
    </svg>
  );
}

function Cubicles({ color }: { color: string }) {
  const edge = shade(color, 0.75);
  const pilaster = shade(color, 0.88);
  return (
    <svg viewBox="0 0 600 450" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="c-tile" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" stroke="#b7aea3" strokeOpacity="0.45" />
        </pattern>
        <linearGradient id="c-light" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect width="600" height="450" fill="#ebe7e1" />
      <rect width="600" height="450" fill="url(#c-tile)" />
      <rect y="384" width="600" height="66" fill="#c9c2b6" />
      {/* head rail */}
      <rect x="30" y="66" width="540" height="7" rx="3" fill="#b7aea3" />
      {[0, 1, 2, 3].map((i) => {
        const x = 40 + i * 132;
        return (
          <g key={i}>
            {/* pilaster */}
            <rect x={x} y="73" width="16" height="300" fill={pilaster} stroke={edge} />
            {/* door */}
            <rect x={x + 18} y="80" width="110" height="290" rx="3" fill={color} stroke={edge} strokeWidth="2" />
            <circle cx={x + 116} cy="230" r="5" fill="#8f857a" />
            <rect x={x + 112} y="244" width="8" height="12" rx="2" fill={i === 1 ? '#c0392b' : '#3e8e5a'} />
            {/* hinges */}
            <rect x={x + 18} y="100" width="5" height="14" fill="#8f857a" />
            <rect x={x + 18} y="330" width="5" height="14" fill="#8f857a" />
            {/* foot */}
            <rect x={x + 3} y="373" width="10" height="13" fill="#8f857a" />
          </g>
        );
      })}
      <rect x="568" y="73" width="16" height="300" fill={pilaster} stroke={edge} />
      <rect x="571" y="373" width="10" height="13" fill="#8f857a" />
      <rect width="600" height="450" fill="url(#c-light)" />
    </svg>
  );
}

/** The drawing for a project: the scene its product group asks for (set in the admin). */
export function ProjectArt({ color, scene }: { color: string; scene: string | null }) {
  return scene === 'cubicles' ? <Cubicles color={color} /> : <Kitchen color={color} />;
}
