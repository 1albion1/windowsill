/**
 * What makes a cutout photo read as a living cat is not the artwork — it is
 * that it keeps changing its mind. Each state names the poses it would like
 * (first match wins, so a one-photo cat still works), how long it lasts, and
 * where it tends to go next.
 */
export const STATES = {
  idle: {
    poses: ['idle', 'stand', 'sit'],
    duration: [1500, 4500],
    speed: 0,
    next: { walk: 4, sit: 3, groom: 1.5, chase: 0.8 },
  },
  sit: {
    poses: ['sit', 'idle', 'stand'],
    duration: [3000, 11000],
    speed: 0,
    next: { walk: 4, groom: 2, sleep: 4, idle: 1, chase: 0.6 },
  },
  walk: {
    poses: ['walk', 'stand', 'idle', 'sit'],
    duration: [2200, 7000],
    speed: 42,
    next: { sit: 3, idle: 2, walk: 1.5, run: 0.8, groom: 1 },
  },
  run: {
    poses: ['run', 'walk', 'stand', 'idle'],
    duration: [900, 2400],
    speed: 145,
    next: { walk: 3, sit: 2, idle: 1 },
  },
  groom: {
    poses: ['groom', 'sit', 'idle'],
    duration: [2500, 6500],
    speed: 0,
    next: { sit: 3, walk: 2, sleep: 2.5 },
  },
  sleep: {
    poses: ['sleep', 'lie', 'sit', 'idle'],
    duration: [15000, 45000],
    speed: 0,
    next: { sit: 4, groom: 1.5, idle: 1 },
  },
  chase: {
    // 'chase' is listed first so the name works as a filename like every other
    // behaviour, even though most cats will fall through to 'run'.
    poses: ['chase', 'run', 'walk', 'stand', 'idle'],
    duration: [2500, 7000],
    speed: 105,
    next: { sit: 2.5, walk: 2, idle: 1 },
  },
  // Physics-driven; entered and left by the simulation, never by the dice.
  fall: { poses: ['fall', 'surprised', 'run', 'stand', 'idle', 'sit'], duration: [0, 0], speed: 0, next: {} },
  held: { poses: ['held', 'surprised', 'fall', 'stand', 'idle', 'sit'], duration: [0, 0], speed: 0, next: {} },
};

export const RECOVERY_STATE = 'sit';

export function pickNext(state) {
  const weights = STATES[state]?.next ?? {};
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return RECOVERY_STATE;

  let roll = Math.random() * total;
  for (const [candidate, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return candidate;
  }
  return RECOVERY_STATE;
}

export function rollDuration(state) {
  const [min, max] = STATES[state]?.duration ?? [2000, 4000];
  return min + Math.random() * (max - min);
}

/** First pose the cat actually has, falling back to whatever it does have. */
export function resolvePose(poses, state) {
  for (const name of STATES[state]?.poses ?? []) {
    if (poses[name]) return poses[name];
  }
  const available = Object.values(poses);
  return available[0] ?? null;
}
