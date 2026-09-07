import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { QUANTIZE_OPTIONS } from '../config';

// Transition quantize chooser — how many master-clock beats to wait before a pad
// switch takes effect. "Off" switches instantly; 1 = next beat; 4 = next bar (4/4).
export default function QuantizePicker({ visible, value, onClose, onSelect }) {
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
          <Text style={styles.heading}>Transition quantize</Text>
          <Text style={styles.sub}>Switch pads after this many master beats</Text>
          <View style={styles.row}>
            {QUANTIZE_OPTIONS.map((o) => {
              const active = o.beats === value;
              return (
                <Pressable key={o.label} onPress={() => onSelect(o.beats)} style={[styles.opt, active && styles.optActive]}>
                  <Text style={[styles.optText, active && { color: '#0E0E12' }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '80%', maxWidth: 520, backgroundColor: theme.bgElevated, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.border },
  heading: { color: theme.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sub: { color: theme.textDim, fontSize: 12, marginBottom: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { minWidth: 54, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  optActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  optText: { color: theme.text, fontWeight: '800', fontSize: 15 },
});
