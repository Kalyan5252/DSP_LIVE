import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Pencil, Sliders, Fx, Folder } from './Icons';

// The right icon rail: master fader, edit / mixer / FX (placeholders), the
// library (folder — opens the global sample library), and stop-all.
export default function RightRail({ onStopAll, onOpenLibrary, activeCount }) {
  return (
    <View style={styles.rail}>
      <View style={styles.fader}>
        <View style={styles.faderTrack} />
        <View style={styles.faderHandle} />
      </View>

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

const styles = StyleSheet.create({
  rail: { width: 52, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  fader: { width: 40, flex: 1, minHeight: 50, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', paddingTop: 8, marginBottom: 6 },
  faderTrack: { position: 'absolute', top: 8, bottom: 8, width: 3, borderRadius: 2, backgroundColor: theme.surfaceActive },
  faderHandle: { width: 22, height: 10, borderRadius: 5, backgroundColor: theme.textDim },
  btn: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stop: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  stopActive: { backgroundColor: theme.danger, borderColor: theme.danger },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: theme.textDim },
});
