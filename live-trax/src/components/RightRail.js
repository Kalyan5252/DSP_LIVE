import React, { useRef, useState } from 'react';
import { View, Pressable, PanResponder, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Pencil, Sliders, Fx, Folder } from './Icons';

// Right icon rail. The fader at the top is a working MASTER VOLUME slider; edit /
// mixer / FX are placeholders; the folder opens the library.
export default function RightRail({ onOpenLibrary, volume, onVolume }) {
  return (
    <View style={styles.rail}>
      <MasterFader value={volume} onChange={onVolume} />
      <View style={styles.btn}><Pencil size={18} color={theme.textDim} /></View>
      <View style={styles.btn}><Sliders size={18} color={theme.textDim} /></View>
      <View style={styles.btn}><Fx size={16} color={theme.textDim} /></View>
      <Pressable style={styles.btn} onPress={onOpenLibrary}><Folder size={18} color={theme.text} /></Pressable>
    </View>
  );
}

// Vertical master-volume slider (0..1). PAD keeps the handle fully visible at the
// top and bottom instead of clipping at the container edges.
const PAD = 14;

function MasterFader({ value, onChange }) {
  const [h, setH] = useState(160);
  const hRef = useRef(h);
  hRef.current = h;

  const setFromY = (y) => {
    const inner = Math.max(1, hRef.current - PAD * 2);
    onChange(clamp01(1 - (y - PAD) / inner));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromY(e.nativeEvent.locationY),
      onPanResponderMove: (e) => setFromY(e.nativeEvent.locationY),
    })
  ).current;

  const pct = clamp01(value);
  return (
    <View style={styles.fader} onLayout={(e) => setH(e.nativeEvent.layout.height)} {...pan.panHandlers}>
      <View style={styles.inner}>
        <View style={styles.faderTrack} />
        <View style={[styles.faderFill, { height: `${pct * 100}%` }]} />
        <View style={[styles.faderHandle, { bottom: `${pct * 100}%`, marginBottom: -6 }]} />
      </View>
    </View>
  );
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const styles = StyleSheet.create({
  rail: { width: 52, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 2 },
  fader: { width: 40, flex: 1, minHeight: 70, marginBottom: 8, paddingVertical: PAD, alignItems: 'center' },
  inner: { flex: 1, width: 26, alignItems: 'center', justifyContent: 'flex-end' },
  faderTrack: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: theme.surfaceActive },
  faderFill: { position: 'absolute', bottom: 0, width: 3, backgroundColor: theme.good, borderRadius: 2 },
  faderHandle: { position: 'absolute', width: 26, height: 12, borderRadius: 6, backgroundColor: theme.text, borderWidth: 1, borderColor: theme.border },
  btn: { width: 40, height: 40, borderRadius: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
