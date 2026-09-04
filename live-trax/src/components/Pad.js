import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { theme } from '../theme';

// A single pad. Three visual states:
//   empty     -> a dashed outline inviting a sample
//   loaded    -> a colored tile with the sample's name
//   playing   -> the loaded tile, lit (glowing border + brighter fill)
export default function Pad({ pad, isPlaying, onTrigger, onOptions }) {
  const empty = !pad.uri;
  const color = pad.color || theme.accent;

  return (
    <Pressable
      onPress={onTrigger}
      onLongPress={onOptions}
      delayLongPress={280}
      android_disableSound={true}
      style={({ pressed }) => [
        styles.pad,
        empty && styles.padEmpty,
        !empty && {
          backgroundColor: isPlaying ? color : withAlpha(color, 0.16),
          borderColor: isPlaying ? color : withAlpha(color, 0.5),
          shadowColor: color,
          shadowOpacity: isPlaying ? 0.9 : 0,
          shadowRadius: isPlaying ? 16 : 0,
          elevation: isPlaying ? 8 : 0,
        },
        pressed && styles.pressed,
      ]}
    >
      {empty ? (
        <Text style={styles.plus}>+</Text>
      ) : (
        <View style={styles.content}>
          {pad.loop ? (
            <Text style={[styles.loopBadge, { color: isPlaying ? '#0E0E12' : color }]}>
              LOOP
            </Text>
          ) : (
            <Text style={[styles.loopBadge, { color: isPlaying ? '#0E0E12' : theme.textFaint }]}>
              ONE-SHOT
            </Text>
          )}
          <Text
            numberOfLines={2}
            style={[styles.name, { color: isPlaying ? '#0E0E12' : theme.text }]}
          >
            {pad.name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// Overlay a hex color at a given alpha (0..1) as an 8-digit hex string.
function withAlpha(hex, alpha) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 10,
    justifyContent: 'flex-end',
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  padEmpty: {
    borderStyle: 'dashed',
    borderColor: theme.border,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  plus: {
    color: theme.textFaint,
    fontSize: 28,
    fontWeight: '300',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  loopBadge: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
  },
});
