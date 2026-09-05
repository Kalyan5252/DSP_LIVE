import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { theme } from './src/theme';
import { padId } from './src/config';
import engine from './src/audio/engine';
import syncStore from './src/audio/syncStore';
import { importSampleFile, deleteSampleFile } from './src/storage/store';
import { emptyLibrary, addFile } from './src/storage/library';
import TransportBar from './src/components/TransportBar';
import InstrumentGrid from './src/components/InstrumentGrid';
import RightRail from './src/components/RightRail';
import SignaturePicker from './src/components/SignaturePicker';
import TempoDial from './src/components/TempoDial';
import LibraryBrowser from './src/components/LibraryBrowser';

const STORE_KEY = 'livetrax.board.v1';
const LIB_KEY = 'livetrax.library.v1';

export default function App() {
  const [pads, setPads] = useState({});
  const [bpm, setBpm] = useState(120);
  const [sig, setSig] = useState({ num: 4, den: 4 });
  const [quantize, setQuantize] = useState('bar');
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [sigOpen, setSigOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);

  const [library, setLibrary] = useState(emptyLibrary());
  const [libOpen, setLibOpen] = useState(false);
  const [libMode, setLibMode] = useState('manage');
  const pickTargetRef = useRef(null);

  const padsRef = useRef({});
  const volumeRef = useRef(1);
  const volApplyRef = useRef(0);
  padsRef.current = pads;

  useEffect(() => {
    let mounted = true;
    engine.configure();
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw && mounted) {
          const saved = JSON.parse(raw);
          if (saved.bpm) { setBpm(saved.bpm); engine.setMasterTempo(saved.bpm); }
          if (saved.sig) { setSig(saved.sig); engine.setMasterSignature(saved.sig.num, saved.sig.den); }
          if (typeof saved.volume === 'number') { setVolume(saved.volume); volumeRef.current = saved.volume; }
          engine.setMasterVolume(volumeRef.current);
          engine.setQuantize('bar');
          if (saved.pads) {
            setPads(saved.pads);
            for (const id of Object.keys(saved.pads)) {
              const p = saved.pads[id];
              if (p?.uri) await engine.load(id, p.uri, { bpm: p.bpm || saved.bpm, loop: true });
            }
          }
        } else {
          engine.setMasterSignature(4, 4);
          engine.setQuantize('bar');
        }
        const rawLib = await AsyncStorage.getItem(LIB_KEY);
        if (rawLib && mounted) {
          const lib = JSON.parse(rawLib);
          if (lib && lib.folders && lib.files) setLibrary(lib);
        }
      } catch (e) { /* fresh */ }
    })();

    syncStore.start(); // begin polling the native transport for the UI

    return () => {
      mounted = false;
      syncStore.stop();
      engine.disposeClock();
      engine.unloadAll();
    };
  }, []);

  useEffect(() => {
    engine.setMasterTempo(bpm);
  }, [bpm]);
  useEffect(() => {
    engine.setMasterSignature(sig.num, sig.den);
  }, [sig]);
  useEffect(() => { engine.setQuantize(quantize); }, [quantize]);

  // Debounced persistence of settings (tempo/signature/volume).
  useEffect(() => {
    const t = setTimeout(() => {
      engine.setMasterVolume(volume);
      AsyncStorage.setItem(STORE_KEY, JSON.stringify({ pads: padsRef.current, bpm, sig, volume })).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [bpm, sig, volume]);

  const persist = useCallback((nextPads) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ pads: nextPads, bpm, sig, volume: volumeRef.current })).catch(() => {});
  }, [bpm, sig]);

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
      const { lib } = addFile(library, { name, uri, bpm }, folderId);
      onChangeLibrary(lib);
    } catch (e) { /* ignore */ }
  }, [library, onChangeLibrary, bpm]);

  const onPickFile = useCallback((file) => {
    const target = pickTargetRef.current;
    if (!target) return;
    const id = padId(target.instKey, target.rowIndex);
    const loopBpm = file.bpm || bpm;
    setPads((prev) => { const next = { ...prev, [id]: { uri: file.uri, name: file.name, bpm: file.bpm || null } }; persist(next); return next; });
    engine.load(id, file.uri, { bpm: loopBpm, loop: true });
    setLibOpen(false);
  }, [persist, bpm]);

  // Tap a pad: column-exclusive, quantized launch. Native schedules the launch
  // (and the outgoing loop's stop) on the same grid boundary, so switching a
  // column's loop is seamless and on-beat.
  const onPadPress = useCallback((inst, rowIndex) => {
    const id = padId(inst.key, rowIndex);
    if (!padsRef.current[id]?.uri) {
      pickTargetRef.current = { instKey: inst.key, rowIndex };
      setLibMode('pick'); setLibOpen(true);
      return;
    }
    const col = syncStore.getColumnActive()[inst.key];
    const activeRow = col ? col.row : null;
    if (activeRow === rowIndex) {
      engine.stop(id); // finishes to the next boundary
    } else {
      if (activeRow != null) engine.stop(padId(inst.key, activeRow));
      engine.trigger(id);
      syncStore.markArmed(id); // optimistic: pulse immediately
    }
  }, []);

  const onPadLong = useCallback((inst, rowIndex) => {
    const id = padId(inst.key, rowIndex);
    if (!padsRef.current[id]?.uri) {
      pickTargetRef.current = { instKey: inst.key, rowIndex };
      setLibMode('pick'); setLibOpen(true);
      return;
    }
    engine.unload(id);
    syncStore.markStopped(id);
    setPads((prev) => { const next = { ...prev }; delete next[id]; persist(next); return next; });
  }, [persist]);

  const onTogglePlay = useCallback(() => {
    if (engine.isClockPlaying()) { engine.stopClock(); setIsPlaying(false); }
    else { engine.startClock(); setIsPlaying(true); }
  }, []);

  const onStopAll = useCallback(() => { engine.stopAll(); }, []);
  const openLibraryManage = useCallback(() => { pickTargetRef.current = null; setLibMode('manage'); setLibOpen(true); }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" hidden />
      <TransportBar
        bpm={bpm} num={sig.num} den={sig.den}
        playing={isPlaying} quantize={quantize}
        onTogglePlay={onTogglePlay}
        onOpenTempo={() => setTempoOpen(true)}
        onOpenSignature={() => setSigOpen(true)}
        onToggleQuantize={() => setQuantize((q) => (q === 'bar' ? 'off' : 'bar'))}
      />

      <View style={styles.body}>
        <View style={styles.gridWrap}>
          <InstrumentGrid pads={pads} beats={sig.num} onPadPress={onPadPress} onPadLong={onPadLong} />
        </View>
        <RightRail onStopAll={onStopAll} onOpenLibrary={openLibraryManage} volume={volume} onVolume={onVolume} />
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
