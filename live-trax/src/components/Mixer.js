import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { INSTRUMENTS } from '../config';
import Slider from './Slider';

const SOLO = '#F2C744';

// Mixer: one channel per instrument column — volume (vertical fader), Solo, Mute.
// Centered, padded, no-scroll modal (like the sample editor).
export default function Mixer({ visible, mixer, onVol, onToggleSolo, onToggleMute, onClose }) {
  const m = mixer || { vol: {}, solo: {}, mute: {} };
  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Mixer</Text>
            <Pressable style={styles.close} onPress={onClose}><Text style={styles.closeTxt}>✕</Text></Pressable>
          </View>

          <View style={styles.row}>
            {INSTRUMENTS.map((inst) => {
              const vol = typeof m.vol[inst.key] === 'number' ? m.vol[inst.key] : 1;
              const solo = !!m.solo[inst.key];
              const mute = !!m.mute[inst.key];
              return (
                <View key={inst.key} style={styles.channel}>
                  <View style={[styles.chip, { backgroundColor: inst.color }]} />
                  <Text style={styles.chName} numberOfLines={1}>{inst.name}</Text>
                  <View style={styles.faderBox}>
                    <Slider vertical value={vol} min={0} max={1} onChange={(v) => onVol(inst.key, v)} style={styles.fader} />
                  </View>
                  <Text style={styles.volTxt}>{Math.round(vol * 100)}</Text>
                  <Pressable onPress={() => onToggleSolo(inst.key)} style={[styles.btn, solo && { backgroundColor: SOLO, borderColor: SOLO }]}>
                    <Text style={[styles.btnTxt, solo && { color: '#0E0E12' }]}>S</Text>
                  </Pressable>
                  <Pressable onPress={() => onToggleMute(inst.key)} style={[styles.btn, mute ? styles.muteOn : styles.muteOff]}>
                    <Text style={[styles.btnTxt, mute ? { color: '#0E0E12' } : { color: withAlpha(theme.danger, 0.75) }]}>M</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function withAlpha(hex, a) {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return `${hex}${v}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '94%', maxWidth: 900, backgroundColor: theme.bgElevated, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: theme.text, fontSize: 17, fontWeight: '800' },
  close: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  closeTxt: { color: theme.textDim, fontSize: 15, fontWeight: '700' },

  row: { flexDirection: 'row', gap: 8 },
  channel: { flex: 1, alignItems: 'center', backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingVertical: 10, paddingHorizontal: 4 },
  chip: { width: '70%', height: 5, borderRadius: 3, marginBottom: 6 },
  chName: { color: theme.text, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  faderBox: { height: 150, alignItems: 'center', justifyContent: 'center' },
  fader: { width: 40, flex: 1, minHeight: 120 },
  volTxt: { color: theme.textDim, fontSize: 11, fontWeight: '700', marginTop: 6, marginBottom: 8, fontVariant: ['tabular-nums'] },
  btn: { width: 40, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceActive, marginBottom: 6 },
  btnTxt: { color: theme.textDim, fontWeight: '900', fontSize: 13 },
  muteOn: { backgroundColor: theme.danger, borderColor: theme.danger },
  muteOff: { backgroundColor: 'transparent', borderColor: 'rgba(255,91,110,0.4)' },
});
