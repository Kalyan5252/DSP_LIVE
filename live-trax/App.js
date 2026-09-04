import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';

import { theme, colorForIndex } from './src/theme';
import engine from './src/audio/engine';
import { importSampleFile, deleteSampleFile, saveState, loadState } from './src/storage/store';
import Toolbar from './src/components/Toolbar';
import PadGrid from './src/components/PadGrid';
import PadOptions from './src/components/PadOptions';

const PAD_COUNT = 16;
const COLUMNS = 4;

// Build the default empty grid: 16 pads, each pre-assigned a color so a freshly
// loaded sample already looks at home on the board.
function makeDefaultPads() {
  return Array.from({ length: PAD_COUNT }, (_, i) => ({
    id: `pad-${i}`,
    name: '',
    uri: null,
    color: colorForIndex(i),
    loop: true,
  }));
}

export default function App() {
  const [pads, setPads] = useState(makeDefaultPads);
  const [playing, setPlaying] = useState({});
  const [optionsId, setOptionsId] = useState(null);
  const padsRef = useRef(pads);
  padsRef.current = pads;

  // One-time setup: configure audio, wire the engine's play/stop callback into
  // React state, then restore any saved board.
  useEffect(() => {
    let mounted = true;

    engine.configure();
    engine.setListener((padId, isPlaying) => {
      setPlaying((prev) => ({ ...prev, [padId]: isPlaying }));
    });

    (async () => {
      const saved = await loadState();
      if (!mounted || !saved) return;

      // Merge saved pads onto the default shape so a schema change never crashes.
      const restored = makeDefaultPads().map((base) => {
        const match = saved.find((p) => p.id === base.id);
        return match ? { ...base, ...match } : base;
      });
      setPads(restored);

      for (const pad of restored) {
        if (pad.uri) {
          await engine.load(pad.id, pad.uri, pad.loop);
        }
      }
    })();

    return () => {
      mounted = false;
      engine.unloadAll();
    };
  }, []);

  const persist = useCallback((next) => {
    saveState(next);
  }, []);

  // Pick an audio file and drop it onto `pad`. Used for both first load and
  // "replace sound".
  const importOnto = useCallback(
    async (padId) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'audio/*',
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets || !result.assets.length) return;

        const asset = result.assets[0];
        const stableUri = await importSampleFile(asset.uri, asset.name || 'sample');
        const niceName = (asset.name || 'Sample').replace(/\.[^.]+$/, '');

        setPads((prev) => {
          const next = prev.map((p) =>
            p.id === padId ? { ...p, uri: stableUri, name: niceName } : p
          );
          persist(next);
          return next;
        });

        const pad = padsRef.current.find((p) => p.id === padId);
        await engine.load(padId, stableUri, pad ? pad.loop : true);
      } catch (e) {
        // Import failed (permission denied, unsupported file). Leave pad as-is.
      }
    },
    [persist]
  );

  const handleTrigger = useCallback(
    (pad) => {
      if (!pad.uri) {
        importOnto(pad.id);
      } else {
        engine.trigger(pad.id);
      }
    },
    [importOnto]
  );

  const handleOptions = useCallback((pad) => {
    if (!pad.uri) return; // nothing to edit on an empty pad
    setOptionsId(pad.id);
  }, []);

  const patchOptionsPad = useCallback(
    (patch) => {
      setPads((prev) => {
        const next = prev.map((p) => (p.id === optionsId ? { ...p, ...patch } : p));
        persist(next);
        return next;
      });
      if (Object.prototype.hasOwnProperty.call(patch, 'loop')) {
        engine.setLoop(optionsId, patch.loop);
      }
    },
    [optionsId, persist]
  );

  const clearOptionsPad = useCallback(() => {
    const pad = padsRef.current.find((p) => p.id === optionsId);
    engine.unload(optionsId);
    if (pad && pad.uri) deleteSampleFile(pad.uri);
    setPads((prev) => {
      const next = prev.map((p) =>
        p.id === optionsId ? { ...p, uri: null, name: '' } : p
      );
      persist(next);
      return next;
    });
    setPlaying((prev) => ({ ...prev, [optionsId]: false }));
    setOptionsId(null);
  }, [optionsId, persist]);

  const stopAll = useCallback(() => engine.stopAll(), []);

  const activeCount = Object.values(playing).filter(Boolean).length;
  const optionsPad = pads.find((p) => p.id === optionsId) || null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Toolbar activeCount={activeCount} onStopAll={stopAll} />
        <PadGrid
          pads={pads}
          playing={playing}
          columns={COLUMNS}
          onTrigger={handleTrigger}
          onOptions={handleOptions}
        />
        <Text style={styles.hint}>
          Tap an empty pad to load a sound of your own. Tap a loaded pad to play or
          stop it. Long-press a pad to rename, loop, recolor, or clear it. Stack
          several loops to build a track.
        </Text>
      </ScrollView>

      <PadOptions
        pad={optionsPad}
        visible={!!optionsId}
        onClose={() => setOptionsId(null)}
        onChange={patchOptionsPad}
        onReplace={() => optionsId && importOnto(optionsId)}
        onClear={clearOptionsPad}
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
  scroll: {
    padding: 18,
    paddingBottom: 40,
  },
  hint: {
    color: theme.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 22,
  },
});
