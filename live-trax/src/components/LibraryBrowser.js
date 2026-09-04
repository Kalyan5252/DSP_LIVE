import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Folder, Chevron } from './Icons';
import {
  LIB_COLORS, childrenOf, pathTo, addFolder, updateFolder, updateFile, deleteFolder, deleteFile,
} from '../storage/library';

// The global library browser. Navigate folders, import loops, and organize them
// (rename, recolor, tag, delete). In "pick" mode, tapping a file assigns it to
// the pad that opened the browser.
export default function LibraryBrowser({ visible, library, mode, onClose, onChangeLibrary, onPick, onImport }) {
  const [folderId, setFolderId] = useState(null);
  const [editing, setEditing] = useState(null); // { kind:'folder'|'file', id }
  const [draft, setDraft] = useState({ name: '', color: LIB_COLORS[0], tags: '' });

  useEffect(() => { if (visible) { setFolderId(null); setEditing(null); } }, [visible]);

  const { folders, files } = childrenOf(library, folderId);
  const crumbs = pathTo(library, folderId);

  const openEditor = (kind, item) => {
    setEditing({ kind, id: item.id });
    setDraft({ name: item.name, color: item.color, tags: (item.tags || []).join(', ') });
  };

  const saveEditor = () => {
    if (!editing) return;
    const patch = { name: draft.name.trim() || 'Untitled', color: draft.color };
    if (editing.kind === 'file') patch.tags = draft.tags.split(',').map((s) => s.trim()).filter(Boolean);
    const next = editing.kind === 'folder'
      ? updateFolder(library, editing.id, patch)
      : updateFile(library, editing.id, patch);
    onChangeLibrary(next);
    setEditing(null);
  };

  const removeItem = () => {
    if (!editing) return;
    if (editing.kind === 'folder') {
      const { lib, uris } = deleteFolder(library, editing.id);
      onChangeLibrary(lib, { uris });
    } else {
      const { lib, uri } = deleteFile(library, editing.id);
      onChangeLibrary(lib, { uris: uri ? [uri] : [] });
    }
    setEditing(null);
  };

  const newFolder = () => {
    const { lib, id } = addFolder(library, 'New Folder', folderId);
    onChangeLibrary(lib);
    setEditing({ kind: 'folder', id });
    setDraft({ name: 'New Folder', color: LIB_COLORS[8], tags: '' });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* header */}
          <View style={styles.header}>
            <Text style={styles.title}>{mode === 'pick' ? 'Choose a loop' : 'Library'}</Text>
            <View style={styles.headerBtns}>
              <Pressable style={styles.hBtn} onPress={newFolder}><Text style={styles.hBtnTxt}>+ Folder</Text></Pressable>
              <Pressable style={[styles.hBtn, styles.hBtnPrimary]} onPress={() => onImport(folderId)}>
                <Text style={[styles.hBtnTxt, { color: '#0E0E12' }]}>Import</Text>
              </Pressable>
              <Pressable style={styles.hClose} onPress={onClose}><Text style={styles.hCloseTxt}>✕</Text></Pressable>
            </View>
          </View>

          {/* breadcrumb */}
          <View style={styles.crumbs}>
            <Pressable onPress={() => setFolderId(null)}><Text style={styles.crumb}>Home</Text></Pressable>
            {crumbs.map((f) => (
              <View key={f.id} style={styles.crumbItem}>
                <Text style={styles.crumbSep}>›</Text>
                <Pressable onPress={() => setFolderId(f.id)}><Text style={styles.crumb}>{f.name}</Text></Pressable>
              </View>
            ))}
          </View>

          {/* list */}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {folders.length === 0 && files.length === 0 ? (
              <Text style={styles.empty}>Empty folder. Import a loop or create a subfolder.</Text>
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
              <Pressable
                key={f.id}
                style={styles.row}
                onPress={() => (mode === 'pick' ? onPick(f) : openEditor('file', f))}
                onLongPress={() => openEditor('file', f)}
              >
                <View style={[styles.chip, { backgroundColor: f.color }]} />
                <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
                {f.tags && f.tags.length ? (
                  <View style={styles.tags}>
                    {f.tags.slice(0, 3).map((t) => <Text key={t} style={styles.tag}>{t}</Text>)}
                  </View>
                ) : null}
                {mode === 'pick' ? <Text style={styles.use}>Use</Text> : <Chevron size={12} color={theme.textFaint} />}
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.hint}>
            {mode === 'pick' ? 'Tap a loop to load it onto the pad. ' : 'Tap to edit. '}
            Long-press any item to rename, recolor, or tag it.
          </Text>
        </View>

        {/* item editor */}
        {editing ? (
          <View style={styles.editorWrap}>
            <View style={styles.editor}>
              <Text style={styles.editorTitle}>{editing.kind === 'folder' ? 'Folder' : 'Loop'}</Text>

              <Text style={styles.label}>NAME</Text>
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                style={styles.input}
                placeholder="Name"
                placeholderTextColor={theme.textFaint}
              />

              {editing.kind === 'file' ? (
                <>
                  <Text style={styles.label}>TAGS (comma-separated)</Text>
                  <TextInput
                    value={draft.tags}
                    onChangeText={(tags) => setDraft((d) => ({ ...d, tags }))}
                    style={styles.input}
                    placeholder="kick, 120, dark"
                    placeholderTextColor={theme.textFaint}
                  />
                </>
              ) : null}

              <Text style={styles.label}>COLOR</Text>
              <View style={styles.swatches}>
                {LIB_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setDraft((d) => ({ ...d, color: c }))}
                    style={[styles.swatch, { backgroundColor: c }, draft.color === c && styles.swatchSel]} />
                ))}
              </View>

              <View style={styles.editorBtns}>
                <Pressable style={styles.del} onPress={removeItem}><Text style={styles.delTxt}>Delete</Text></Pressable>
                <Pressable style={styles.save} onPress={saveEditor}><Text style={styles.saveTxt}>Done</Text></Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.bgElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: theme.border, maxHeight: '92%', paddingBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  title: { color: theme.text, fontSize: 18, fontWeight: '800' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  hBtnPrimary: { backgroundColor: theme.good, borderColor: theme.good },
  hBtnTxt: { color: theme.text, fontWeight: '700', fontSize: 13 },
  hClose: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  hCloseTxt: { color: theme.textDim, fontSize: 16, fontWeight: '700' },
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 8, gap: 4 },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumb: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  crumbSep: { color: theme.textFaint, fontSize: 13 },
  list: { paddingHorizontal: 12 },
  listContent: { paddingBottom: 8, gap: 6 },
  empty: { color: theme.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  chip: { width: 10, height: 24, borderRadius: 3 },
  rowName: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '600' },
  tags: { flexDirection: 'row', gap: 4 },
  tag: { color: theme.textDim, fontSize: 10, fontWeight: '700', backgroundColor: theme.surfaceActive, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  use: { color: theme.good, fontWeight: '800', fontSize: 12 },
  hint: { color: theme.textFaint, fontSize: 12, paddingHorizontal: 16, paddingTop: 6 },

  editorWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  editor: { width: 360, maxWidth: '92%', backgroundColor: theme.bgElevated, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: theme.border },
  editorTitle: { color: theme.text, fontSize: 16, fontWeight: '800', marginBottom: 14 },
  label: { color: theme.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border, color: theme.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  swatchSel: { borderColor: theme.text },
  editorBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  del: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.danger },
  delTxt: { color: theme.danger, fontWeight: '800', fontSize: 14 },
  save: { backgroundColor: theme.text, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  saveTxt: { color: theme.bg, fontWeight: '800', fontSize: 14 },
});
