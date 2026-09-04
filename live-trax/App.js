import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, StyleSheet, Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { theme } from './src/theme';
import { INSTRUMENTS, ROWS, padId } from './src/config';
import Transport from './src/transport';
import engine from './src/audio/engine';
import { importSampleFile, deleteSampleFile } from './src/storage/store';
import TransportBar from './src/components/TransportBar';
import InstrumentGrid from './src/components/InstrumentGrid';
import SignaturePicker from './src/components/SignaturePicker';

const STORE_KEY = 'livetrax.board.v1';

export default function App() {
  const [pads, setPads] = useState({});               // padId -> { uri, name }
  const [playing, setPlaying] = useState({});         // instKey -> rowIndex | null
  const [queued, setQueued] = useState({});           // instKey -> rowIndex | 'stop'
  const [bpm, setBpm] = useState(120);
  const [sig, setSig] = useState({ num: 4, den: 4 });
  const [quantize, setQuantize] = useState('bar');
  const [beat, setBeat] = useState({ playing: false, barIndex: 0, beatInBar: 0 });
  const [sigOpen, setSigOpen] = useState(false);

  // Authoritative copies for callbacks that fire outside React (transport timer).
  const transport = useRef(new Transport()).current;
  const playingRef = useRef({});
  const queuedRef = useRef({});
  const padsRef = useRef({});
  padsRef.current = pads;

  const writePlaying = useCallback((next) => { playingRef.current = next; setPlaying(next); }, []);
  const writeQueued = useCallback((next) => { queuedRef.current = next; setQueued(next); }, []);

  // --- apply a column's target: stop the current pad, start the new one ---
  const applyColumn = useCallback((instKey, target) => {
    const cur = playingRef.current[instKey];
    if (cur != null && cur !== target) engine.stop(padId(instKey, cur));

    const nextPlaying = { ...playingRef.current };
    if (target === 'stop' || target == null) {
      nextPlaying[instKey] = null;
    } else {
      engine.trigger(padId(instKey, target)); // was stopped -> starts & loops
      nextPlaying[instKey] = target;
    }
    writePlaying(nextPlaying);

    const nextQueued = { ...queuedRef.current };
    delete nextQueued[instKey];
    writeQueued(nextQueued);
  }, [writePlaying, writeQueued]);
  const applyColumnRef = useRef(applyColumn);
  applyColumnRef.current = applyColumn;

  // --- setup: audio, restore board, transport subscriptions ---
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
      } catch (e) { /* fresh board */ }
    })();

    // Beat indicator: update only when the beat/bar actually changes.
    const last = { beatInBar: -1, barIndex: -1, playing: false };
    const unsubTick = transport.subscribe((s) => {
      if (s.beatInBar !== last.beatInBar || s.barIndex !== last.barIndex || s.playing !== last.playing) {
        last.beatInBar = s.beatInBar; last.barIndex = s.barIndex; last.playing = s.playing;
        setBeat(s);
      }
    });
    // On each bar boundary, flush queued launches for every column.
    const unsubBar = transport.onBar(() => {
      const q = queuedRef.current;
      for (const instKey of Object.keys(q)) applyColumnRef.current(instKey, q[instKey]);
    });

    return () => { mounted = false; unsubTick(); unsubBar(); transport.dispose(); engine.unloadAll(); };
  }, [transport]);

  // Keep the transport in sync with UI tempo/signature/quantize.
  useEffect(() => { transport.configure({ bpm, num: sig.num, den: sig.den }); }, [bpm, sig, transport]);
  useEffect(() => { transport.setQuantize(quantize); }, [quantize, transport]);

  const persist = useCallback((nextPads) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ pads: nextPads, bpm, sig })).catch(() => {});
  }, [bpm, sig]);

  // --- import a loop onto a pad ---
  const importOnto = useCallback(async (instKey, rowIndex) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const uri = await importSampleFile(asset.uri, asset.name || 'loop');
      const name = (asset.name || 'Loop').replace(/\.[^.]+$/, '');
      const id = padId(instKey, rowIndex);
      setPads((prev) => { const next = { ...prev, [id]: { uri, name } }; persist(next); return next; });
      await engine.load(id, uri, true);
    } catch (e) { /* ignore */ }
  }, [persist]);

  // --- tap a pad: column-exclusive switch (quantized when playing) ---
  const onPadPress = useCallback((inst, rowIndex) => {
    const id = padId(inst.key, rowIndex);
    if (!padsRef.current[id]?.uri) { importOnto(inst.key, rowIndex); return; }

    const cur = playingRef.current[inst.key];
    const target = cur === rowIndex ? 'stop' : rowIndex;

    if (transport.playing && quantize === 'bar') {
      writeQueued({ ...queuedRef.current, [inst.key]: target });
    } else {
      applyColumn(inst.key, target);
    }
  }, [importOnto, transport, quantize, applyColumn, writeQueued]);

  // --- long-press: clear a loaded pad, or import onto an empty one ---
  const onPadLong = useCallback((inst, rowIndex) => {
    const id = padId(inst.key, rowIndex);
    if (!padsRef.current[id]?.uri) { importOnto(inst.key, rowIndex); return; }
    engine.unload(id);
    deleteSampleFile(padsRef.current[id].uri);
    if (playingRef.current[inst.key] === rowIndex) {
      writePlaying({ ...playingRef.current, [inst.key]: null });
    }
    setPads((prev) => { const next = { ...prev }; delete next[id]; persist(next); return next; });
  }, [importOnto, persist, writePlaying]);

  const onTogglePlay = useCallback(() => {
    if (transport.playing) {
      // flush anything queued so nothing gets stuck, then stop the clock
      const q = queuedRef.current;
      for (const instKey of Object.keys(q)) applyColumn(instKey, q[instKey]);
      transport.stop();
    } else {
      transport.start();
    }
  }, [transport, applyColumn]);

  const onStopAll = useCallback(() => {
    engine.stopAll();
    writePlaying({});
    writeQueued({});
  }, [writePlaying, writeQueued]);

  const activeCount = Object.values(playing).filter((v) => v != null).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <TransportBar
        bpm={bpm}
        num={sig.num}
        den={sig.den}
        playing={beat.playing}
        quantize={quantize}
        beat={beat}
        activeCount={activeCount}
        onBpmChange={(v) => setBpm(Math.max(40, Math.min(300, Math.round(v))))}
        onOpenSignature={() => setSigOpen(true)}
        onTogglePlay={onTogglePlay}
        onToggleQuantize={() => setQuantize((q) => (q === 'bar' ? 'off' : 'bar'))}
        onStopAll={onStopAll}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <InstrumentGrid
          pads={pads}
          playingByColumn={playing}
          queuedByColumn={queued}
          onPadPress={onPadPress}
          onPadLong={onPadLong}
        />
        <Text style={styles.hint}>
          Tap an empty pad to load a loop. Tap a loaded pad to play it — each
          column plays only one pad at a time, so tapping another row swaps the
          loop. With QUANTIZE: BAR and the transport running, switches land on the
          next bar. Long-press a pad to clear it.
        </Text>
      </ScrollView>

      <SignaturePicker
        visible={sigOpen}
        num={sig.num}
        den={sig.den}
        onClose={() => setSigOpen(false)}
        onSelect={(num, den) => { setSig({ num, den }); setSigOpen(false); }}
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
  body: { flex: 1 },
  bodyContent: { paddingTop: 12 },
  hint: { color: theme.textFaint, fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingTop: 8 },
});
