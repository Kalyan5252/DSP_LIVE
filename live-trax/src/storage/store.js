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

// Copy a picked file into permanent app storage. Returns the new stable uri.
export async function importSampleFile(sourceUri, originalName) {
  await ensureSamplesDir();
  const stamp = Date.now();
  const dest = `${SAMPLES_DIR}${stamp}_${safeName(originalName)}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

// Remove a stored sample file (best effort).
export async function deleteSampleFile(uri) {
  if (!uri || !uri.startsWith(SAMPLES_DIR)) return;
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
