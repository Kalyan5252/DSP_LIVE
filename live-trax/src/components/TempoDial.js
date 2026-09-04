import React, { useRef } from 'react';
import { Modal, View, Text, Pressable, PanResponder, StyleSheet } from 'react-native';
import { theme } from '../theme';

// Semicircular master-tempo dial (20–300 BPM). Drag the arc; onChange fires
// continuously so the running transport speeds up / slows down in real time.
const MIN = 20;
const MAX = 300;
const W = 280;
const H = 176;
const CX = W / 2;
const CY = 156;
const R = 122;
const TICKS = 29;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const bpmToT = (bpm) => (clamp(bpm, MIN, MAX) - MIN) / (MAX - MIN);
const tToDeg = (t) => -90 + t * 180;

export default function TempoDial({ visible, bpm, onClose, onChange }) {
  const setFromTouch = (x, y) => {
    const dx = x - CX;
    const dyUp = CY - y;
    let deg = (Math.atan2(dx, dyUp) * 180) / Math.PI;
    deg = clamp(deg, -90, 90);
    const t = (deg + 90) / 180;
    onChange(Math.round(MIN + t * (MAX - MIN)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => setFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
    })
  ).current;

  const t = bpmToT(bpm);

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
          <Text style={styles.heading}>Master Tempo</Text>

          <View style={styles.dialArea} {...pan.panHandlers}>
            {Array.from({ length: TICKS }).map((_, i) => {
              const tt = i / (TICKS - 1);
              const deg = tToDeg(tt);
              const active = tt <= t + 1e-6;
              const major = i % 4 === 0;
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.tick,
                    { height: major ? 16 : 10, backgroundColor: active ? theme.good : theme.surfaceActive, transform: [{ rotate: `${deg}deg` }, { translateY: -R }] },
                  ]}
                />
              );
            })}
            <View pointerEvents="none" style={[styles.handle, { transform: [{ rotate: `${tToDeg(t)}deg` }, { translateY: -R }] }]} />
            <View pointerEvents="none" style={styles.readout}>
              <Text style={styles.bpm}>{Math.round(bpm)}</Text>
              <Text style={styles.unit}>BPM</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable onPress={() => onChange(clamp(Math.round(bpm) - 1, MIN, MAX))} style={styles.fineBtn}><Text style={styles.fineTxt}>−</Text></Pressable>
            <Text style={styles.range}>{MIN}–{MAX}</Text>
            <Pressable onPress={() => onChange(clamp(Math.round(bpm) + 1, MIN, MAX))} style={styles.fineBtn}><Text style={styles.fineTxt}>+</Text></Pressable>
            <Pressable onPress={onClose} style={styles.done}><Text style={styles.doneTxt}>Done</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: theme.bgElevated, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  heading: { color: theme.text, fontSize: 16, fontWeight: '700', marginBottom: 8, alignSelf: 'flex-start' },
  dialArea: { width: W, height: H },
  tick: { position: 'absolute', left: CX - 1.5, top: CY - 1.5, width: 3, borderRadius: 2 },
  handle: { position: 'absolute', left: CX - 9, top: CY - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.good, borderWidth: 3, borderColor: theme.bgElevated },
  readout: { position: 'absolute', left: 0, right: 0, top: CY - 62, alignItems: 'center' },
  bpm: { color: theme.text, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { color: theme.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginTop: -2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  fineBtn: { width: 46, height: 44, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  fineTxt: { color: theme.text, fontSize: 22, fontWeight: '700' },
  range: { color: theme.textDim, fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'center' },
  done: { backgroundColor: theme.text, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 13, marginLeft: 6 },
  doneTxt: { color: theme.bg, fontWeight: '800', fontSize: 14 },
});
