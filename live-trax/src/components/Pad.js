import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, StyleSheet, Easing } from 'react-native';
import { theme } from '../theme';

// A pad that fills its grid cell (flex:1 — the whole board fits the screen).
export default function Pad({ pad, color, isPlaying, isQueued, onPress, onLongPress }) {
  const empty = !pad || !pad.uri;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isQueued) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
    return undefined;
  }, [isQueued, pulse]);

  const bg = empty ? theme.surface : isPlaying ? color : withAlpha(color, 0.18);
  const borderColor = isQueued
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [withAlpha(color, 0.4), color] })
    : empty ? theme.border : isPlaying ? color : withAlpha(color, 0.5);
  const fg = isPlaying ? '#12121A' : color;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={280} style={styles.cell}>
      <Animated.View
        style={[
          styles.pad,
          { backgroundColor: bg, borderColor },
          isPlaying && { shadowColor: color, shadowOpacity: 0.7, shadowRadius: 10, elevation: 5 },
        ]}
      >
        {empty ? (
          <Text style={styles.plus}>+</Text>
        ) : (
          <View style={styles.content}>
            <View style={[styles.ring, { borderColor: fg }]}>
              {isPlaying ? <View style={[styles.ringFill, { backgroundColor: fg }]} /> : null}
            </View>
            <Text numberOfLines={2} style={[styles.name, { color: isPlaying ? '#12121A' : theme.text }]}>
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

const styles = StyleSheet.create({
  cell: { flex: 1 },
  pad: { flex: 1, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 7, justifyContent: 'center' },
  plus: { color: theme.textFaint, fontSize: 16, fontWeight: '300', alignSelf: 'center', opacity: 0.5 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ring: { width: 15, height: 15, borderRadius: 7.5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ringFill: { width: 5, height: 5, borderRadius: 2.5 },
  name: { flex: 1, fontSize: 11, fontWeight: '700' },
});
