import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, PanResponder, Dimensions } from 'react-native';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import { theme } from '../theme';
import { Play, Pause } from './Icons';
import syncStore from '../audio/syncStore';

export const DEFAULT_EDIT = { gain: 1, startFrac: 0, endFrac: 1, fadeInMs: 0, fadeOutMs: 0, playMode: 0 };
const MODES = [{ m: 0, label: 'Loop' }, { m: 1, label: 'One shot' }, { m: 2, label: 'Gate' }];

// On-screen sample editor (centered modal, like the tempo dial) — waveform with
// draggable start/end trim, play mode, gain, fades, and tempo, in the app style.
export default function SampleEditor({ visible, padId, name, bpm, waveform, edit, onChange, onSetBpm, onPreview, onClose }) {
  const e = { ...DEFAULT_EDIT, ...(edit || {}) };
  const [w, setW] = useState(Math.min(880, Dimensions.get('window').width * 0.9));
  const waveW = w - 0; // waveform spans the panel

  // live playhead (0..1 through the region) for this pad while previewing
  const [phase, setPhase] = useState(-1);
  useEffect(() => {
    if (!visible) return undefined;
    const apply = (v) => setPhase(v && v.s === 2 ? (v.ph || 0) : -1);
    apply(syncStore.getPad(padId));
    return syncStore.subscribePad(padId, apply);
  }, [visible, padId]);

  const patch = (p) => onChange && onChange(p);

  // ---- trim handle drag ----
  const startPan = useRef(makeHandlePan(() => e.startFrac, (f) => patch({ startFrac: clamp(f, 0, e.endFrac - 0.02) }), () => waveW)).current;
  const endPan = useRef(makeHandlePan(() => e.endFrac, (f) => patch({ endFrac: clamp(f, e.startFrac + 0.02, 1) }), () => waveW)).current;
  // keep the pan refs reading latest values
  startPan.get = () => e.startFrac; startPan.set = (f) => patch({ startFrac: clamp(f, 0, e.endFrac - 0.02) }); startPan.width = () => waveW;
  endPan.get = () => e.endFrac; endPan.set = (f) => patch({ endFrac: clamp(f, e.startFrac + 0.02, 1) }); endPan.width = () => waveW;

  const H = 150;
  const path = waveform && waveform.length ? buildWavePath(waveform, waveW, H) : '';
  const sx = e.startFrac * waveW;
  const ex = e.endFrac * waveW;
  const phx = phase >= 0 ? (e.startFrac + phase * (e.endFrac - e.startFrac)) * waveW : -1;

  const gainDb = linToDb(e.gain);
  const isPlaying = phase >= 0;

  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { width: w }]} onPress={() => {}} onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
          {/* header */}
          <View style={styles.header}>
            <Pressable style={[styles.play, isPlaying && styles.playActive]} onPress={onPreview}>
              {isPlaying ? <Pause size={16} color="#0E0E12" /> : <Play size={16} color={theme.text} />}
            </Pressable>
            <View style={styles.titleWrap}>
              <Text style={styles.title} numberOfLines={1}>{name || 'Sample'}</Text>
              <Text style={styles.sub}>{Math.round(bpm) || '--'} BPM</Text>
            </View>
            <Pressable style={styles.close} onPress={onClose}><Text style={styles.closeTxt}>✕</Text></Pressable>
          </View>

          {/* waveform + trim */}
          <View style={styles.wave}>
            <Svg width={waveW} height={H}>
              <Rect x={0} y={0} width={sx} height={H} fill="rgba(0,0,0,0.55)" />
              <Rect x={ex} y={0} width={Math.max(0, waveW - ex)} height={H} fill="rgba(0,0,0,0.55)" />
              {path ? <Path d={path} fill={theme.danger} opacity={0.9} /> : null}
              <Line x1={sx} y1={0} x2={sx} y2={H} stroke="#fff" strokeWidth={2} />
              <Line x1={ex} y1={0} x2={ex} y2={H} stroke="#fff" strokeWidth={2} />
              {phx >= 0 ? <Line x1={phx} y1={0} x2={phx} y2={H} stroke={theme.good} strokeWidth={2} /> : null}
            </Svg>
            {/* drag zones over the handles */}
            <View style={[styles.handle, { left: sx - 16 }]} {...startPan.panHandlers} />
            <View style={[styles.handle, { left: ex - 16 }]} {...endPan.panHandlers} />
          </View>

          {/* play mode */}
          <View style={styles.modes}>
            {MODES.map((o) => (
              <Pressable key={o.m} onPress={() => patch({ playMode: o.m })} style={[styles.mode, e.playMode === o.m && styles.modeActive]}>
                <Text style={[styles.modeTxt, e.playMode === o.m && { color: theme.danger }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* sliders */}
          <EditSlider label="Gain" value={gainDb} min={-24} max={12} unit="dB" fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} onChange={(db) => patch({ gain: dbToLin(db) })} />
          <View style={styles.row2}>
            <View style={styles.half}>
              <EditSlider label="Fade in" value={e.fadeInMs} min={0} max={2000} unit="ms" fmt={(v) => `${Math.round(v)}`} onChange={(ms) => patch({ fadeInMs: Math.round(ms) })} />
            </View>
            <View style={styles.half}>
              <EditSlider label="Fade out" value={e.fadeOutMs} min={0} max={2000} unit="ms" fmt={(v) => `${Math.round(v)}`} onChange={(ms) => patch({ fadeOutMs: Math.round(ms) })} />
            </View>
          </View>

          {/* tempo */}
          <View style={styles.tempoRow}>
            <Text style={styles.tLabel}>Tempo</Text>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm(half(bpm))}><Text style={styles.tBtnTxt}>÷2</Text></Pressable>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm((bpm || 120) - 1)}><Text style={styles.tBtnTxt}>−</Text></Pressable>
            <Text style={styles.tVal}>{(bpm || 120).toFixed(1)}</Text>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm((bpm || 120) + 1)}><Text style={styles.tBtnTxt}>+</Text></Pressable>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm(dbl(bpm))}><Text style={styles.tBtnTxt}>×2</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// A labeled horizontal slider (0..1 mapped to [min,max]).
