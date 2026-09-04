// Central design tokens for Live Trax.
// A dark performance surface: near-black ground so the lit pads carry the color.

export const theme = {
  bg: '#0E0E12',
  bgElevated: '#16161D',
  surface: '#1E1E27',
  surfaceActive: '#2A2A36',
  border: '#2E2E3A',
  text: '#F2F2F7',
  textDim: '#8A8A99',
  textFaint: '#5A5A66',
  accent: '#5B8CFF',
  danger: '#FF5B6E',
  good: '#3ED598',
};

// Palette assigned to pads. Chosen to stay distinct when lit on a dark ground.
export const PAD_COLORS = [
  '#FF5B6E', // red
  '#FF8F3E', // orange
  '#FFD23E', // yellow
  '#3ED598', // green
  '#3EC5FF', // cyan
  '#5B8CFF', // blue
  '#A66BFF', // violet
  '#FF6BD6', // pink
];

export function colorForIndex(i) {
  return PAD_COLORS[i % PAD_COLORS.length];
}
