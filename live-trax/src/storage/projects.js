// Projects — each project is an independent board (its grid of pads + transport
// settings). The sample LIBRARY (files/folders) is global and shared across all
// projects; only pad placements and settings live in a project.
//
//   projects = {
//     order: [id, ...],                 // display order (newest first)
//     byId:  { [id]: Project },
//   }
//   Project = {
//     id, name, createdAt, updatedAt,
//     pads: { [padId]: { uri, name, bpm, durationSec } },
//     bpm, sig: { num, den }, quantizeBeats, volume,
//   }

export function emptyProjects() {
  return { order: [], byId: {} };
}

let _seq = 0;
function uid() {
  _seq += 1;
  return `prj_${Date.now().toString(36)}_${_seq}`;
}

export function defaultSettings() {
  return { pads: {}, bpm: 120, sig: { num: 4, den: 4 }, quantizeBeats: 4, volume: 1 };
}

export function createProject(projects, name, seed) {
  const id = uid();
  const now = Date.now();
  const base = defaultSettings();
  const proj = {
    id,
    name: (name && name.trim()) || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    ...base,
    ...(seed || {}),
  };
  return {
    projects: { order: [id, ...projects.order], byId: { ...projects.byId, [id]: proj } },
    id,
  };
}

export function updateProject(projects, id, patch) {
  const cur = projects.byId[id];
  if (!cur) return projects;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  return { ...projects, byId: { ...projects.byId, [id]: next } };
}

export function renameProject(projects, id, name) {
  return updateProject(projects, id, { name: (name && name.trim()) || 'Untitled Project' });
}

export function deleteProject(projects, id) {
  const byId = { ...projects.byId };
  delete byId[id];
  return { order: projects.order.filter((x) => x !== id), byId };
}

export function listProjects(projects) {
  return projects.order.map((id) => projects.byId[id]).filter(Boolean);
}

export function getProject(projects, id) {
  return projects.byId[id] || null;
}

export function padCount(project) {
  return project && project.pads ? Object.values(project.pads).filter((p) => p && p.uri).length : 0;
}
