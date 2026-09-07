import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { theme } from './src/theme';
import { padId, quantizeLabel } from './src/config';
import engine from './src/audio/engine';
import syncStore from './src/audio/syncStore';
import { importSampleFile, deleteSampleFile, resolveSampleUri } from './src/storage/store';
import { emptyLibrary, addFile } from './src/storage/library';
import {
  emptyProjects, createProject, updateProject, renameProject, deleteProject, getProject,
} from './src/storage/projects';
import TransportBar from './src/components/TransportBar';
import InstrumentGrid from './src/components/InstrumentGrid';
import RightRail from './src/components/RightRail';
import SignaturePicker from './src/components/SignaturePicker';
import TempoDial from './src/components/TempoDial';
import QuantizePicker from './src/components/QuantizePicker';
import LibraryBrowser from './src/components/LibraryBrowser';
import ProjectHome from './src/components/ProjectHome';

const OLD_BOARD_KEY = 'livetrax.board.v1';
const PROJECTS_KEY = 'livetrax.projects.v1';
const LIB_KEY = 'livetrax.library.v1';

export default function App() {
  const [projects, setProjects] = useState(emptyProjects());
  const [currentId, setCurrentId] = useState(null); // null = Home

  // Working state for the OPEN project (mirrors projects.byId[currentId]).
  const [pads, setPads] = useState({});
  const [bpm, setBpm] = useState(120);
  const [sig, setSig] = useState({ num: 4, den: 4 });
  const [quantizeBeats, setQuantizeBeats] = useState(4);
  const [qOpen, setQOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [sigOpen, setSigOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);

  // Global, shared across all projects.
  const [library, setLibrary] = useState(emptyLibrary());
  const [libOpen, setLibOpen] = useState(false);
  const [libMode, setLibMode] = useState('manage');
  const pickTargetRef = useRef(null);

  const padsRef = useRef({}); padsRef.current = pads;
  const volumeRef = useRef(1);
  const volApplyRef = useRef(0);
  const currentIdRef = useRef(null); currentIdRef.current = currentId;
  const projectsRef = useRef(projects); projectsRef.current = projects;
  const openingRef = useRef(false); // suppress settings-persist while opening

  // ---- projects persistence ----
  const saveProjects = useCallback((next) => {
    projectsRef.current = next;
    setProjects(next);
    AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  const writeCurrent = useCallback((patch) => {
    const id = currentIdRef.current;
    if (!id || !projectsRef.current.byId[id]) return;
    saveProjects(updateProject(projectsRef.current, id, patch));
  }, [saveProjects]);
  const persistPads = useCallback((nextPads) => { writeCurrent({ pads: nextPads }); }, [writeCurrent]);

  // ---- boot: load library + projects (migrate a legacy single board) ----
  useEffect(() => {
    let mounted = true;
    engine.configure();
    engine.setMasterSignature(4, 4);
    engine.setQuantize(4);
    (async () => {
      try {
        const rawLib = await AsyncStorage.getItem(LIB_KEY);
        if (rawLib && mounted) {
          const lib = JSON.parse(rawLib);
          if (lib && lib.folders && lib.files) setLibrary(lib);
        }
        const rawPrj = await AsyncStorage.getItem(PROJECTS_KEY);
        if (rawPrj) {
          const parsed = JSON.parse(rawPrj);
          if (parsed && parsed.order && parsed.byId && mounted) { saveProjects(parsed); return; }
        }
        const rawOld = await AsyncStorage.getItem(OLD_BOARD_KEY);
        if (rawOld && mounted) {
          const b = JSON.parse(rawOld);
          const seed = {
            pads: b.pads || {},
            bpm: b.bpm || 120,
            sig: b.sig || { num: 4, den: 4 },
            quantizeBeats: typeof b.quantizeBeats === 'number' ? b.quantizeBeats : 4,
            volume: typeof b.volume === 'number' ? b.volume : 1,
          };
          const { projects: np } = createProject(emptyProjects(), 'My Project', seed);
          saveProjects(np);
        }
      } catch (e) { /* fresh */ }
    })();

    syncStore.start();
    return () => {
      mounted = false;
      syncStore.stop();
      engine.disposeClock();
      engine.unloadAll();
    };
  }, [saveProjects]);

  // Apply engine settings live while a project is open.
  useEffect(() => { if (currentId) engine.setMasterTempo(bpm); }, [bpm, currentId]);
  useEffect(() => { if (currentId) engine.setMasterSignature(sig.num, sig.den); }, [sig, currentId]);
  useEffect(() => { if (currentId) engine.setQuantize(quantizeBeats); }, [quantizeBeats, currentId]);

  // Persist settings into the current project (debounced).
  useEffect(() => {
    if (!currentId || openingRef.current) return undefined;
    const t = setTimeout(() => {
      engine.setMasterVolume(volume);
      writeCurrent({ bpm, sig, volume, quantizeBeats });
    }, 400);
    return () => clearTimeout(t);
  }, [bpm, sig, volume, quantizeBeats, currentId, writeCurrent]);

  // ---- open / close projects ----
  const openProject = useCallback(async (id) => {
    const p = getProject(projectsRef.current, id);
    if (!p) return;
    openingRef.current = true;
    engine.stopClock(); engine.stopAll(); engine.unloadAll();
    syncStore.reset();
    setIsPlaying(false);

    setBpm(p.bpm); setSig(p.sig); setQuantizeBeats(p.quantizeBeats);
    setVolume(p.volume); volumeRef.current = p.volume;
    engine.setMasterTempo(p.bpm);
    engine.setMasterSignature(p.sig.num, p.sig.den);
    engine.setQuantize(p.quantizeBeats);
    engine.setMasterVolume(p.volume);

    const padsCopy = { ...(p.pads || {}) };
    setPads(padsCopy);
    setCurrentId(id);

    for (const pid of Object.keys(padsCopy)) {
      const pd = padsCopy[pid];
      if (pd && pd.uri) {
        const dur = await engine.load(pid, resolveSampleUri(pd.uri), { bpm: pd.bpm || p.bpm, loop: true });
        padsCopy[pid] = { ...pd, durationSec: dur };
      }
    }
    setPads({ ...padsCopy });
    setTimeout(() => { openingRef.current = false; }, 500);
  }, []);

  const goHome = useCallback(() => {
    if (currentIdRef.current) {
      saveProjects(updateProject(projectsRef.current, currentIdRef.current, {
        pads: padsRef.current, bpm, sig, volume: volumeRef.current, quantizeBeats,
      }));
    }
    engine.stopClock(); engine.stopAll(); engine.unloadAll();
    syncStore.reset();
    setIsPlaying(false);
    setCurrentId(null);
  }, [bpm, sig, quantizeBeats, saveProjects]);

  const onCreateProject = useCallback((name) => {
    const { projects: np, id } = createProject(projectsRef.current, name);
    saveProjects(np);
    openProject(id);
  }, [saveProjects, openProject]);
  const onRenameProject = useCallback((id, name) => { saveProjects(renameProject(projectsRef.current, id, name)); }, [saveProjects]);
  const onDeleteProject = useCallback((id) => { saveProjects(deleteProject(projectsRef.current, id)); }, [saveProjects]);

  // ---- volume / library / pads ----
  const onVolume = useCallback((v) => {
    volumeRef.current = v; setVolume(v);
    const now = Date.now();
    if (now - volApplyRef.current > 60) { volApplyRef.current = now; engine.setMasterVolume(v); }
  }, []);

  const onChangeLibrary = useCallback((next, opts) => {
    setLibrary(next);
    AsyncStorage.setItem(LIB_KEY, JSON.stringify(next)).catch(() => {});
    if (opts && opts.uris) opts.uris.forEach((u) => deleteSampleFile(u));
    // Reconcile the open board's pads with library BPM edits (re-slice + re-lock).
    const byUri = {};
    Object.values(next.files || {}).forEach((f) => { byUri[f.uri] = f; });
    setPads((prev) => {
      let changed = false;
      const out = { ...prev };
      for (const id of Object.keys(prev)) {
        const p = prev[id];
        const f = p && p.uri ? byUri[p.uri] : null;
        if (f && (f.bpm || null) !== (p.bpm || null)) {
          out[id] = { ...p, bpm: f.bpm || null };
          engine.setPadBpm(id, f.bpm > 0 ? f.bpm : 0);
          changed = true;
        }
      }
      if (!changed) return prev;
      persistPads(out);
      return out;
    });
  }, [persistPads]);

  const onImport = useCallback(async (folderId) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const uri = await importSampleFile(asset.uri, asset.name || 'loop');
      const name = (asset.name || 'Loop').replace(/\.[^.]+$/, '');
      let detected = 0;
      try { detected = engine.estimateBpm(resolveSampleUri(uri)); } catch (e) { detected = 0; }
      const loopBpm = detected > 0 ? detected : bpm;
      const { lib } = addFile(library, { name, uri, bpm: loopBpm }, folderId);
      onChangeLibrary(lib);
    } catch (e) { /* ignore */ }
  }, [library, onChangeLibrary, bpm]);

  const onPickFile = useCallback((file) => {
    const target = pickTargetRef.current;
    if (!target) return;
    const id = padId(target.instKey, target.rowIndex);
    const loopBpm = file.bpm || bpm;
    setPads((prev) => { const next = { ...prev, [id]: { uri: file.uri, name: file.name, bpm: file.bpm || null } }; persistPads(next); return next; });
    engine.load(id, resolveSampleUri(file.uri), { bpm: loopBpm, loop: true }).then((dur) => {
      setPads((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev, [id]: { ...prev[id], durationSec: dur } };
        persistPads(next);
        return next;
      });
    });
    setLibOpen(false);
  }, [persistPads, bpm]);

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
      engine.stop(id);
    } else {
      engine.trigger(id);
      if (activeRow != null) engine.stop(padId(inst.key, activeRow));
      syncStore.markArmed(id);
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
    setPads((prev) => { const next = { ...prev }; delete next[id]; persistPads(next); return next; });
  }, [persistPads]);

  const onTogglePlay = useCallback(() => {
    if (engine.isClockPlaying()) { engine.stopClock(); setIsPlaying(false); }
    else { engine.startClock(); setIsPlaying(true); }
  }, []);

  const onStopAll = useCallback(() => { engine.stopAll(); }, []);
  const openLibraryManage = useCallback(() => { pickTargetRef.current = null; setLibMode('manage'); setLibOpen(true); }, []);

  // ---- Home screen ----
  if (!currentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" hidden />
        <ProjectHome
          projects={projects}
          onOpen={openProject}
          onCreate={onCreateProject}
          onRename={onRenameProject}
          onDelete={onDeleteProject}
        />
      </SafeAreaView>
    );
  }

  const projName = (getProject(projects, currentId) || {}).name || 'Live Trax';

  // ---- Project (board) screen ----
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" hidden />
      <TransportBar
        projectName={projName}
        bpm={bpm} num={sig.num} den={sig.den}
        playing={isPlaying} quantizeLabel={quantizeLabel(quantizeBeats)} quantizeActive={quantizeBeats > 0}
        onHome={goHome}
        onTogglePlay={onTogglePlay}
        onOpenTempo={() => setTempoOpen(true)}
        onOpenSignature={() => setSigOpen(true)}
        onOpenQuantize={() => setQOpen(true)}
      />

      <View style={styles.body}>
        <View style={styles.gridWrap}>
          <InstrumentGrid pads={pads} den={sig.den} onPadPress={onPadPress} onPadLong={onPadLong} />
        </View>
        <RightRail onStopAll={onStopAll} onOpenLibrary={openLibraryManage} volume={volume} onVolume={onVolume} />
      </View>

      <SignaturePicker visible={sigOpen} num={sig.num} den={sig.den} onClose={() => setSigOpen(false)} onSelect={(num, den) => { setSig({ num, den }); setSigOpen(false); }} />
      <TempoDial visible={tempoOpen} bpm={bpm} onClose={() => setTempoOpen(false)} onChange={(v) => setBpm(Math.max(20, Math.min(300, Math.round(v))))} />
      <QuantizePicker visible={qOpen} value={quantizeBeats} onClose={() => setQOpen(false)} onSelect={(b) => { setQuantizeBeats(b); setQOpen(false); }} />
      <LibraryBrowser visible={libOpen} library={library} mode={libMode} onClose={() => setLibOpen(false)} onChangeLibrary={onChangeLibrary} onPick={onPickFile} onImport={onImport} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
  body: { flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  gridWrap: { flex: 1 },
});
