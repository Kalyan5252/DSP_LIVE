import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Home, Play, Pause, Record, Chevron, Metronome } from './Icons';

const TABS = ['Loop', 'Seq', 'Drum', 'Song'];

// Single-row toolbar matching the Remixlive reference: home + project, transport
// (play, tempo, signature), the Loop/Seq/Drum/Song tabs, quantize, and record.
export default function TransportBar({
  bpm, num, den, playing, quantize, beat, recArmed, activeTab,
  onTogglePlay, onOpenTempo, onOpenSignature, onToggleQuantize, onToggleRec, onTab,
}) {
  const beatOn = playing && beat;
  const downbeat = beatOn && beat.beatInBar === 0;

  return (
    <View style={styles.bar}>
      {/* left: home + project */}
      <Pressable style={styles.iconBtn}><Home size={20} color={theme.text} /></Pressable>
      <View style={styles.project}>
        <Text style={styles.projectText} numberOfLines={1}>Live Trax</Text>
      </View>
      <Pressable style={styles.chevBtn}><Chevron size={12} color={theme.textDim} /></Pressable>

      {/* transport group */}
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

      {/* tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t === activeTab;
          return (
            <Pressable key={t} onPress={() => onTab(t)} style={[styles.tab, active && styles.tabActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* right: quantize + record */}
      <Pressable onPress={onToggleQuantize} style={[styles.quant, quantize === 'bar' && styles.quantActive]}>
        <Text style={[styles.quantText, quantize === 'bar' && { color: '#0E0E12' }]}>Q</Text>
      </Pressable>
      <Pressable onPress={onToggleRec} style={[styles.rec, recArmed && styles.recActive]}>
        <Record size={14} color={recArmed ? '#fff' : theme.danger} />
        <Text style={[styles.recText, recArmed && { color: '#fff' }]}>Rec</Text>
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
  project: { height: 40, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', paddingHorizontal: 12, maxWidth: 120 },
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

  tabs: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  tabActive: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  tabText: { color: theme.textDim, fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: theme.text },

  quant: { width: 38, height: 40, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
  quantActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  quantText: { color: theme.textDim, fontWeight: '800', fontSize: 14 },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 12 },
  recActive: { backgroundColor: theme.danger, borderColor: theme.danger },
  recText: { color: theme.text, fontWeight: '800', fontSize: 13 },
});
