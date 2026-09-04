import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { theme } from './src/theme';
import { padId } from './src/config';
import Transport from './src/transport';
import engine from './src/audio/engine';
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
  const [playing, setPlaying] = useState({});
  const [queued, setQueued] = useState({});
  const [bpm, setBpm] = useState(120);
  const [sig, setSig] = useState({ num: 4, den: 4 });
  const [quantize, setQuantize] = useState('bar');
  const [beat, setBeat] = useState({ playing: false, barIndex: 0, beatInBar: 0 });
  const [sigOpen, setSigOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);
  const [tab, setTab] = useState('Loop');
  const [recArmed, setRecArmed] = useState(false);

  const [library, setLibrary] = useState(emptyLibrary());
  const [libOpen, setLibOpen] = useState(false);
  const [libMode, setLibMode] = useState('manage');
  const pickTargetRef = useRef(null);

  const transport = useRef(new Transport()).current;
  const playingRef = useRef({});
  const queuedRef = useRef({});
  const padsRef = useRef({});
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
              if (saved.pads[id]?.uri) await engine.load(id, saved.pads[id].uri, true);
            }
          }
          if (saved.bpm) setBpm(saved.bpm);
          if (saved.sig) setSig(saved.sig);
        }
        const rawLib = await AsyncStorage.getItem(LIB_KEY);
        if (rawLib && mounted) {
          const lib = JSON.parse(rawLib);
          if (lib && lib.folders && lib.files) setLibrary(lib);
        }
      } catch (e) { /* fresh */ }
    })();

    const last = { beatInBar: -1, barIndex: -1, playing: false };
    const unsubTick = transport.subscribe((s) => {
      if (s.beatInBar !== last.beatInBar || s.barIndex !== last.barIndex || s.playing !== last.playing) {
        last.beatInBar = s.beatInBar; last.barIndex = s.barIndex; last.playing = s.playing;
        setBeat(s);
      }
    });
    const unsubBar = transport.onBar(() => {
      const q = queuedRef.current;
      for (const instKey of Object.keys(q)) applyColumnRef.current(instKey, q[instKey]);
    });
    return () => { mounted = false; unsubTick(); unsubBar(); transport.dispose(); engine.unloadAll(); };
  }, [transport]);

  useEffect(() => { transport.configure({ bpm, num: sig.num, den: sig.den }); }, [bpm, sig, transport]);
  useEffect(() => { transport.setQuantize(quantize); }, [quantize, transport]);

  const persist = useCallback((nextPads) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ pads: nextPads, bpm, sig })).catch(() => {});
  }, [bpm, sig]);

  const onChangeLibrary = useCallback((next, opts) => {
    setLibrary(next);
    AsyncStorage.setItem(LIB_KEY, JSON.stringify(next)).catch(() => {});
    if (opts && opts.uris) opts.uris.forEach((u) => deleteSampleFile(u));
  }, []);

  // Import a loop INTO the library (not directly onto a pad).
  const onImport = useCallback(async (folderId) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const uri = await importSampleFile(asset.uri, asset.name || 'loop');
      const name = (asset.name || 'Loop').replace(/\.[^.]+$/, '');
      const { lib } = addFile(library, { name, uri }, folderId);
      onChangeLibrary(lib);
    } catch (e) { /* ignore */ }
  }, [library, onChangeLibrary]);

  // Assign a chosen library loop to the pad that opened the browser.
  const onPickFile = useCallback((file) => {
    const target = pickTargetRef.current;
    if (!target) return;
    const id = padId(target.instKey, target.rowIndex);
    setPads((prev) => { const next = { ...prev, [id]: { uri: file.uri, name: file.name } }; persist(next); return next; });
    engine.load(id, file.uri, true);
    setLibOpen(false);
  }, [persist]);

  const onPadPress = useCallback((inst, rowIndex) => {
    const id = padId(inst.key, rowIndex);
    if (!padsRef.current[id]?.uri) {
      pickTargetRef.current = { instKey: inst.key, rowIndex };
      setLibMode('pick'); setLibOpen(true);
      return;
    }
    const cur = playingRef.current[inst.key];
    const target = cur === rowIndex ? 'stop' : rowIndex;
    if (transport.playing && quantize === 'bar') writeQueued({ ...queuedRef.current, [inst.key]: target });
    else applyColumn(inst.key, target);
  }, [transport, quantize, applyColumn, writeQueued]);

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
    if (transport.playing) {
      const q = queuedRef.current;
      for (const instKey of Object.keys(q)) applyColumn(instKey, q[instKey]);
      transport.stop();
    } else transport.start();
  }, [transport, applyColumn]);

  const onStopAll = useCallback(() => { engine.stopAll(); writePlaying({}); writeQueued({}); }, [writePlaying, writeQueued]);

  const openLibraryManage = useCallback(() => { pickTargetRef.current = null; setLibMode('manage'); setLibOpen(true); }, []);

  const activeCount = Object.values(playing).filter((v) => v != null).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" hidden />
      <TransportBar
        bpm={bpm}
        num={sig.num}
        den={sig.den}
        playing={beat.playing}
        quantize={quantize}
        beat={beat}
        recArmed={recArmed}
        activeTab={tab}
        onTogglePlay={onTogglePlay}
        onOpenTempo={() => setTempoOpen(true)}
        onOpenSignature={() => setSigOpen(true)}
        onToggleQuantize={() => setQuantize((q) => (q === 'bar' ? 'off' : 'bar'))}
        onToggleRec={() => setRecArmed((r) => !r)}
        onTab={setTab}
      />

      <View style={styles.body}>
        <View style={styles.gridWrap}>
          <InstrumentGrid
            pads={pads}
            playingByColumn={playing}
            queuedByColumn={queued}
            onPadPress={onPadPress}
            onPadLong={onPadLong}
          />
        </View>
        <RightRail onStopAll={onStopAll} onOpenLibrary={openLibraryManage} activeCount={activeCount} />
      </View>

      <SignaturePicker
        visible={sigOpen}
        num={sig.num}
        den={sig.den}
        onClose={() => setSigOpen(false)}
        onSelect={(num, den) => { setSig({ num, den }); setSigOpen(false); }}
      />
      <TempoDial
        visible={tempoOpen}
        bpm={bpm}
        onClose={() => setTempoOpen(false)}
        onChange={(v) => setBpm(Math.max(20, Math.min(300, Math.round(v))))}
      />
      <LibraryBrowser
        visible={libOpen}
        library={library}
        mode={libMode}
        onClose={() => setLibOpen(false)}
        onChangeLibrary={onChangeLibrary}
        onPick={onPickFile}
        onImport={onImport}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  body: { flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  gridWrap: { flex: 1 },
});
