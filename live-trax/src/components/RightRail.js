import React, { useRef, useState } from 'react';
import { View, Pressable, PanResponder, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Pencil, Sliders, Fx, Folder } from './Icons';

// Right icon rail. The fader at the top is a working MASTER VOLUME slider; edit /
// mixer / FX are placeholders; the folder opens the library; stop-all at the base.
export default function RightRail({ onStopAll, onOpenLibrary, activeCount, volume, onVolume }) {
  return (
    <View style={styles.rail}>
      <MasterFader value={volume} onChange={onVolume} />
      <View style={styles.btn}><Pencil size={18} color={theme.textDim} /></View>
      <View style={styles.btn}><Sliders size={18} color={theme.textDim} /></View>
      <View style={styles.btn}><Fx size={16} color={theme.textDim} /></View>
      <Pressable style={styles.btn} onPress={onOpenLibrary}><Folder size={18} color={theme.text} /></Pressable>
      <Pressable onPress={onStopAll} style={[styles.stop, activeCount > 0 && styles.stopActive]}>
        <View style={[styles.stopSquare, activeCount > 0 && { backgroundColor: '#fff' }]} />
      </Pressable>
    </View>
  );
}

// A vertical master-volume slider (0..1). Drag anywhere on the track.
function MasterFader({ value, onChange }) {
  const [h, setH] = useState(120);
  const hRef = useRef(h);
  hRef.current = h;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange(clamp01(1 - e.nativeEvent.locationY / hRef.current)),
      onPanResponderMove: (e) => onChange(clamp01(1 - e.nativeEvent.locationY / hRef.current)),
    })
  ).current;

  const pct = clamp01(value);
  return (
    <View
      style={styles.fader}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      {...pan.panHandlers}
    >
      <View style={styles.faderTrack} />
      <View style={[styles.faderFill, { height: `${pct * 100}%` }]} />
      <View style={[styles.faderHandle, { bottom: `${pct * 100}%`, marginBottom: -6 }]} />
    </View>
  );
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const styles = StyleSheet.create({
  rail: { width: 52, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  fader: { width: 40, flex: 1, minHeight: 60, borderRadius: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 6, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'center' },
  faderTrack: { position: 'absolute', top: 8, bottom: 8, width: 3, borderRadius: 2, backgroundColor: theme.surfaceActive },
  faderFill: { position: 'absolute', bottom: 0, width: 3, backgroundColor: theme.good, borderRadius: 2 },
  faderHandle: { position: 'absolute', width: 26, height: 12, borderRadius: 6, backgroundColor: theme.text, borderWidth: 1, borderColor: theme.border },
  btn: { width: 40, height: 40, borderRadius: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stop: { width: 40, height: 40, borderRadius: 8, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  stopActive: { backgroundColor: theme.danger, borderColor: theme.danger },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: theme.textDim },
});