function EditSlider({ label, value, min, max, unit, fmt, onChange }) {
  const [w, setW] = useState(240);
  const wRef = useRef(w); wRef.current = w;
  const set = (x) => { const f = clamp(x / Math.max(1, wRef.current), 0, 1); onChange(min + f * (max - min)); };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (ev) => set(ev.nativeEvent.locationX),
    onPanResponderMove: (ev) => set(ev.nativeEvent.locationX),
  })).current;
  const pct = clamp((value - min) / (max - min), 0, 1);
  return (
    <View style={styles.sliderWrap}>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderVal}>{fmt(value)} {unit}</Text>
      </View>
      <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        <View style={styles.trackBg} />
        <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
        <View style={[styles.thumb, { left: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

function makeHandlePan(get, set, width) {
  const obj = { get, set, width };
  obj.panHandlers = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (ev, g) => {
      const wpx = obj.width();
      if (!wpx) return;
      const f = obj.get() + g.dx / wpx;
      obj.set(f);
    },
    onPanResponderGrant: () => {},
  }).panHandlers;
  return obj;
}

function buildWavePath(peaks, W, H) {
  const n = peaks.length;
  const mid = H / 2;
  const step = W / n;
  let top = `M 0 ${mid}`;
  for (let i = 0; i < n; i++) { const x = i * step; const y = mid - peaks[i] * (H / 2) * 0.95; top += ` L ${x.toFixed(1)} ${y.toFixed(1)}`; }
  let bot = '';
  for (let i = n - 1; i >= 0; i--) { const x = i * step; const y = mid + peaks[i] * (H / 2) * 0.95; bot += ` L ${x.toFixed(1)} ${y.toFixed(1)}`; }
  return `${top}${bot} Z`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const linToDb = (l) => (l > 0 ? 20 * Math.log10(l) : -60);
const dbToLin = (db) => Math.pow(10, db / 20);
const half = (b) => Math.max(20, Math.round((b || 120) / 2 * 10) / 10);
const dbl = (b) => Math.min(300, Math.round((b || 120) * 2 * 10) / 10);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  card: { maxWidth: 920, backgroundColor: theme.bgElevated, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  play: { width: 46, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceActive },
  playActive: { backgroundColor: theme.good },
  titleWrap: { flex: 1 },
  title: { color: theme.danger, fontSize: 16, fontWeight: '800' },
  sub: { color: theme.textDim, fontSize: 12, fontWeight: '600', marginTop: 1 },
  close: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  closeTxt: { color: theme.textDim, fontSize: 15, fontWeight: '700' },

  wave: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#120C0E', borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 32 },

  modes: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mode: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  modeActive: { backgroundColor: theme.surfaceActive, borderColor: theme.danger },
  modeTxt: { color: theme.textDim, fontWeight: '800', fontSize: 13 },

  row2: { flexDirection: 'row', gap: 14 },
  half: { flex: 1 },

  sliderWrap: { marginBottom: 12 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sliderLabel: { color: theme.text, fontSize: 13, fontWeight: '700' },
  sliderVal: { color: theme.danger, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 30, justifyContent: 'center' },
  trackBg: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: theme.surfaceActive },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: theme.good },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9, backgroundColor: theme.text, borderWidth: 1, borderColor: theme.border },

  tempoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  tLabel: { color: theme.text, fontSize: 13, fontWeight: '700', marginRight: 'auto' },
  tBtn: { minWidth: 40, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  tBtnTxt: { color: theme.text, fontWeight: '800', fontSize: 14 },
  tVal: { color: theme.danger, fontSize: 16, fontWeight: '800', minWidth: 66, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
