import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

// Tempo editor opened from the toolbar BPM readout.
export default function TempoModal({ visible, bpm, onClose, onChange }) {
  const set = (v) => onChange(Math.max(40, Math.min(300, Math.round(v))));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.heading}>Tempo</Text>

          <View style={styles.big}>
            <Pressable onPress={() => set(bpm - 1)} style={styles.stepBtn}><Text style={styles.stepTxt}>−</Text></Pressable>
            <View style={styles.readout}>
              <Text style={styles.bpm}>{Math.round(bpm)}</Text>
              <Text style={styles.unit}>BPM</Text>
            </View>
            <Pressable onPress={() => set(bpm + 1)} style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></Pressable>
          </View>

          <Text style={styles.label}>QUICK</Text>
          <View style={styles.presets}>
            {[90, 100, 120, 128, 140, 174].map((v) => (
              <Pressable key={v} onPress={() => set(v)} style={[styles.preset, Math.round(bpm) === v && styles.presetActive]}>
                <Text style={[styles.presetTxt, Math.round(bpm) === v && { color: '#0E0E12' }]}>{v}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.done} onPress={onClose}><Text style={styles.doneTxt}>Done</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 340, backgroundColor: theme.bgElevated, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: theme.border },
  heading: { color: theme.text, fontSize: 17, fontWeight: '700', marginBottom: 16 },
  big: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 16 },
  stepBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: theme.text, fontSize: 24, fontWeight: '700' },
  readout: { alignItems: 'center', minWidth: 90 },
  bpm: { color: theme.text, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { color: theme.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  label: { color: theme.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  preset: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  presetActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  presetTxt: { color: theme.text, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] },
  done: { backgroundColor: theme.text, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  doneTxt: { color: theme.bg, fontWeight: '800', fontSize: 15 },
});
