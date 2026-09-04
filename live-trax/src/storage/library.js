// Global sample library — the app's file system for loops.
//
// Users organize imported loops into folders, tag them, color them, and rename
// them; pads then reference a library file's uri. The whole tree is a plain data
// object persisted to AsyncStorage. These helpers are pure (they take a library
// and return a new one), so the UI stays simple and predictable.
//
//   library = {
//     folders: { [id]: { id, name, color, parentId } },
//     files:   { [id]: { id, name, uri, color, tags: [], folderId } },
//   }
//   root is parentId/folderId === null

export const LIB_COLORS = [
  '#E5484D', '#F76B15', '#E2B72E', '#46A758',
  '#2EA5B8', '#4C74E5', '#8E6BE5', '#E5559F', '#8A8A99',
];

export function emptyLibrary() {
  return { folders: {}, files: {} };
}

let _seq = 0;
function uid(prefix) {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq}`;
}

export function addFolder(lib, name, parentId = null, color = LIB_COLORS[8]) {
  const id = uid('fld');
  const folders = { ...lib.folders, [id]: { id, name: name || 'New Folder', color, parentId } };
  return { lib: { ...lib, folders }, id };
}

export function addFile(lib, { name, uri }, folderId = null, color = LIB_COLORS[0]) {
  const id = uid('fil');
  const files = { ...lib.files, [id]: { id, name: name || 'Loop', uri, color, tags: [], folderId } };
  return { lib: { ...lib, files }, id };
}

export function updateFolder(lib, id, patch) {
  if (!lib.folders[id]) return lib;
  return { ...lib, folders: { ...lib.folders, [id]: { ...lib.folders[id], ...patch } } };
}

export function updateFile(lib, id, patch) {
  if (!lib.files[id]) return lib;
  return { ...lib, files: { ...lib.files, [id]: { ...lib.files[id], ...patch } } };
}

// Delete a file. Returns { lib, uri } so the caller can remove it from disk.
export function deleteFile(lib, id) {
  const uri = lib.files[id]?.uri;
  const files = { ...lib.files };
  delete files[id];
  return { lib: { ...lib, files }, uri };
}

// Delete a folder and everything under it. Returns { lib, uris } (files to erase).
export function deleteFolder(lib, id) {
  const removeIds = new Set();
  const collect = (fid) => {
    removeIds.add(fid);
    Object.values(lib.folders).forEach((f) => { if (f.parentId === fid) collect(f.id); });
  };
  collect(id);

  const folders = {};
  Object.values(lib.folders).forEach((f) => { if (!removeIds.has(f.id)) folders[f.id] = f; });

  const files = {};
  const uris = [];
  Object.values(lib.files).forEach((f) => {
    if (removeIds.has(f.folderId)) uris.push(f.uri);
    else files[f.id] = f;
  });

  return { lib: { folders, files }, uris };
}

export function childrenOf(lib, folderId) {
  const folders = Object.values(lib.folders)
    .filter((f) => f.parentId === folderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = Object.values(lib.files)
    .filter((f) => f.folderId === folderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { folders, files };
}

// Breadcrumb from root to the given folder.
export function pathTo(lib, folderId) {
  const path = [];
  let cur = folderId;
  while (cur != null && lib.folders[cur]) {
    path.unshift(lib.folders[cur]);
    cur = lib.folders[cur].parentId;
  }
  return path; // e.g. [{Drums}, {Kicks}]
}

// Every file whose tags include `tag` (simple tag search).
export function filesWithTag(lib, tag) {
  const t = tag.trim().toLowerCase();
  return Object.values(lib.files).filter((f) => (f.tags || []).some((x) => x.toLowerCase() === t));
}
