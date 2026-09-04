import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

// Top control bar: project name, master tempo, time signature, transport
// play/stop with a live beat indicator, quantize toggle, and stop-all.
export default function TransportBar({
  bpm, num, den, playing, quantize, beat, activeCount,
  onBpmChange, onOpenSignature, onTogglePlay, onToggleQuantize, onStopAll,
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.rowTop}>
        <Text style={styles.title}>Live Trax</Text>
        <View style={styles.spacer} />

        {/* Tempo */}
        <View style={styles.tempo}>
          <Pressable onPress={() => onBpmChange(bpm - 1)} style={styles.tempoBtn}>
            <Text style={styles.tempoBtnText}>−</Text>
          </Pressable>
          <View style={styles.tempoVal}>
            <Text style={styles.tempoNum}>{Math.round(bpm)}</Text>
            <Text style={styles.tempoUnit}>BPM</Text>
          </View>
          <Pressable onPress={() => onBpmChange(bpm + 1)} style={styles.tempoBtn}>
            <Text style={styles.tempoBtnText}>+</Text>
          </Pressable>
        </View>

        {/* Signature */}
        <Pressable style={styles.sig} onPress={onOpenSignature}>
          <Text style={styles.sigText}>{num}/{den}</Text>
        </Pressable>
      </View>

      <View style={styles.rowBottom}>
        <Pressable
          onPress={onTogglePlay}
          style={[styles.play, playing && styles.playActive]}
        >
          <Text style={[styles.playText, playing && { color: '#0E0E12' }]}>
            {playing ? '❚❚' : '►'}
          </Text>
        </Pressable>

        {/* Beat indicator */}
        <View style={styles.beats}>
          {Array.from({ length: num }).map((_, i) => {
            const on = playing && beat && beat.beatInBar === i;
            const downbeat = i === 0;
            return (
              <View
                key={i}
                style={[
                  styles.beatDot,
                  downbeat && styles.beatDotDown,
                  on && { backgroundColor: downbeat ? theme.good : theme.accent, transform: [{ scale: 1.35 }] },
                ]}
              />
            );
          })}
          <Text style={styles.barCount}>
            {playing && beat ? `bar ${beat.barIndex + 1}` : 'stopped'}
          </Text>
        </View>

        <View style={styles.spacer} />

        {/* Quantize */}
        <Pressable
          onPress={onToggleQuantize}
          style={[styles.quant, quantize === 'bar' && styles.quantActive]}
        >
          <Text style={[styles.quantText, quantize === 'bar' && { color: '#0E0E12' }]}>
            {quantize === 'bar' ? 'QUANTIZE: BAR' : 'QUANTIZE: OFF'}
          </Text>
        </Pressable>

        {/* Stop all */}
        <Pressable onPress={onStopAll} style={[styles.stop, activeCount > 0 && styles.stopActive]}>
          <Text style={[styles.stopText, activeCount > 0 && { color: '#fff' }]}>STOP</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spacer: { flex: 1 },
  title: { color: theme.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },

  tempo: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
  tempoBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  tempoBtnText: { color: theme.text, fontSize: 18, fontWeight: '700' },
  tempoVal: { alignItems: 'center', minWidth: 46 },
  tempoNum: { color: theme.text, fontSize: 16, fontWeight: '800' },
  tempoUnit: { color: theme.textFaint, fontSize: 8, fontWeight: '700', letterSpacing: 1 },

  sig: { backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 10 },
  sigText: { color: theme.text, fontSize: 16, fontWeight: '800' },

  play: { width: 44, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  playActive: { backgroundColor: theme.good, borderColor: theme.good },
  playText: { color: theme.text, fontSize: 15, fontWeight: '800' },

  beats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  beatDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: theme.surfaceActive },
  beatDotDown: { borderWidth: 1.5, borderColor: theme.textDim },
  barCount: { color: theme.textDim, fontSize: 11, marginLeft: 6, fontVariant: ['tabular-nums'] },

  quant: { borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 8 },
  quantActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  quantText: { color: theme.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  stop: { borderRadius: 8, borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 12, paddingVertical: 8 },
  stopActive: { backgroundColor: theme.danger, borderColor: theme.danger },
  stopText: { color: theme.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
