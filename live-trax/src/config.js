// Grid configuration for the Live Trax board.
//
// Like Remixlive, the board is organized as INSTRUMENT COLUMNS (each a colored
// track — Kick, Snare, …) and VARIATION ROWS (alternate loops for that track).
// The rule that makes it feel like an instrument: only ONE pad per column plays
// at a time, so picking a new row in a column swaps the loop for that track.

export const INSTRUMENTS = [
  { key: 'kick',   name: 'Kick',   color: '#E5484D' }, // red
  { key: 'snare',  name: 'Snare',  color: '#F76B15' }, // orange
  { key: 'tops',   name: 'Tops',   color: '#E2B72E' }, // yellow
  { key: 'bass',   name: 'Bass',   color: '#46A758' }, // green
  { key: 'chords', name: 'Chords', color: '#2EA5B8' }, // teal
  { key: 'keys',   name: 'Keys',   color: '#E5559F' }, // pink
  { key: 'lead',   name: 'Lead',   color: '#8E6BE5' }, // violet
  { key: 'fx',     name: 'FX',     color: '#4C74E5' }, // blue
];

// Variation rows. Rename freely — these are just the alternate-loop slots.
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Stable id for a pad at (instrumentKey, rowIndex).
export const padId = (instKey, rowIndex) => `${instKey}-${rowIndex}`;

// Supported time signatures (numerator/denominator). The transport lets the user
// pick any of these, or build a custom one.
export const SIGNATURES = [
  { num: 2, den: 4 },
  { num: 3, den: 4 },
  { num: 4, den: 4 },
  { num: 6, den: 8 },
  { num: 7, den: 8 },
];

// Launch/transition quantize values, in BEATS of the master clock. A pad switch
// takes effect on the next boundary of this many beats. Sub-beat values (1/4,
// 1/2) allow tight, fast transitions; larger values (4, 8) switch on bar lines.
export const QUANTIZE_OPTIONS = [
  { beats: 0, label: 'Off' },
  { beats: 0.25, label: '1/4' },
  { beats: 0.5, label: '1/2' },
  { beats: 1, label: '1' },
  { beats: 2, label: '2' },
  { beats: 4, label: '4' },
  { beats: 8, label: '8' },
];

export function quantizeLabel(beats) {
  const o = QUANTIZE_OPTIONS.find((x) => x.beats === beats);
  return o ? o.label : String(beats);
}
