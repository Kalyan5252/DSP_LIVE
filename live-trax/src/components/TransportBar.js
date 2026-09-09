import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Home, Play, Pause, Chevron, Metronome, Pencil } from './Icons';
import syncStore from '../audio/syncStore';
import CpuMeter from './CpuMeter';

// Top toolbar: home + project, transport (play, tempo, signature), and quantize.
// The beat dot reads the native transport directly (via syncStore), so it stays
// sample-accurate without re-rendering the rest of the app.
export default function TransportBar({
  projectName, bpm, num, den, playing, quantizeLabel, quantizeActive, editActive,
  onHome, onTogglePlay, onOpenTempo, onOpenSignature, onOpenQuantize, onToggleEdit,
}) {
  const [beat, setBeat] = useState({ playing: false, beatInBar: 0 });
  useEffect(() => {
    setBeat(syncStore.getTransport());
    return syncStore.subscribeTransport((t) => setBeat({ playing: t.playing, beatInBar: t.beatInBar }));
  }, []);

  const beatOn = (playing || beat.playing);
  const downbeat = beatOn && beat.beatInBar === 0;

  return (
    <View style={styles.bar}>
      <Pressable style={styles.iconBtn} onPress={onHome}><Home size={20} color={theme.text} /></Pressable>
      <View style={styles.project}>
        <Text style={styles.projectText} numberOfLines={1}>{projectName || 'Live Trax'}</Text>
      </View>
      <Pressable style={styles.chevBtn}><Chevron size={12} color={theme.textDim} /></Pressable>

      <View style={styles.group}>
        <Pressable onPress={onTogglePlay} style={[styles.play, playing && styles.playActive]}>
          {playing ? <Pause size={16} color="#0E0E12" /> : <Play size={16} color={theme.text} />}
        </Pressable>

        <Pressable onPress={onOpenTempo} style={styles.tempo}>
          <Metronome size={16} color={theme.textDim} />
          <View style={[styles.beatDot, beatOn && { backgroundColor: downbeat ? theme.good : theme.accent }]} />
          <Text style={styles.tempoNum}>{Math.round(bpm)}</Text>
          <Chevron size={11} color={theme.textDim} />
        </Pressable>

        <Pressable onPress={onOpenSignature} style={styles.sig}>
          <Text style={styles.sigText}>{num}/{den}</Text>
          <Chevron size={11} color={theme.textDim} />
        </Pressable>
      </View>

      <View style={styles.spacer} />

      {__DEV__ ? <CpuMeter /> : null}

      <Pressable onPress={onToggleEdit} style={[styles.edit, editActive && styles.editActive]}>
        <Pencil size={15} color={editActive ? '#0E0E12' : theme.textDim} />
        <Text style={[styles.editTxt, editActive && { color: '#0E0E12' }]}>Edit</Text>
      </Pressable>

      <Pressable onPress={onOpenQuantize} style={[styles.quant, quantizeActive && styles.quantActive]}>
        <Text style={styles.quantCap}>Q</Text>
        <Text style={[styles.quantText, quantizeActive && { color: '#0E0E12' }]}>{quantizeLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: theme.bgElevated, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  iconBtn: { width: 42, height: 40, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  project: { height: 40, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', paddingHorizontal: 12, maxWidth: 150 },
  projectText: { color: theme.text, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  chevBtn: { width: 34, height: 40, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },

  group: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 8, paddingVertical: 4 },
  play: { width: 34, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceActive },
  playActive: { backgroundColor: theme.good },
  tempo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  beatDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.surfaceActive },
  tempoNum: { color: theme.good, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  sig: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: theme.border },
  sigText: { color: theme.text, fontWeight: '800', fontSize: 14 },

  spacer: { flex: 1 },

  edit: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, marginRight: 8 },
  editActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  editTxt: { color: theme.textDim, fontWeight: '800', fontSize: 13 },
  quant: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 44, height: 40, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, justifyContent: 'center' },
  quantCap: { color: theme.textFaint, fontWeight: '800', fontSize: 11 },
  quantActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  quantText: { color: theme.textDim, fontWeight: '800', fontSize: 14 },
});
