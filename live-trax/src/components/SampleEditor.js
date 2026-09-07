import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, PanResponder, Dimensions } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { theme } from '../theme';
import { Play, Pause } from './Icons';
import syncStore from '../audio/syncStore';
import Slider from './Slider';

export const DEFAULT_EDIT = { gain: 1, startFrac: 0, endFrac: 1, fadeInMs: 0, fadeOutMs: 0, playMode: 0 };
const MODES = [{ m: 0, label: 'Loop' }, { m: 1, label: 'One shot' }, { m: 2, label: 'Gate' }];
const H = 150;
const LANE = 30; // grip lane above the spectrum

// On-screen sample editor (centered modal, like the tempo dial). Waveform with
// draggable start/end trim, play mode, gain, fades, and tempo. The waveform path
// is memoized and the playhead is isolated, so dragging the sliders stays smooth
// while audio plays.
export default function SampleEditor({ visible, padId, name, bpm, waveform, edit, onChange, onSetBpm, onPreview, onClose }) {
  const e = { ...DEFAULT_EDIT, ...(edit || {}) };
  const screen = Dimensions.get('window');
  const [w, setW] = useState(Math.min(760, screen.width * 0.92));
  const maxH = screen.height * 0.88;
  const PAD = 16;
  const waveW = Math.max(80, w - PAD * 2);

  // Local trim region for smooth dragging; syncs from props when not dragging.
  const [region, setRegion] = useState({ startFrac: e.startFrac, endFrac: e.endFrac });
  const draggingTrim = useRef(false);
  const regionRef = useRef(region); regionRef.current = region;
  useEffect(() => {
    if (!draggingTrim.current) setRegion({ startFrac: e.startFrac, endFrac: e.endFrac });
  }, [e.startFrac, e.endFrac]);
  const lastRegionApply = useRef(0);
  const applyRegion = (r, commit) => {
    setRegion(r);
    const now = Date.now();
    if (commit || now - lastRegionApply.current > 40) { lastRegionApply.current = now; onChange && onChange(r); }
  };

  // Minimal "playing" state (flips on start/stop only — not per frame).
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!visible) return undefined;
    const apply = (v) => setPlaying(!!(v && v.s === 2));
    apply(syncStore.getPad(padId));
    return syncStore.subscribePad(padId, apply);
  }, [visible, padId]);

  const wavePath = useMemo(() => (waveform && waveform.length ? buildWavePath(waveform, waveW, H) : ''), [waveform, waveW]);

  const sx = region.startFrac * waveW;
  const ex = region.endFrac * waveW;
  const gainDb = linToDb(e.gain);

  const startPan = useRef(null);
  const endPan = useRef(null);
  if (!startPan.current) startPan.current = makeHandlePan(
    () => regionRef.current.startFrac, () => waveW, draggingTrim,
    (f, commit) => applyRegion({ startFrac: clamp(f, 0, regionRef.current.endFrac - 0.02), endFrac: regionRef.current.endFrac }, commit),
  );
  if (!endPan.current) endPan.current = makeHandlePan(
    () => regionRef.current.endFrac, () => waveW, draggingTrim,
    (f, commit) => applyRegion({ startFrac: regionRef.current.startFrac, endFrac: clamp(f, regionRef.current.startFrac + 0.02, 1) }, commit),
  );

  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { width: w, maxHeight: maxH }]} onPress={() => {}} onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator bounces={false}>
          <View style={styles.header}>
            <Pressable style={[styles.play, playing && styles.playActive]} onPress={onPreview}>
              {playing ? <Pause size={16} color="#0E0E12" /> : <Play size={16} color={theme.text} />}
            </Pressable>
            <View style={styles.titleWrap}>
              <Text style={styles.title} numberOfLines={1}>{name || 'Sample'}</Text>
              <Text style={styles.sub}>{Math.round(bpm) || '--'} BPM</Text>
            </View>
            <Pressable style={styles.close} onPress={onClose}><Text style={styles.closeTxt}>✕</Text></Pressable>
          </View>

          <View style={[styles.wave, { height: H + LANE }]}>
            <View style={[styles.spectrum, { height: H }]}>
              <Svg width={waveW} height={H}>
                {wavePath ? <Path d={wavePath} fill={theme.danger} opacity={0.9} /> : null}
                <Rect x={0} y={0} width={sx} height={H} fill="rgba(8,6,7,0.66)" />
                <Rect x={ex} y={0} width={Math.max(0, waveW - ex)} height={H} fill="rgba(8,6,7,0.66)" />
              </Svg>
              <Playhead padId={padId} startFrac={region.startFrac} endFrac={region.endFrac} width={waveW} height={H} />
            </View>
            <View style={[styles.handle, { left: sx - 18 }]} {...startPan.current.panHandlers}>
              <View style={styles.hLine} />
              <View style={styles.grip}><View style={styles.gripBar} /><View style={styles.gripBar} /></View>
            </View>
            <View style={[styles.handle, { left: ex - 18 }]} {...endPan.current.panHandlers}>
              <View style={styles.hLine} />
              <View style={styles.grip}><View style={styles.gripBar} /><View style={styles.gripBar} /></View>
            </View>
          </View>

          <View style={styles.modes}>
            {MODES.map((o) => (
              <Pressable key={o.m} onPress={() => onChange({ playMode: o.m })} style={[styles.mode, e.playMode === o.m && styles.modeActive]}>
                <Text style={[styles.modeTxt, e.playMode === o.m && { color: theme.danger }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          <Slider label="Gain" value={gainDb} min={-24} max={12} unit="dB" format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} onChange={(db) => onChange({ gain: dbToLin(db) })} />
          <View style={styles.row2}>
            <View style={styles.half}>
              <Slider label="Fade in" value={e.fadeInMs} min={0} max={2000} unit="ms" format={(v) => `${Math.round(v)}`} onChange={(ms) => onChange({ fadeInMs: Math.round(ms) })} />
            </View>
            <View style={styles.half}>
              <Slider label="Fade out" value={e.fadeOutMs} min={0} max={2000} unit="ms" format={(v) => `${Math.round(v)}`} onChange={(ms) => onChange({ fadeOutMs: Math.round(ms) })} />
            </View>
          </View>

          <View style={styles.tempoRow}>
            <Text style={styles.tLabel}>Tempo</Text>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm(half(bpm))}><Text style={styles.tBtnTxt}>÷2</Text></Pressable>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm((bpm || 120) - 1)}><Text style={styles.tBtnTxt}>−</Text></Pressable>
            <Text style={styles.tVal}>{(bpm || 120).toFixed(1)}</Text>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm((bpm || 120) + 1)}><Text style={styles.tBtnTxt}>+</Text></Pressable>
            <Pressable style={styles.tBtn} onPress={() => onSetBpm(dbl(bpm))}><Text style={styles.tBtnTxt}>×2</Text></Pressable>
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Isolated playhead: subscribes to the pad's phase and re-renders ONLY itself.
function Playhead({ padId, startFrac, endFrac, width, height }) {
  const [x, setX] = useState(-1);
  useEffect(() => {
    const apply = (v) => {
      if (v && v.s === 2) setX((startFrac + (v.ph || 0) * (endFrac - startFrac)) * width);
      else setX(-1);
    };
    apply(syncStore.getPad(padId));
    return syncStore.subscribePad(padId, apply);
  }, [padId, startFrac, endFrac, width]);
  if (x < 0) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, height, left: x, width: 2, backgroundColor: theme.good }} />;
}

