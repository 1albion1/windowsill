/**
 * A drawn stand-in so the overlay is alive the first time you run it, before
 * any photos exist. It uses the same pose/mask pipeline as a real cat, so the
 * folder you drop cutouts into behaves exactly like this does.
 */

const FUR = '#e8883a';
const SHADE = '#c4682a';
const INK = '#3b2a20';

const svg = (width, height, body) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );

const SIT = svg(
  120,
  150,
  `<g fill="${FUR}">
     <path d="M92 134 C114 128 112 98 95 93 C105 110 97 122 86 125 Z"/>
     <ellipse cx="60" cy="112" rx="33" ry="30"/>
     <ellipse cx="60" cy="86" rx="23" ry="27"/>
     <circle cx="60" cy="54" r="26"/>
     <path d="M38 39 L33 11 L58 31 Z"/>
     <path d="M82 39 L87 11 L62 31 Z"/>
   </g>
   <g fill="${SHADE}">
     <path d="M40 37 L37 19 L54 32 Z"/>
     <path d="M80 37 L83 19 L66 32 Z"/>
   </g>
   <g fill="${INK}">
     <circle cx="50" cy="53" r="3.4"/><circle cx="70" cy="53" r="3.4"/>
     <path d="M56 63 L64 63 L60 68 Z"/>
   </g>`,
);

const WALK = svg(
  152,
  112,
  `<g fill="${FUR}">
     <path d="M20 78 C3 70 6 40 22 40 C13 54 18 66 30 69 Z"/>
     <ellipse cx="74" cy="64" rx="44" ry="24"/>
     <circle cx="120" cy="50" r="22"/>
     <path d="M102 36 L99 11 L120 30 Z"/>
     <path d="M136 34 L143 11 L122 28 Z"/>
     <rect x="42" y="80" width="11" height="22" rx="5.5"/>
     <rect x="62" y="80" width="11" height="22" rx="5.5"/>
     <rect x="92" y="80" width="11" height="22" rx="5.5"/>
     <rect x="110" y="80" width="11" height="22" rx="5.5"/>
   </g>
   <g fill="${SHADE}">
     <path d="M104 34 L102 18 L117 30 Z"/>
     <path d="M134 32 L139 17 L124 28 Z"/>
   </g>
   <g fill="${INK}">
     <circle cx="128" cy="48" r="3.2"/>
     <path d="M136 56 L142 56 L139 60 Z"/>
   </g>`,
);

const SLEEP = svg(
  156,
  86,
  `<g fill="${FUR}">
     <ellipse cx="82" cy="54" rx="56" ry="28"/>
     <circle cx="40" cy="52" r="22"/>
     <path d="M26 38 L22 16 L44 32 Z"/>
     <path d="M56 36 L62 15 L42 30 Z"/>
     <path d="M132 70 C150 66 150 44 134 42 C142 54 138 62 126 64 Z"/>
   </g>
   <g fill="${SHADE}">
     <path d="M28 37 L26 23 L40 33 Z"/>
     <path d="M55 35 L59 22 L46 31 Z"/>
   </g>
   <g stroke="${INK}" stroke-width="2.4" stroke-linecap="round" fill="none">
     <path d="M28 53 q4 3.5 8 0"/>
     <path d="M46 53 q4 3.5 8 0"/>
   </g>`,
);

export const FALLBACK_CAT = {
  id: '__sample__',
  name: 'Sample cat (drop your own into the cats folder)',
  height: 130,
  speed: 1,
  poses: { sit: SIT, idle: SIT, walk: WALK, run: WALK, groom: SIT, sleep: SLEEP },
};
