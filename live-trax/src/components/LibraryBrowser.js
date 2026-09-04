import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, TextInput, ScrollView, StyleSheet, Animated, Dimensions, SafeAreaView, Keyboard, InputAccessoryView, Platform } from 'react-native';

const KB_ACCESSORY = 'lt-kb-done';
import { theme } from '../theme';
import { Folder, Chevron } from './Icons';
import {
  LIB_COLORS, childrenOf, pathTo, addFolder, updateFolder, updateFile, deleteFolder, deleteFile,
} from '../storage/library';

// The global library, as a right-side drawer (~half the app width) that respects
// the safe area — it slides in from the right rather than covering the screen.
export default function LibraryBrowser({ visible, library, mode, onClose, onChangeLibrary, onPick, onImport }) {
  const [folderId, setFolderId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: '', color: LIB_COLORS[0], tags: '', bpm: '' });

  const panelW = Math.max(320, Math.min(560, Dimensions.get('window').width * 0.55));
  const tx = useRef(new Animated.Value(panelW)).current;   // panel slide
  const bd = useRef(new Animated.Value(0)).current;        // backdrop fade (0..1)
  useEffect(() => {
    if (visible) {
      setFolderId(null); setEditing(null);
      // tx is parked off-screen (reset on close / init), so the first paint is
      // off-screen; then the dark backdrop fades in as the panel slides in.
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(bd, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else {
      // Park off-screen the moment it closes, so the NEXT open never flashes
      // on-screen for a frame before the slide-in starts.
      tx.setValue(panelW);
      bd.setValue(0);
    }
  }, [visible, panelW, tx, bd]);

  const { folders, files } = childrenOf(library, folderId);
  const crumbs = pathTo(library, folderId);

  const openEditor = (kind, item) => {
    setEditing({ kind, id: item.id });
    setDraft({ name: item.name, color: item.color, tags: (item.tags || []).join(', '), bpm: item.bpm ? String(item.bpm) : '' });
  };
  const saveEditor = () => {
    if (!editing) return;
    const patch = { name: draft.name.trim() || 'Untitled', color: draft.color };
    if (editing.kind === 'file') {
      patch.tags = draft.tags.split(',').map((s) => s.trim()).filter(Boolean);
      const n = parseInt(draft.bpm, 10);
      patch.bpm = n > 0 ? n : null;
    }
    onChangeLibrary(editing.kind === 'folder' ? updateFolder(library, editing.id, patch) : updateFile(library, editing.id, patch));
    setEditing(null);
  };
  const removeItem = () => {
    if (!editing) return;
    if (editing.kind === 'folder') { const { lib, uris } = deleteFolder(library, editing.id); onChangeLibrary(lib, { uris }); }
    else { const { lib, uri } = deleteFile(library, editing.id); onChangeLibrary(lib, { uris: uri ? [uri] : [] }); }
    setEditing(null);
  };
  const newFolder = () => {
    const { lib, id } = addFolder(library, 'New Folder', folderId);
    onChangeLibrary(lib);
    setEditing({ kind: 'folder', id });
    setDraft({ name: 'New Folder', color: LIB_COLORS[8], tags: '', bpm: '' });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: bd }]}>
          <Pressable style={styles.backdropPress} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.panel, { width: panelW, transform: [{ translateX: tx }] }]}>
          <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
              <Text style={styles.title}>{mode === 'pick' ? 'Choose a loop' : 'Library'}</Text>
              <View style={styles.headerBtns}>
                <Pressable style={styles.hBtn} onPress={newFolder}><Text style={styles.hBtnTxt}>+ Folder</Text></Pressable>
                <Pressable style={[styles.hBtn, styles.hBtnPrimary]} onPress={() => onImport(folderId)}><Text style={[styles.hBtnTxt, { color: '#0E0E12' }]}>Import</Text></Pressable>
                <Pressable style={styles.hClose} onPress={onClose}><Text style={styles.hCloseTxt}>✕</Text></Pressable>
              </View>
            </View>

            <View style={styles.crumbs}>
              <Pressable onPress={() => setFolderId(null)}><Text style={styles.crumb}>Home</Text></Pressable>
              {crumbs.map((f) => (
                <View key={f.id} style={styles.crumbItem}>
                  <Text style={styles.crumbSep}>›</Text>
                  <Pressable onPress={() => setFolderId(f.id)}><Text style={styles.crumb}>{f.name}</Text></Pressable>
                </View>
              ))}
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {folders.length === 0 && files.length === 0 ? (
                <Text style={styles.empty}>Empty folder. Import a loop or add a subfolder.</Text>
              ) : null}

              {folders.map((f) => (
                <Pressable key={f.id} style={styles.row} onPress={() => setFolderId(f.id)} onLongPress={() => openEditor('folder', f)}>
                  <View style={[styles.chip, { backgroundColor: f.color }]} />
                  <Folder size={18} color={theme.textDim} />
                  <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
                  <Chevron size={12} color={theme.textFaint} />
                </Pressable>
              ))}

              {files.map((f) => (
                <Pressable key={f.id} style={styles.row} onPress={() => (mode === 'pick' ? onPick(f) : openEditor('file', f))} onLongPress={() => openEditor('file', f)}>
                  <View style={[styles.chip, { backgroundColor: f.color }]} />
                  <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
                  {f.bpm ? <Text style={styles.bpm}>{f.bpm} BPM</Text> : null}
                  {f.tags && f.tags.length ? (
                    <View style={styles.tags}>{f.tags.slice(0, 2).map((t) => <Text key={t} style={styles.tag}>{t}</Text>)}</View>
                  ) : null}
                  {mode === 'pick' ? <Text style={styles.use}>Use</Text> : <Chevron size={12} color={theme.textFaint} />}
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.hint}>
              {mode === 'pick' ? 'Tap a loop to load it onto the pad. ' : 'Tap to edit. '}
              Long-press to rename, recolor, or tag.
            </Text>
          </SafeAreaView>
        </Animated.View>

        {editing ? (
          <Pressable style={styles.editorWrap} onPress={() => Keyboard.dismiss()}>
            <Pressable style={styles.editor} onPress={() => {}}>
              <Text style={styles.editorTitle}>{editing.kind === 'folder' ? 'Folder' : 'Loop'}</Text>
              <Text style={styles.elabel}>NAME</Text>
              <TextInput value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} style={styles.input} placeholder="Name" placeholderTextColor={theme.textFaint} returnKeyType="done" blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} inputAccessoryViewID={Platform.OS === 'ios' ? KB_ACCESSORY : undefined} />
              {editing.kind === 'file' ? (
                <>
                  <Text style={styles.elabel}>ORIGINAL BPM (for tempo-lock)</Text>
                  <TextInput value={draft.bpm} onChangeText={(bpm) => setDraft((d) => ({ ...d, bpm: bpm.replace(/[^0-9]/g, '') }))} style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 120" placeholderTextColor={theme.textFaint} inputAccessoryViewID={Platform.OS === 'ios' ? KB_ACCESSORY : undefined} />
                  <Text style={styles.elabel}>TAGS (comma-separated)</Text>
                  <TextInput value={draft.tags} onChangeText={(tags) => setDraft((d) => ({ ...d, tags }))} style={styles.input} placeholder="kick, 120, dark" placeholderTextColor={theme.textFaint} returnKeyType="done" blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} inputAccessoryViewID={Platform.OS === 'ios' ? KB_ACCESSORY : undefined} />
                </>
              ) : null}
              <Text style={styles.elabel}>COLOR</Text>
              <View style={styles.swatches}>
                {LIB_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setDraft((d) => ({ ...d, color: c }))} style={[styles.swatch, { backgroundColor: c }, draft.color === c && styles.swatchSel]} />
                ))}
              </View>
              <View style={styles.editorBtns}>
                <Pressable style={styles.del} onPress={removeItem}><Text style={styles.delTxt}>Delete</Text></Pressable>
                <Pressable style={styles.save} onPress={saveEditor}><Text style={styles.saveTxt}>Done</Text></Pressable>
              </View>
            </Pressable>
          </Pressable>
        ) : null}

        {/* iOS: a Done bar above the keyboard so numeric fields can be dismissed */}
        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={KB_ACCESSORY}>
            <View style={styles.kbBar}>
              <Pressable onPress={() => Keyboard.dismiss()} style={styles.kbDone}><Text style={styles.kbDoneTxt}>Done</Text></Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  backdropPress: { flex: 1 },
  panel: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: theme.bgElevated, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderLeftWidth: 1, borderColor: theme.border },
  safe: { flex: 1, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingBottom: 8 },
  title: { color: theme.text, fontSize: 17, fontWeight: '800' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  hBtnPrimary: { backgroundColor: theme.good, borderColor: theme.good },
  hBtnTxt: { color: theme.text, fontWeight: '700', fontSize: 12 },
  hClose: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  hCloseTxt: { color: theme.textDim, fontSize: 15, fontWeight: '700' },
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 14, paddingBottom: 8, gap: 4 },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumb: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  crumbSep: { color: theme.textFaint, fontSize: 13 },
  list: { flex: 1, paddingHorizontal: 10 },
  listContent: { paddingBottom: 8, gap: 6 },
  empty: { color: theme.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 11 },
  chip: { width: 9, height: 22, borderRadius: 3 },
  rowName: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '600' },
  bpm: { color: theme.good, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', gap: 4 },
  tag: { color: theme.textDim, fontSize: 10, fontWeight: '700', backgroundColor: theme.surfaceActive, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  use: { color: theme.good, fontWeight: '800', fontSize: 12 },
  hint: { color: theme.textFaint, fontSize: 12, paddingHorizontal: 14, paddingTop: 6 },

  editorWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  editor: { width: 360, maxWidth: '86%', backgroundColor: theme.bgElevated, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: theme.border },
  editorTitle: { color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  elabel: { color: theme.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: theme.surface, borderRadius: 8, borderWidth: 1, borderColor: theme.border, color: theme.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  swatchSel: { borderColor: theme.text },
  editorBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  del: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: theme.danger },
  delTxt: { color: theme.danger, fontWeight: '800', fontSize: 14 },
  save: { backgroundColor: theme.text, borderRadius: 8, paddingHorizontal: 22, paddingVertical: 11 },
  saveTxt: { color: theme.bg, fontWeight: '800', fontSize: 14 },
  kbBar: { backgroundColor: theme.bgElevated, borderTopWidth: 1, borderTopColor: theme.border, alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8 },
  kbDone: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.accent },
  kbDoneTxt: { color: '#0E0E12', fontWeight: '800', fontSize: 14 },
});
