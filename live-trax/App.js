import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { theme } from './src/theme';
import { padId } from './src/config';
import engine from './src/audio/engine';
import { importSampleFile, deleteSampleFile } from './src/storage/store';
import { emptyLibrary, addFile } from './src/storage/library';
import TransportBar from './src/components/TransportBar';
import InstrumentGrid from './src/components/InstrumentGrid';
import RightRail from './src/components/RightRail';
import SignaturePicker from './src/components/SignaturePicker';
import TempoDial from './src/components/TempoDial';
import LibraryBrowser from './src/components/LibraryBrowser';
import LiveTraxEngine from './modules/live-trax-engine';

// TEMP plumbing test — remove once native module is confirmed
console.log('[LiveTraxEngine]', LiveTraxEngine.hello());

const STORE_KEY = 'livetrax.board.v1';
const LIB_KEY = 'livetrax.library.v1';

export default function App() {
  const [pads, setPads] = useState({});
  const [playing, setPlaying] = useState({});
  const [queued, setQueued] = useState({});
  const [bpm, setBpm] = useState(120);
  const [sig, setSig] = useState({ num: 4, den: 4 });
  const [quantize, setQuantize] = useState('bar');
  const [beat, setBeat] = useState({ playing: false, barIndex: 0, beatInBar: 0 });
  const [volume, setVolume] = useState(1);
  const [sigOpen, setSigOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);
  const [tab, setTab] = useState('Loop');
  const [recArmed, setRecArmed] = useState(false);

  const [library, setLibrary] = useState(emptyLibrary());
  const [libOpen, setLibOpen] = useState(false);
  const [libMode, setLibMode] = useState('manage');
  const pickTargetRef = useRef(null);

  const playingRef = useRef({});
  const queuedRef = useRef({});
  const padsRef = useRef({});
  const volumeRef = useRef(1);
  const volApplyRef = useRef(0);
  padsRef.current = pads;

  const writePlaying = useCallback((next) => { playingRef.current = next; setPlaying(next); }, []);
  const writeQueued = useCallback((next) => { queuedRef.current = next; setQueued(next); }, []);

  const applyColumn = useCallback((instKey, target) => {
    const cur = playingRef.current[instKey];
    if (cur != null && cur !== target) engine.stop(padId(instKey, cur));
    const nextPlaying = { ...playingRef.current };
    if (target === 'stop' || target == null) nextPlaying[instKey] = null;
    else { engine.trigger(padId(instKey, target)); nextPlaying[instKey] = target; }
    writePlaying(nextPlaying);
    const nextQueued = { ...queuedRef.current };
    delete nextQueued[instKey];
    writeQueued(nextQueued);
  }, [writePlaying, writeQueued]);
  const applyColumnRef = useRef(applyColumn);
  applyColumnRef.current = applyColumn;

  useEffect(() => {
    let mounted = true;
    engine.configure();
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw && mounted) {
          const saved = JSON.parse(raw);
          if (saved.pads) {
            setPads(saved.pads);
            for (const id of Object.keys(saved.pads)) {
              const p = saved.pads[id];
              if (p?.uri) await engine.load(id, p.uri, { bpm: p.bpm || saved.bpm, loop: true });
            }
          }
          if (saved.bpm) setBpm(saved.bpm);
          if (saved.sig) setSig(saved.sig);
          if (typeof saved.volume === 'number') { setVolume(saved.volume); volumeRef.current = saved.volume; }
          engine.setMasterVolume(volumeRef.current);
          engine.setMasterTempo(saved.bpm || 120);
        }
        const rawLib = await AsyncStorage.getItem(LIB_KEY);
        if (rawLib && mounted) {
          const lib = JSON.parse(rawLib);
          if (lib && lib.folders && lib.files) setLibrary(lib);
        }
      } catch (e) { /* fresh */ }
    })();

    const last = { beatInBar: -1, barIndex: -1, playing: false };
    const unsubTick = engine.subscribeBeat((s) => {
      if (s.beatInBar !== last.beatInBar || s.barIndex !== last.barIndex || s.playing !== last.playing) {
        last.beatInBar = s.beatInBar; last.barIndex = s.barIndex; last.playing = s.playing;
        setBeat(s);
      }
    });
    const unsubBar = engine.onBar(() => {
      const q = queuedRef.current;
      for (const instKey of Object.keys(q)) applyColumnRef.current(instKey, q[instKey]);
    });
    return () => { mounted = false; unsubTick(); unsubBar(); engine.disposeClock(); engine.unloadAll(); };
  }, []);

  useEffect(() => {
    engine.setMasterTempo(bpm);            // clock + forward-ready tempo-lock seam
    engine.setMasterSignature(sig.num, sig.den);
  }, [bpm, sig]);
  useEffect(() => { engine.setQuantize(quantize); }, [quantize]);

  // Debounced persistence of settings (tempo/signature/volume) so dragging the
  // dial or fader doesn't hammer storage.
  useEffect(() => {
    const t = setTimeout(() => {
      engine.setMasterVolume(volume); // trailing apply after the drag settles
      AsyncStorage.setItem(STORE_KEY, JSON.stringify({ pads: padsRef.current, bpm, sig, volume })).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [bpm, sig, volume]);

  const persist = useCallback((nextPads) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ pads: nextPads, bpm, sig, volume: volumeRef.current })).catch(() => {});
  }, [bpm, sig]);

  // Update the handle immediately (smooth), but apply the level to the audio
  // engine at most ~every 60ms so dragging while loops play doesn't stutter.
  const onVolume = useCallback((v) => {
    volumeRef.current = v;
    setVolume(v);
    const now = Date.now();
    if (now - volApplyRef.current > 60) { volApplyRef.current = now; engine.setMasterVolume(v); }
  }, []);

  const onChangeLibrary = useCallback((next, opts) => {
    setLibrary(next);
    AsyncStorage.setItem(LIB_KEY, JSON.stringify(next)).catch(() => {});
    if (opts && opts.uris) opts.uris.forEach((u) => deleteSampleFile(u));
  }, []);

  const onImport = useCallback(async (folderId) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const uri = await importSampleFile(asset.uri, asset.name || 'loop');
      const name = (asset.name || 'Loop').replace(/\.[^.]+$/, '');
      // Default the loop's original BPM to the current master (a sensible guess
      // the user can correct in the library editor).
      const { lib } = addFile(library, { name, uri, bpm }, folderId);
      onChangeLibrary(lib);
    } catch (e) { /* ignore */ }
  }, [library, onChangeLibrary, bpm]);

  const onPickFile = useCallback((file) => {
    const target = pickTargetRef.current;
    if (!target) return;
    const id = padId(target.instKey, target.rowIndex);
    const loopBpm = file.bpm || bpm; // the loop's tempo rides onto the pad
    setPads((prev) => { const next = { ...prev, [id]: { uri: file.uri, name: file.name, bpm: file.bpm || null } }; persist(next); return next; });
    engine.load(id, file.uri, { bpm: loopBpm, loop: true });
    setLibOpen(false);
  }, [persist, bpm]);

  const onPadPress = useCallback((inst, rowIndex) => {
    const id = padId(inst.key, rowIndex);
    if (!padsRef.current[id]?.uri) {
      pickTargetRef.current = { instKey: inst.key, rowIndex };
      setLibMode('pick'); setLibOpen(true);
      return;
    }
    const cur = playingRef.current[inst.key];
    const target = cur === rowIndex ? 'stop' : rowIndex;
    if (engine.isClockPlaying() && quantize === 'bar') writeQueued({ ...queuedRef.current, [inst.key]: target });
    else applyColumn(inst.key, target);
  }, [quantize, applyColumn, writeQueued]);

  const onPadLong = useCallback((inst, rowIndex) => {
    const id = padId(inst.key, rowIndex);
    if (!padsRef.current[id]?.uri) {
      pickTargetRef.current = { instKey: inst.key, rowIndex };
      setLibMode('pick'); setLibOpen(true);
      return;
    }
    engine.unload(id);
    if (playingRef.current[inst.key] === rowIndex) writePlaying({ ...playingRef.current, [inst.key]: null });
    setPads((prev) => { const next = { ...prev }; delete next[id]; persist(next); return next; });
  }, [persist, writePlaying]);

  const onTogglePlay = useCallback(() => {
    if (engine.isClockPlaying()) {
      const q = queuedRef.current;
      for (const instKey of Object.keys(q)) applyColumn(instKey, q[instKey]);
      engine.stopClock();
    } else engine.startClock();
  }, [applyColumn]);

  const onStopAll = useCallback(() => { engine.stopAll(); writePlaying({}); writeQueued({}); }, [writePlaying, writeQueued]);
  const openLibraryManage = useCallback(() => { pickTargetRef.current = null; setLibMode('manage'); setLibOpen(true); }, []);

  const activeCount = Object.values(playing).filter((v) => v != null).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" hidden />
      <TransportBar
        bpm={bpm} num={sig.num} den={sig.den}
        playing={beat.playing} quantize={quantize} beat={beat}
        recArmed={recArmed} activeTab={tab}
        onTogglePlay={onTogglePlay}
        onOpenTempo={() => setTempoOpen(true)}
        onOpenSignature={() => setSigOpen(true)}
        onToggleQuantize={() => setQuantize((q) => (q === 'bar' ? 'off' : 'bar'))}
        onToggleRec={() => setRecArmed((r) => !r)}
        onTab={setTab}
      />

      <View style={styles.body}>
        <View style={styles.gridWrap}>
          <InstrumentGrid pads={pads} playingByColumn={playing} queuedByColumn={queued} onPadPress={onPadPress} onPadLong={onPadLong} />
        </View>
        <RightRail onStopAll={onStopAll} onOpenLibrary={openLibraryManage} activeCount={activeCount} volume={volume} onVolume={onVolume} />
      </View>

      <SignaturePicker visible={sigOpen} num={sig.num} den={sig.den} onClose={() => setSigOpen(false)} onSelect={(num, den) => { setSig({ num, den }); setSigOpen(false); }} />
      <TempoDial visible={tempoOpen} bpm={bpm} onClose={() => setTempoOpen(false)} onChange={(v) => setBpm(Math.max(20, Math.min(300, Math.round(v))))} />
      <LibraryBrowser visible={libOpen} library={library} mode={libMode} onClose={() => setLibOpen(false)} onChangeLibrary={onChangeLibrary} onPick={onPickFile} onImport={onImport} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
  body: { flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  gridWrap: { flex: 1 },
});
