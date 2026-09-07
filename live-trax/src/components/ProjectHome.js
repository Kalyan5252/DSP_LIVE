import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Modal, Platform } from 'react-native';
import { theme, colorForIndex } from '../theme';
import { listProjects, padCount } from '../storage/projects';

// Home screen: lists the user's projects. Selecting one loads its grid + settings
// (the library stays global). New / rename / delete live here too.
export default function ProjectHome({ projects, onOpen, onCreate, onRename, onDelete }) {
  const items = listProjects(projects);
  const [editing, setEditing] = useState(null); // { mode:'create' } | { mode:'edit', id, name }
  const [draft, setDraft] = useState('');

  const startCreate = () => { setDraft(''); setEditing({ mode: 'create' }); };
  const startEdit = (p) => { setDraft(p.name); setEditing({ mode: 'edit', id: p.id, name: p.name }); };
  const commit = () => {
    if (!editing) return;
    const name = draft.trim() || 'Untitled Project';
    if (editing.mode === 'create') onCreate(name);
    else onRename(editing.id, name);
    setEditing(null);
  };
  const remove = () => { if (editing && editing.mode === 'edit') onDelete(editing.id); setEditing(null); };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Live Trax</Text>
          <Text style={styles.sub}>{items.length ? `${items.length} project${items.length > 1 ? 's' : ''}` : 'Create your first project'}</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={startCreate}>
          <Text style={styles.newPlus}>+</Text>
          <Text style={styles.newTxt}>New Project</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Pressable style={styles.empty} onPress={startCreate}>
          <Text style={styles.emptyPlus}>+</Text>
          <Text style={styles.emptyTitle}>New Project</Text>
          <Text style={styles.emptyHint}>Your loops live in the shared library; a project is a board you build from them.</Text>
        </Pressable>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {items.map((p, i) => (
            <Pressable key={p.id} style={styles.card} onPress={() => onOpen(p.id)} onLongPress={() => startEdit(p)}>
              <View style={[styles.stripe, { backgroundColor: colorForIndex(i) }]} />
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={2}>{p.name}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaMain}>{padCount(p)} loops</Text>
                  <Text style={styles.metaDim}>{p.bpm} BPM · {p.sig.num}/{p.sig.den}</Text>
                </View>
                <Text style={styles.updated}>{relTime(p.updatedAt)}</Text>
              </View>
              <Pressable style={styles.cardEdit} onPress={() => startEdit(p)} hitSlop={8}>
                <Text style={styles.cardEditTxt}>•••</Text>
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!editing} transparent animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']} onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Text style={styles.dialogTitle}>{editing && editing.mode === 'create' ? 'New Project' : 'Rename Project'}</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              style={styles.input}
              placeholder="Project name"
              placeholderTextColor={theme.textFaint}
              returnKeyType="done"
              onSubmitEditing={commit}
            />
            <View style={styles.dialogBtns}>
              {editing && editing.mode === 'edit' ? (
                <Pressable style={styles.del} onPress={remove}><Text style={styles.delTxt}>Delete</Text></Pressable>
              ) : <View />}
              <View style={styles.dialogRight}>
                <Pressable style={styles.cancel} onPress={() => setEditing(null)}><Text style={styles.cancelTxt}>Cancel</Text></Pressable>
                <Pressable style={styles.save} onPress={commit}><Text style={styles.saveTxt}>{editing && editing.mode === 'create' ? 'Create' : 'Save'}</Text></Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function relTime(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 18, paddingTop: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { color: theme.text, fontSize: 24, fontWeight: '900', letterSpacing: 0.4 },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.good, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  newPlus: { color: '#0E0E12', fontSize: 18, fontWeight: '900', marginTop: -2 },
  newTxt: { color: '#0E0E12', fontSize: 14, fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 24 },
  card: { width: 210, height: 118, flexDirection: 'row', backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  stripe: { width: 6 },
  cardBody: { flex: 1, padding: 13, justifyContent: 'space-between' },
  cardName: { color: theme.text, fontSize: 16, fontWeight: '800' },
  cardMeta: { gap: 1 },
  metaMain: { color: theme.text, fontSize: 12, fontWeight: '700' },
  metaDim: { color: theme.textDim, fontSize: 11, fontWeight: '600' },
  updated: { color: theme.textFaint, fontSize: 10, fontWeight: '600' },
  cardEdit: { position: 'absolute', top: 6, right: 6, width: 30, height: 26, alignItems: 'center', justifyContent: 'center' },
  cardEditTxt: { color: theme.textFaint, fontSize: 14, fontWeight: '900' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.border, borderStyle: 'dashed', borderRadius: 18, marginBottom: 24 },
  emptyPlus: { color: theme.textDim, fontSize: 40, fontWeight: '200' },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
  emptyHint: { color: theme.textDim, fontSize: 13, marginTop: 8, maxWidth: 360, textAlign: 'center', lineHeight: 19 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  dialog: { width: '70%', maxWidth: 460, backgroundColor: theme.bgElevated, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: theme.border },
  dialogTitle: { color: theme.text, fontSize: 16, fontWeight: '800', marginBottom: 14 },
  input: { backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border, color: theme.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  dialogBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dialogRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  del: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.danger },
  delTxt: { color: theme.danger, fontWeight: '800', fontSize: 13 },
  cancel: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.border },
  cancelTxt: { color: theme.textDim, fontWeight: '700', fontSize: 13 },
  save: { backgroundColor: theme.good, borderRadius: 9, paddingHorizontal: 18, paddingVertical: 10 },
  saveTxt: { color: '#0E0E12', fontWeight: '800', fontSize: 13 },
});
