import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { SIGNATURES } from '../config';

// Time-signature chooser: presets plus a custom builder.
export default function SignaturePicker({ visible, num, den, onClose, onSelect }) {
  const [cn, setCn] = useState(num);
  const [cd, setCd] = useState(den);
  useEffect(() => { setCn(num); setCd(den); }, [num, den, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.heading}>Time signature</Text>

          <Text style={styles.label}>PRESETS</Text>
          <View style={styles.presetRow}>
            {SIGNATURES.map((s) => {
              const active = s.num === num && s.den === den;
              return (
                <Pressable key={`${s.num}/${s.den}`} onPress={() => onSelect(s.num, s.den)} style={[styles.preset, active && styles.presetActive]}>
                  <Text style={[styles.presetText, active && { color: '#0E0E12' }]}>{s.num}/{s.den}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>CUSTOM</Text>
          <View style={styles.customRow}>
            <View style={styles.stepper}>
              <Pressable onPress={() => setCn(Math.max(1, cn - 1))} style={styles.stepBtn}><Text style={styles.stepBtnText}>−</Text></Pressable>
              <Text style={styles.stepVal}>{cn}</Text>
              <Pressable onPress={() => setCn(Math.min(15, cn + 1))} style={styles.stepBtn}><Text style={styles.stepBtnText}>+</Text></Pressable>
            </View>
            <Text style={styles.slash}>/</Text>
            <View style={styles.denRow}>
              {[4, 8].map((d) => (
                <Pressable key={d} onPress={() => setCd(d)} style={[styles.den, cd === d && styles.denActive]}>
                  <Text style={[styles.denText, cd === d && { color: '#0E0E12' }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.apply} onPress={() => onSelect(cn, cd)}>
              <Text style={styles.applyText}>Use {cn}/{cd}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '80%', maxWidth: 520, backgroundColor: theme.bgElevated, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.border },
  heading: { color: theme.text, fontSize: 16, fontWeight: '700', marginBottom: 14 },
  label: { color: theme.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8, marginTop: 6 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  preset: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  presetActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  presetText: { color: theme.text, fontWeight: '700', fontSize: 15 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  slash: { color: theme.textDim, fontSize: 20, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
  stepBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  stepBtnText: { color: theme.text, fontSize: 18, fontWeight: '700' },
  stepVal: { color: theme.text, fontSize: 16, fontWeight: '700', minWidth: 22, textAlign: 'center' },
  denRow: { flexDirection: 'row', gap: 6 },
  den: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  denActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  denText: { color: theme.text, fontWeight: '700', fontSize: 15 },
  apply: { marginLeft: 'auto', backgroundColor: theme.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  applyText: { color: theme.bg, fontWeight: '800', fontSize: 13 },
});
