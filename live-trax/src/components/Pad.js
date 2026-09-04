import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, StyleSheet, Easing } from 'react-native';
import { theme } from '../theme';

// One pad in an instrument column. States:
//   empty    -> faint outline in the instrument color, "+" to load a loop
//   loaded   -> tinted tile with the loop name
//   queued   -> loaded + pulsing ring (waiting for the next bar to start)
//   playing  -> filled in the instrument color (the one active pad in its column)
export default function Pad({ pad, instrument, rowLabel, isPlaying, isQueued, onPress, onLongPress }) {
  const empty = !pad || !pad.uri;
  const color = instrument.color;

  // Pulse animation for the queued (about-to-launch) state.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isQueued) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          Animated.timing(pulse, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
    return undefined;
  }, [isQueued, pulse]);

  const borderColor = isQueued
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [withAlpha(color, 0.4), color] })
    : isPlaying
    ? color
    : withAlpha(color, empty ? 0.28 : 0.55);

  const bg = isPlaying ? color : withAlpha(color, empty ? 0.06 : 0.16);
  const textColor = isPlaying ? '#0E0E12' : empty ? theme.textFaint : theme.text;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={280} style={styles.wrap}>
      <Animated.View
        style={[
          styles.pad,
          { backgroundColor: bg, borderColor },
          isPlaying && { shadowColor: color, shadowOpacity: 0.8, shadowRadius: 12, elevation: 6 },
        ]}
      >
        <View style={styles.top}>
          <View style={[styles.dot, { borderColor: isPlaying ? '#0E0E12' : withAlpha(color, 0.8) }]}>
            {isPlaying ? <View style={[styles.dotFill, { backgroundColor: '#0E0E12' }]} /> : null}
          </View>
          <Text style={[styles.row, { color: isPlaying ? '#0E0E12' : withAlpha(color, 0.9) }]}>{rowLabel}</Text>
        </View>
        <Text numberOfLines={2} style={[styles.name, { color: textColor }]}>
          {empty ? instrument.name : pad.name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function withAlpha(hex, a) {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return `${hex}${v}`;
}

const PAD_W = 92;
const PAD_H = 78;

const styles = StyleSheet.create({
  wrap: { width: PAD_W, height: PAD_H },
  pad: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 8,
    justifyContent: 'space-between',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dotFill: { width: 5, height: 5, borderRadius: 2.5 },
  row: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  name: { fontSize: 12, fontWeight: '600' },
});

export const PAD_WIDTH = PAD_W;
export const PAD_HEIGHT = PAD_H;
