// JSI bridge for PadEngine.
//
// This is the seam between JavaScript and the C++ engine. It installs a host
// object at  global.__LiveTrax  whose methods call straight into PadEngine
// with near-zero overhead (no bridge serialization) — the modern React Native
// (New Architecture / JSI) way, the same foundation TurboModules are built on.
//
// You call installPadEngine(runtime) once, from the native side, on the JS
// thread. INTEGRATION.md shows exactly where, for both an Expo Module and a
// bare React Native TurboModule.

#pragma once

#include <jsi/jsi.h>
#include <memory>

namespace livetrax {

// Installs global.__LiveTrax into the given JS runtime.
// Safe to call once per runtime.
void installPadEngine(facebook::jsi::Runtime& runtime);

} // namespace livetrax
