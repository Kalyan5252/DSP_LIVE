// Line-style icons drawn with plain Views — no icon font/library needed, so the
// app has zero extra dependencies and the glyphs render identically everywhere.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function Home({ size = 20, color = '#fff' }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: size * 0.42, borderRightWidth: size * 0.42, borderBottomWidth: size * 0.4,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
      }} />
      <View style={{ width: size * 0.62, height: size * 0.42, backgroundColor: color, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginTop: -1 }} />
    </View>
  );
}

export function Play({ size = 18, color = '#fff' }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 0, height: 0,
        borderTopWidth: size * 0.32, borderBottomWidth: size * 0.32, borderLeftWidth: size * 0.5,
        borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color,
        marginLeft: size * 0.12,
      }} />
    </View>
  );
}

export function Pause({ size = 18, color = '#fff' }) {
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * 0.16 }}>
      <View style={{ width: size * 0.2, height: size * 0.62, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: size * 0.2, height: size * 0.62, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

export function Record({ size = 18, color = '#E5484D' }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.62, height: size * 0.62, borderRadius: size * 0.31, backgroundColor: color }} />
    </View>
  );
}

export function Chevron({ size = 12, color = '#fff' }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: size * 0.44, height: size * 0.44,
        borderRightWidth: 1.6, borderBottomWidth: 1.6, borderColor: color,
        transform: [{ rotate: '45deg' }], marginTop: -size * 0.12,
      }} />
    </View>
  );
}

export function Pencil({ size = 18, color = '#fff' }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.7, height: size * 0.2, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }] }} />
      <View style={{ position: 'absolute', right: size * 0.16, bottom: size * 0.16, width: 0, height: 0, borderTopWidth: size * 0.14, borderLeftWidth: size * 0.14, borderTopColor: 'transparent', borderLeftColor: color, transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}

export function Sliders({ size = 18, color = '#fff' }) {
  const rows = [0.2, 0.5, 0.8];
  return (
    <View style={{ width: size, height: size, justifyContent: 'space-evenly' }}>
      {rows.map((k, i) => (
        <View key={i} style={{ height: 2, backgroundColor: color, borderRadius: 1, justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: k * size - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: color, top: -2 }} />
        </View>
      ))}
    </View>
  );
}

export function Folder({ size = 18, color = '#fff' }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.34, height: size * 0.16, backgroundColor: color, borderTopLeftRadius: 2, borderTopRightRadius: 2, alignSelf: 'flex-start', marginLeft: size * 0.12, marginBottom: -1 }} />
      <View style={{ width: size * 0.78, height: size * 0.5, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

export function Metronome({ size = 18, color = '#fff' }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: size * 0.32, borderRightWidth: size * 0.32, borderBottomWidth: size * 0.6,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
      }} />
    </View>
  );
}

// A small "FX" text badge.
export function Fx({ size = 16, color = '#fff' }) {
  return <Text style={[styles.fx, { fontSize: size * 0.8, color }]}>FX</Text>;
}

const styles = StyleSheet.create({
  fx: { fontWeight: '800', letterSpacing: 0.5 },
});
