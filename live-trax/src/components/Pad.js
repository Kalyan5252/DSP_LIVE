import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, StyleSheet, Easing } from 'react-native';
import { theme } from '../theme';
import syncStore from '../audio/syncStore';
import SegmentRing from './SegmentRing';

// A pad that fills its grid cell (flex:1 — the whole board fits the screen).
//
// The ring is split into one slice per BEAT IN A BAR (the time-signature
// numerator: 4/4 -> 4, 6/8 -> 6, 7/8 -> 7). The slices are ALWAYS shown; while the
// pad plays, the current beat lights up white and steps around in sync with the
// audio — the Remixlive bar/beat indicator.
//   state: 0 none | 1 armed (queued) | 2 playing ; bt = current beat in bar
function Pad({ id, pad, color, beats, onPress, onLongPress }) {
  const empty = !pad || !pad.uri;
  const slices = Math.max(1, beats | 0);
  const [st, setSt] = useState({ s: 0, bt: -1 });
  const ref = useRef(st);

  useEffect(() => {
    if (empty) return undefined;
    const apply = (v) => {
      const next = v ? { s: v.s, bt: v.s === 2 ? (v.bt | 0) : -1 } : { s: 0, bt: -1 };
      const cur = ref.current;
      if (cur.s !== next.s || cur.bt !== next.bt) { ref.current = next; setSt(next); }
    };
    apply(syncStore.getPad(id));
    return syncStore.subscribePad(id, apply);
  }, [id, empty]);

  const isPlaying = st.s === 2;
  const isArmed = st.s === 1;
  const current = isPlaying ? ((st.bt % slices) + slices) % slices : -1;

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
                current={current}
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
