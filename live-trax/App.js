import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { theme } from './src/theme';
import { padId, quantizeLabel, INSTRUMENTS, ROWS } from './src/config';
import engine from './src/audio/engine';
import syncStore from './src/audio/syncStore';
import { importSampleFile, deleteSampleFile, resolveSampleUri, sampleRelPath, sampleExists } from './src/storage/store';
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
import SampleEditor, { DEFAULT_EDIT } from './src/components/SampleEditor';
import Mixer from './src/components/Mixer';

const OLD_BOARD_KEY = 'livetrax.board.v1';
const PROJECTS_KEY = 'livetrax.projects.v1';
const LIB_KEY = 'livetrax.library.v1';

// One-time normalization: rewrite any legacy ABSOLUTE sample uris to stable
// app-relative refs ("samples/<file>"), so they resolve against the current
// document directory after every rebuild.
function migrateLibraryUris(lib) {
  if (!lib || !lib.files) return { lib, changed: false };
  let changed = false;
  const files = {};
  for (const id of Object.keys(lib.files)) {
    const f = lib.files[id];
    const rel = sampleRelPath(f.uri);
    if (rel !== f.uri) changed = true;
    files[id] = { ...f, uri: rel };
  }
  return { lib: changed ? { ...lib, files } : lib, changed };
}
function migrateProjectUris(projects) {
  if (!projects || !projects.byId) return { projects, changed: false };
  let changed = false;
  const byId = {};
  for (const id of Object.keys(projects.byId)) {
    const p = projects.byId[id];
    const pads = {};
    for (const pid of Object.keys(p.pads || {})) {
      const pd = p.pads[pid];
      const rel = sampleRelPath(pd.uri);
      if (rel !== pd.uri) changed = true;
      pads[pid] = { ...pd, uri: rel };
    }
    byId[id] = { ...p, pads };
  }
  return { projects: changed ? { ...projects, byId } : projects, changed };
}

function defaultMixer() { return { vol: {}, solo: {}, mute: {} }; }
function effChannel(mx, key) {
  const anySolo = Object.values((mx && mx.solo) || {}).some(Boolean);
  if (anySolo && !mx.solo[key]) return 0;
  if (mx.mute && mx.mute[key]) return 0;
  const v = mx.vol && mx.vol[key];
  return typeof v === 'number' ? v : 1;
}

