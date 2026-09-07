import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Sliders, Fx, Folder } from './Icons';
import Slider from './Slider';

// Right icon rail. The fader at the top is the MASTER VOLUME (a smooth Animated
// slider so dragging stays glitch-free while audio plays). Edit arms the sample
// editor; the folder opens the library.
function RightRail({ onOpenLibrary, volume, onVolume }) {
  return (
    <View style={styles.rail}>
      <Slider vertical value={volume} min={0} max={1} pad={14} onChange={onVolume} style={styles.fader} />
      <View style={styles.btn}><Sliders size={18} color={theme.textDim} /></View>
      <View style={styles.btn}><Fx size={16} color={theme.textDim} /></View>
      <Pressable style={styles.btn} onPress={onOpenLibrary}><Folder size={18} color={theme.text} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 52, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 2 },
  fader: { width: 40, flex: 1, minHeight: 70, marginBottom: 8 },
  btn: { width: 40, height: 40, borderRadius: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});

export default React.memo(RightRail);
