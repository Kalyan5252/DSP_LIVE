import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import engine from '../audio/engine';

// Dev-only audio-thread load readout.
//
// "CPU throttling" is only actionable as a number measured on the device, inside
// the render callback — JS-side timing cannot see the audio thread at all. This
// shows what the engine reports:
//
//   avg   smoothed callback time / callback deadline
//   pk    worst single callback since the last poll (reading clears it)
//   ovr   callbacks that missed the deadline — every one of these is a dropout
//
// 1.00 means a callback used its entire budget. Anything sustained above ~0.5
// is trouble on a phone once the OS starts sharing the core. Tap to reset the
// overrun count.
export default function CpuMeter({ intervalMs = 500 }) {
  const [load, setLoad] = useState(null);
  const baseOverruns = useRef(0);

  useEffect(() => {
    const read = () => setLoad(engine.audioLoad());
    read();
    const t = setInterval(read, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  if (!load) return null;

  const avg = load.avg || 0;
  const peak = load.peak || 0;
  const ovr = Math.max(0, (load.overruns || 0) - baseOverruns.current);
  const color = ovr > 0 || peak >= 1 ? theme.danger : avg > 0.5 ? '#FFD23E' : theme.good;

  return (
    <Pressable
      onPress={() => { baseOverruns.current = load.overruns || 0; }}
      style={styles.wrap}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.txt}>
        {(avg * 100).toFixed(0)}% pk {(peak * 100).toFixed(0)}%{ovr > 0 ? `  ovr ${ovr}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 40, paddingHorizontal: 8, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  txt: { color: theme.textDim, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