function makeHandlePan(get, width, draggingRef, set) {
  const obj = {};
  let start = 0; // fraction captured when the drag begins (relative dragging)
  obj.panHandlers = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { draggingRef.current = true; start = get(); },
    onPanResponderMove: (ev, g) => { const wpx = width(); if (wpx) set(start + g.dx / wpx, false); },
    onPanResponderRelease: (ev, g) => { const wpx = width(); if (wpx) set(start + g.dx / wpx, true); draggingRef.current = false; },
    onPanResponderTerminate: () => { draggingRef.current = false; },
  }).panHandlers;
  return obj;
}

function buildWavePath(peaks, W, H2) {
  const n = peaks.length;
  const mid = H2 / 2;
  const step = W / n;
  let top = `M 0 ${mid}`;
  for (let i = 0; i < n; i++) { const x = i * step; const y = mid - peaks[i] * (H2 / 2) * 0.95; top += ` L ${x.toFixed(1)} ${y.toFixed(1)}`; }
  let bot = '';
  for (let i = n - 1; i >= 0; i--) { const x = i * step; const y = mid + peaks[i] * (H2 / 2) * 0.95; bot += ` L ${x.toFixed(1)} ${y.toFixed(1)}`; }
  return `${top}${bot} Z`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const linToDb = (l) => (l > 0 ? 20 * Math.log10(l) : -60);
const dbToLin = (db) => Math.pow(10, db / 20);
const half = (b) => Math.max(20, Math.round((b || 120) / 2 * 10) / 10);
const dbl = (b) => Math.min(300, Math.round((b || 120) * 2 * 10) / 10);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { maxWidth: 820, backgroundColor: theme.bgElevated, borderRadius: 16, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  scroll: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  play: { width: 46, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceActive },
  playActive: { backgroundColor: theme.good },
  titleWrap: { flex: 1 },
  title: { color: theme.danger, fontSize: 16, fontWeight: '800' },
  sub: { color: theme.textDim, fontSize: 12, fontWeight: '600', marginTop: 1 },
  close: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  closeTxt: { color: theme.textDim, fontSize: 15, fontWeight: '700' },

  wave: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#120C0E', borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  spectrum: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 36, alignItems: 'center' },
  hLine: { position: 'absolute', top: LANE - 4, bottom: 0, width: 2, backgroundColor: '#fff' },
  grip: { position: 'absolute', top: 3, width: 20, height: 24, borderRadius: 6, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  gripBar: { width: 2, height: 11, borderRadius: 1, backgroundColor: 'rgba(10,10,14,0.5)' },

  modes: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mode: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  modeActive: { backgroundColor: theme.surfaceActive, borderColor: theme.danger },
  modeTxt: { color: theme.textDim, fontWeight: '800', fontSize: 13 },

  row2: { flexDirection: 'row', gap: 14 },
  half: { flex: 1 },

  tempoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  tLabel: { color: theme.text, fontSize: 13, fontWeight: '700', marginRight: 'auto' },
  tBtn: { minWidth: 40, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  tBtnTxt: { color: theme.text, fontWeight: '800', fontSize: 14 },
  tVal: { color: theme.danger, fontSize: 16, fontWeight: '800', minWidth: 66, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
