import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, StyleSheet, Easing } from 'react-native';
import { theme } from '../theme';
import syncStore from '../audio/syncStore';
import SegmentRing from './SegmentRing';

// A pad that fills its grid cell (flex:1 — the whole board fits the screen).
//
// The ring is divided into one slice per BEAT of the loop, derived from the loop's
// OWN bpm and duration (beats = duration * bpm / 60, in the signature's beat unit).
// A 4-beat loop -> 4 slices, an 8-beat loop -> 8, a 6/8 loop -> 6 — independent of
// the project signature. Slices show always; while the loop plays, the current
// slice lights white and tracks the real audio playhead (phase), so it stays in
// sync with what's heard and wraps exactly when the loop repeats.
//   state: 0 none | 1 armed | 2 playing ; ph = loop phase 0..1 (audio playhead)
function Pad({ id, pad, color, den, onPress, onLongPress }) {
  const empty = !pad || !pad.uri;

  // Slice count from the loop's own tempo + length (fallback 4 if unknown).
  const slices = sliceCount(pad, den);

  const [st, setSt] = useState({ s: 0, cur: -1 });
  const ref = useRef(st);

  useEffect(() => {
    if (empty) return undefined;
    const apply = (v) => {
      let next;
      if (!v || v.s !== 2) next = { s: v ? v.s : 0, cur: -1 };
      else {
        const cur = Math.min(slices - 1, Math.max(0, Math.floor((v.ph || 0) * slices)));
        next = { s: 2, cur };
      }
      const c = ref.current;
      if (c.s !== next.s || c.cur !== next.cur) { ref.current = next; setSt(next); }
    };
    apply(syncStore.getPad(id));
    return syncStore.subscribePad(id, apply);
  }, [id, empty, slices]);

  const isPlaying = st.s === 2;
  const isArmed = st.s === 1;

  // Pulse the border while armed (queued for the next boundary).
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isArmed) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
    return undefined;
  }, [isArmed, pulse]);

  const bg = empty ? theme.surface
    : isPlaying ? withAlpha(color, 0.30)
    : isArmed ? withAlpha(color, 0.20)
    : withAlpha(color, 0.14);
  const borderColor = isArmed
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [withAlpha(color, 0.5), color] })
    : empty ? theme.border : isPlaying ? color : withAlpha(color, 0.5);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={280} style={styles.cell}>
      <Animated.View
        style={[
          styles.pad,
          { backgroundColor: bg, borderColor },
          isPlaying && { shadowColor: color, shadowOpacity: 0.6, shadowRadius: 9, elevation: 5 },
        ]}
      >
        {empty ? (
          <Text style={styles.plus}>+</Text>
        ) : (
          <View style={styles.content}>
            <View style={styles.ringWrap}>
              <SegmentRing
                size={RING}
                stroke={2.6}
                bars={slices}
                current={isPlaying ? st.cur : -1}
                color={color}
                hi="#FFFFFF"
                dim={0.42}
              />
            </View>
            <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
              {pad.name}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// beats = loop duration (s) * bpm / 60, expressed in the signature's beat unit
// (denominator/4 scales quarter-note bpm to the beat unit: /8 => x2). Fallback 4.
function sliceCount(pad, den) {
  const dur = pad && pad.durationSec;
  const bpm = pad && pad.bpm;
  if (dur > 0 && bpm > 0) {
    const quarters = dur * bpm / 60;
    const n = Math.round(quarters * ((den || 4) / 4));
    if (n >= 1) return Math.min(64, n);
  }
  return 4;
}

function withAlpha(hex, a) {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return `${hex}${v}`;
}

const RING = 18;
const styles = StyleSheet.create({
  cell: { flex: 1 },
  pad: { flex: 1, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 7, justifyContent: 'center' },
  plus: { color: theme.textFaint, fontSize: 16, fontWeight: '300', alignSelf: 'center', opacity: 0.5 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 11, fontWeight: '700' },
});

export default React.memo(Pad);
