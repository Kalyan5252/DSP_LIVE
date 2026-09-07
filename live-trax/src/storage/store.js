// Persistence layer.
//
// Two things need to survive an app restart:
//   1. The pad layout (which sample sits on which pad, its name, color, loop mode).
//   2. The actual audio files. A file picked with DocumentPicker lives in a
//      temporary cache location that the OS can purge, so we copy each imported
//      file into the app's own document directory and remember that stable path.
//
// We use the legacy expo-file-system API because its imperative helpers
// (documentDirectory, copyAsync, getInfoAsync) map cleanly onto this job.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const STATE_KEY = 'livetrax.state.v1';
const SAMPLES_DIR = FileSystem.documentDirectory + 'samples/';

async function ensureSamplesDir() {
  const info = await FileSystem.getInfoAsync(SAMPLES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SAMPLES_DIR, { intermediates: true });
  }
}

function safeName(name) {
  // Keep the extension, strip anything that could break a path.
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// IMPORTANT: iOS reassigns the app's data-container UUID on every reinstall /
// rebuild, so the ABSOLUTE documentDirectory path changes even though the files
// are migrated. We therefore STORE a stable RELATIVE ref ("samples/<file>") and
// rebuild the absolute uri at runtime with resolveSampleUri(). This is what lets
// grid pads keep working across `expo run:ios` without re-importing anything.

// The stable relative ref ("samples/<file>") for a stored sample, from either a
// relative ref or any older absolute uri.
export function sampleRelPath(stored) {
  if (!stored) return stored;
  const i = stored.indexOf('samples/');
  return i >= 0 ? stored.slice(i) : stored;
}

// Resolve a stored sample ref to an absolute file:// uri under the CURRENT
// document directory. Handles both new relative refs and legacy absolute paths.
export function resolveSampleUri(stored) {
  if (!stored) return stored;
  const i = stored.indexOf('samples/');
  if (i >= 0) return FileSystem.documentDirectory + stored.slice(i);
  return stored; // external/unknown source - leave as-is
}

// Copy a picked file into permanent app storage. Returns a STABLE RELATIVE ref
// ("samples/<file>") - never an absolute path (see note above).
export async function importSampleFile(sourceUri, originalName) {
  await ensureSamplesDir();
  const stamp = Date.now();
  const rel = `samples/${stamp}_${safeName(originalName)}`;
  const dest = FileSystem.documentDirectory + rel;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return rel;
}

// Remove a stored sample file (best effort). Accepts relative or absolute refs.
export async function deleteSampleFile(stored) {
  const uri = resolveSampleUri(stored);
  if (!uri || uri.indexOf('samples/') < 0) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    // Non-fatal: a missing file is fine.
  }
}

export async function saveState(pads) {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ pads }));
  } catch (e) {
    // Persistence is a convenience; never crash the session over it.
  }
}

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.pads) ? parsed.pads : null;
  } catch (e) {
    return null;
  }
}