export default function App() {
  const [projects, setProjects] = useState(emptyProjects());
  const [currentId, setCurrentId] = useState(null); // null = Home

  // Working state for the OPEN project (mirrors projects.byId[currentId]).
  const [pads, setPads] = useState({});
  const [bpm, setBpm] = useState(120);
  const [tempoDragging, setTempoDragging] = useState(false);
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
  const [missing, setMissing] = useState({}); // library fileId -> true when file is gone
  const [editMode, setEditMode] = useState(false);       // Edit (pencil) armed on the rail
  const [editorPadId, setEditorPadId] = useState(null);  // pad open in the sample editor
  const [waveform, setWaveform] = useState([]);
  const [mixer, setMixer] = useState(defaultMixer());
  const [mixerOpen, setMixerOpen] = useState(false);
  const pickTargetRef = useRef(null);
  const mixerRef = useRef(defaultMixer()); mixerRef.current = mixer;
  const editModeRef = useRef(false); editModeRef.current = editMode;
  const editorPadIdRef = useRef(null); editorPadIdRef.current = editorPadId;

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

  // Push a pad's edit params into the engine (region/gain/fades/play mode).
  const applyEdit = useCallback((id, ed) => {
    engine.setRegion(id, ed.startFrac, ed.endFrac);
    engine.setPadGain(id, ed.gain);
    engine.setPadFades(id, ed.fadeInMs, ed.fadeOutMs);
    engine.setPadPlayMode(id, ed.playMode);
  }, []);

  const openEditor = useCallback((id) => {
    setWaveform(engine.getWaveform(id, 240));
    setEditorPadId(id);
  }, []);

  // Apply the mixer (channel volume + solo/mute) to every pad's channel gain.
  const applyMixer = useCallback((mx) => {
    INSTRUMENTS.forEach((inst) => {
      const eff = effChannel(mx, inst.key);
      ROWS.forEach((_, row) => engine.setPadChannelGain(padId(inst.key, row), eff));
    });
  }, []);
  const updateMixer = useCallback((next) => {
    mixerRef.current = next;
    setMixer(next);
    applyMixer(next);
    writeCurrent({ mixer: next });
  }, [applyMixer, writeCurrent]);
  const onMixerVol = useCallback((key, v) => { const mx = mixerRef.current; updateMixer({ ...mx, vol: { ...mx.vol, [key]: v } }); }, [updateMixer]);
  const onToggleSolo = useCallback((key) => { const mx = mixerRef.current; updateMixer({ ...mx, solo: { ...mx.solo, [key]: !mx.solo[key] } }); }, [updateMixer]);
  const onToggleMute = useCallback((key) => { const mx = mixerRef.current; updateMixer({ ...mx, mute: { ...mx.mute, [key]: !mx.mute[key] } }); }, [updateMixer]);

  const onEditorChange = useCallback((patch) => {
    const id = editorPadIdRef.current; if (!id) return;
    const p = padsRef.current[id]; if (!p) return;
    const ed = { ...DEFAULT_EDIT, ...(p.edit || {}), ...patch };
    applyEdit(id, ed);
    setPads((prev) => { const pp = prev[id]; if (!pp) return prev; const next = { ...prev, [id]: { ...pp, edit: ed } }; persistPads(next); return next; });
  }, [applyEdit, persistPads]);

  const onEditorSetBpm = useCallback((v) => {
    const id = editorPadIdRef.current; if (!id) return;
    const nv = Math.max(20, Math.min(300, Math.round(v * 10) / 10));
    engine.setPadBpm(id, nv);
    engine.applyTempo();
    setPads((prev) => { const pp = prev[id]; if (!pp) return prev; const next = { ...prev, [id]: { ...pp, bpm: nv } }; persistPads(next); return next; });
  }, [persistPads]);

  const onEditorPreview = useCallback(() => {
    const id = editorPadIdRef.current; if (!id) return;
    const st = syncStore.getPad(id);
    if (st && st.s === 2) engine.stop(id);
    else { engine.trigger(id); syncStore.markArmed(id); }
  }, []);

  const onCloseEditor = useCallback(() => {
    const id = editorPadIdRef.current;
    if (id) engine.stop(id);
    setEditorPadId(null);
  }, []);

  // Flag library files whose audio is missing on disk (e.g. lost in a prior
  // container reset) so the user can spot and re-import them.
  const refreshMissing = useCallback(async (lib) => {
    const files = Object.values((lib && lib.files) || {});
    const next = {};
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await sampleExists(f.uri);
      if (!ok) next[f.id] = true;
    }
    setMissing(next);
  }, []);

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
          const parsedLib = JSON.parse(rawLib);
          if (parsedLib && parsedLib.folders && parsedLib.files) {
            const { lib, changed } = migrateLibraryUris(parsedLib);
            setLibrary(lib);
            if (changed) AsyncStorage.setItem(LIB_KEY, JSON.stringify(lib)).catch(() => {});
            refreshMissing(lib);
          }
        }
        const rawPrj = await AsyncStorage.getItem(PROJECTS_KEY);
        if (rawPrj) {
          const parsed = JSON.parse(rawPrj);
          if (parsed && parsed.order && parsed.byId && mounted) {
            const { projects: mig } = migrateProjectUris(parsed);
            saveProjects(mig);
            return;
          }
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
  }, [saveProjects, refreshMissing]);

  // Apply engine settings live while a project is open.
  useEffect(() => { if (currentId) engine.setMasterTempo(bpm); }, [bpm, currentId]);
  // On tempo settle, warp all loops to the master tempo (cheap steady-state).
  //
  // Only once the gesture has actually ENDED. A 300 ms timer alone re-fires on
  // every pause in a slow drag, and each firing swaps all eight playback buffers
  // and resets their stretchers. One reset is inaudible; dozens compound into
  // the blocky artifact (measured: 34 clicks with no resets, 1040 with a reset
  // every ~200 ms). While the dial is held, setMasterTempo alone keeps the mix
  // moving — the stretchers track a changing ratio without any of this.
  useEffect(() => {
    if (!currentId || tempoDragging) return undefined;
    const t = setTimeout(() => engine.applyTempo(), 300);
    return () => clearTimeout(t);
  }, [bpm, currentId, tempoDragging]);
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

    const mx = p.mixer || defaultMixer();
    mixerRef.current = mx; setMixer(mx);
    const padsCopy = { ...(p.pads || {}) };
    setPads(padsCopy);
    setCurrentId(id);

    for (const pid of Object.keys(padsCopy)) {
      const pd = padsCopy[pid];
      if (pd && pd.uri) {
        const dur = await engine.load(pid, resolveSampleUri(pd.uri), { bpm: pd.bpm || p.bpm, loop: true });
        const ed = { ...DEFAULT_EDIT, ...(pd.edit || {}) };
        engine.setRegion(pid, ed.startFrac, ed.endFrac);
        engine.setPadGain(pid, ed.gain);
        engine.setPadFades(pid, ed.fadeInMs, ed.fadeOutMs);
        engine.setPadPlayMode(pid, ed.playMode);
        padsCopy[pid] = { ...pd, durationSec: dur };
      }
    }
    setPads({ ...padsCopy });
    applyMixer(mx);
    engine.applyTempo();
    setTimeout(() => { openingRef.current = false; }, 500);
  }, []);

  const goHome = useCallback(() => {
    if (currentIdRef.current) {
      saveProjects(updateProject(projectsRef.current, currentIdRef.current, {
        pads: padsRef.current, bpm, sig, volume: volumeRef.current, quantizeBeats, mixer: mixerRef.current,
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
    refreshMissing(next);
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
  }, [persistPads, refreshMissing]);

  const onImport = useCallback(async (folderId) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const uri = await importSampleFile(asset.uri, asset.name || 'loop');
      const name = (asset.name || 'Loop').replace(/\.[^.]+$/, '');
      // Offline analysis pass: detect BPM + transient markers once, at import.
      let analysis = null;
      try { analysis = await engine.analyzeSample(resolveSampleUri(uri)); } catch (e) { analysis = null; }
      const detected = analysis && analysis.bpm > 0 ? analysis.bpm : 0;
      const loopBpm = detected > 0 ? detected : bpm;
      const { lib } = addFile(library, { name, uri, bpm: loopBpm, analysis }, folderId);
      onChangeLibrary(lib);
    } catch (e) { /* ignore */ }
  }, [library, onChangeLibrary, bpm]);

  const onPickFile = useCallback((file) => {
    const target = pickTargetRef.current;
    if (!target) return;
    const id = padId(target.instKey, target.rowIndex);
    const loopBpm = file.bpm || bpm;
    setPads((prev) => { const next = { ...prev, [id]: { uri: file.uri, name: file.name, bpm: file.bpm || null, analysis: file.analysis || null } }; persistPads(next); return next; });
    engine.load(id, resolveSampleUri(file.uri), { bpm: loopBpm, loop: true }).then((dur) => {
      engine.setPadChannelGain(id, effChannel(mixerRef.current, target.instKey));
      engine.applyTempo();
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
    if (editModeRef.current) { openEditor(id); return; }
    const col = syncStore.getColumnActive()[inst.key];
    const activeRow = col ? col.row : null;
    if (activeRow === rowIndex) {
      engine.stop(id);
    } else {
      engine.trigger(id);
      if (activeRow != null) engine.stop(padId(inst.key, activeRow));
      syncStore.markArmed(id);
    }
  }, [openEditor]);

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
        editActive={editMode}
        onHome={goHome}
        onToggleEdit={() => setEditMode((m) => !m)}
        onTogglePlay={onTogglePlay}
        onOpenTempo={() => setTempoOpen(true)}
        onOpenSignature={() => setSigOpen(true)}
        onOpenQuantize={() => setQOpen(true)}
      />

      <View style={styles.body}>
        <View style={styles.gridWrap}>
          <InstrumentGrid pads={pads} den={sig.den} onPadPress={onPadPress} onPadLong={onPadLong} />
        </View>
        <RightRail onStopAll={onStopAll} onOpenLibrary={openLibraryManage} onOpenMixer={() => setMixerOpen(true)} volume={volume} onVolume={onVolume} />
      </View>

      <SignaturePicker visible={sigOpen} num={sig.num} den={sig.den} onClose={() => setSigOpen(false)} onSelect={(num, den) => { setSig({ num, den }); setSigOpen(false); }} />
      <TempoDial
        visible={tempoOpen}
        bpm={bpm}
        onClose={() => setTempoOpen(false)}
        onChange={(v) => setBpm(Math.max(20, Math.min(300, Math.round(v))))}
        onDragStart={() => setTempoDragging(true)}
        onDragEnd={() => setTempoDragging(false)}
      />
      <QuantizePicker visible={qOpen} value={quantizeBeats} onClose={() => setQOpen(false)} onSelect={(b) => { setQuantizeBeats(b); setQOpen(false); }} />
      <LibraryBrowser visible={libOpen} library={library} missing={missing} mode={libMode} onClose={() => setLibOpen(false)} onChangeLibrary={onChangeLibrary} onPick={onPickFile} onImport={onImport} />
      {editorPadId ? (
        <SampleEditor
          visible={!!editorPadId}
          padId={editorPadId}
          name={(pads[editorPadId] || {}).name}
          bpm={(pads[editorPadId] || {}).bpm || bpm}
          waveform={waveform}
          edit={(pads[editorPadId] || {}).edit}
          onChange={onEditorChange}
          onSetBpm={onEditorSetBpm}
          onPreview={onEditorPreview}
          onClose={onCloseEditor}
        />
      ) : null}
      <Mixer visible={mixerOpen} mixer={mixer} onVol={onMixerVol} onToggleSolo={onToggleSolo} onToggleMute={onToggleMute} onClose={() => setMixerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
  body: { flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  gridWrap: { flex: 1 },
});
