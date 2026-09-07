import React from 'react';
import Svg, { Circle } from 'react-native-svg';

// Remixlive-style loop-progress ring: split into one segment per BAR of the loop.
// The segment for the currently-playing bar is highlighted (white); the rest are
// dim. A 6-bar loop -> 6 segments.
//
//   size    outer box (px)
//   stroke  ring thickness
//   bars    number of segments (>=1)
//   current index of the lit bar (0..bars-1), or -1 for none
//   color   dim segment color; hi = highlight color (default white)
function SegmentRing({ size = 15, stroke = 2, bars = 1, current = -1, color = '#fff', hi = '#fff', dim = 0.35 }) {
  const n = Math.max(1, bars | 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  // Gap between segments (shrinks when there are many bars so they still read).
  const gapDeg = n <= 1 ? 0 : Math.min(24, 130 / n);
  const unit = c / n;                    // arc length per segment slot
  const gapLen = (gapDeg / 360) * c;
  const segLen = Math.max(0.5, unit - gapLen);

  const dimColor = withAlpha(color, dim);

  // Base ring: repeating dashes (one per bar). rotate -90 so segment 0 starts at top.
  const base = (
    <Circle
      cx={cx} cy={cy} r={r}
      stroke={dimColor} strokeWidth={stroke} fill="none"
      strokeDasharray={n === 1 ? undefined : `${segLen} ${gapLen}`}
      strokeLinecap="round"
      strokeDashoffset={0}
      transform={`rotate(-90 ${cx} ${cy})`}
    />
  );

  // Highlight: a single dash placed at the current bar.
  const hasHi = current >= 0 && current < n;
  const highlight = hasHi ? (
    <Circle
      cx={cx} cy={cy} r={r}
      stroke={hi} strokeWidth={stroke} fill="none"
      strokeDasharray={`${segLen} ${c}`}
      strokeDashoffset={-(current * unit)}
      strokeLinecap="round"
      transform={`rotate(-90 ${cx} ${cy})`}
    />
  ) : null;

  return (
    <Svg width={size} height={size}>
      {base}
      {highlight}
    </Svg>
  );
}

function withAlpha(hex, a) {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return `${hex}${v}`;
}

export default React.memo(SegmentRing);
