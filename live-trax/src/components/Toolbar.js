import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

// Top bar: app name + a live count of how many pads are sounding, plus a
// prominent Stop-all control (the "panic button" every performer wants).
export default function Toolbar({ activeCount, onStopAll }) {
  return (
    <View style={styles.bar}>
      <View>
        <Text style={styles.title}>Live Trax</Text>
        <Text style={styles.subtitle}>
          {activeCount > 0 ? `${activeCount} playing` : 'tap a pad to play'}
        </Text>
      </View>
      <Pressable
        onPress={onStopAll}
        style={({ pressed }) => [
          styles.stop,
          activeCount > 0 && styles.stopActive,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text
          style={[styles.stopText, activeCount > 0 && { color: '#fff' }]}
        >
          STOP ALL
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 18,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: theme.textDim,
    fontSize: 13,
    marginTop: 2,
  },
  stop: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  stopActive: {
    backgroundColor: theme.danger,
    borderColor: theme.danger,
  },
  stopText: {
    color: theme.textDim,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
  },
});
