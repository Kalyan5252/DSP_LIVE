import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { theme, PAD_COLORS } from '../theme';

// Long-press sheet for a loaded pad: rename, switch loop / one-shot mode,
// recolor, replace the audio, or clear the pad entirely.
export default function PadOptions({ pad, visible, onClose, onChange, onReplace, onClear }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (pad) setName(pad.name || '');
  }, [pad]);

  if (!pad) return null;

  const commitName = () => {
    const trimmed = name.trim();
    onChange({ name: trimmed.length ? trimmed : pad.name });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <Text style={styles.heading}>Edit pad</Text>

          <Text style={styles.label}>NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            placeholder="Pad name"
            placeholderTextColor={theme.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>PLAYBACK</Text>
          <View style={styles.rowGroup}>
            <Toggle
              active={pad.loop}
              label="Loop"
              onPress={() => onChange({ loop: true })}
            />
            <Toggle
              active={!pad.loop}
              label="One-shot"
              onPress={() => onChange({ loop: false })}
            />
          </View>

          <Text style={styles.label}>COLOR</Text>
          <View style={styles.swatchRow}>
            {PAD_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => onChange({ color: c })}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  pad.color === c && styles.swatchSelected,
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, styles.replace]} onPress={onReplace}>
              <Text style={styles.actionText}>Replace sound</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.clear]} onPress={onClear}>
              <Text style={[styles.actionText, { color: theme.danger }]}>Clear pad</Text>
            </Pressable>
          </View>

          <Pressable style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Toggle({ active, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, active && styles.toggleActive]}
    >
      <Text style={[styles.toggleText, active && { color: '#0E0E12' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: theme.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    marginBottom: 16,
  },
  heading: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 18,
  },
  label: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  rowGroup: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  toggle: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  toggleText: {
    color: theme.textDim,
    fontWeight: '700',
    fontSize: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: theme.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  replace: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  clear: {
    backgroundColor: 'transparent',
    borderColor: theme.danger,
  },
  actionText: {
    color: theme.text,
    fontWeight: '700',
    fontSize: 14,
  },
  done: {
    backgroundColor: theme.text,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doneText: {
    color: theme.bg,
    fontWeight: '800',
    fontSize: 15,
  },
});
