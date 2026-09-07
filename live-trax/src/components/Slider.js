import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native';
import { theme } from '../theme';

// A smooth slider whose HANDLE is driven by an Animated.Value (updated with
// setValue on each move) instead of React state — so dragging it never triggers
// a re-render and stays smooth even while audio is playing and the JS thread is
// busy. The audio value is applied throttled; the numeric label updates at a low
// rate. Supports horizontal and vertical (bottom-up) orientation.
export default function Slider({
  label, value, min = 0, max = 1, unit = '', format,
  onChange, vertical = false, style, trackStyle, pad = 0,
}) {
  const [size, setSize] = useState(vertical ? 160 : 240);
  const sizeRef = useRef(size); sizeRef.current = size;
  const frac = clamp((value - min) / (max - min), 0, 1);
  const av = useRef(new Animated.Value(frac)).current;
  const dragging = useRef(false);
  const curFrac = useRef(frac);          // latest fraction shown
  const startFrac = useRef(frac);        // fraction at the moment the drag began
  const [labelVal, setLabelVal] = useState(value);
  const lastApply = useRef(0);
  const lastLabel = useRef(0);

  // Follow external value changes only when the user isn't dragging.
  useEffect(() => {
    if (!dragging.current) { curFrac.current = frac; av.setValue(frac); setLabelVal(value); }
  }, [value, frac, av]);

  const THUMB_V = 12;
  const inner = () => Math.max(1, sizeRef.current - (vertical ? THUMB_V : 0));
  const emit = (f, commit) => {
    curFrac.current = f;
    av.setValue(f);
    const val = min + f * (max - min);
    const now = Date.now();
    if (commit || now - lastApply.current > 40) { lastApply.current = now; onChange && onChange(val); }
    if (commit || now - lastLabel.current > 90) { lastLabel.current = now; setLabelVal(val); }
  };
  // RELATIVE dragging: move the handle by the drag distance from where it started,
  // so grabbing the thumb never makes it jump to the finger.
  const move = (g, commit) => {
    const d = vertical ? -g.dy : g.dx;
    const f = clamp(startFrac.current + d / inner(), 0, 1);
    emit(f, commit);
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { dragging.current = true; startFrac.current = curFrac.current; },
    onPanResponderMove: (e, g) => move(g, false),
    onPanResponderRelease: (e, g) => { move(g, true); dragging.current = false; },
    onPanResponderTerminate: (e, g) => { move(g, true); dragging.current = false; },
  })).current;

  const pctStr = av.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  if (vertical) {
    const range = Math.max(1, size - THUMB_V);
    const thumbTop = av.interpolate({ inputRange: [0, 1], outputRange: [range, 0] });
    const fillH = av.interpolate({ inputRange: [0, 1], outputRange: [0, size] });
    return (
      <View style={[styles.vWrap, style]} onLayout={(e) => setSize(e.nativeEvent.layout.height)} {...pan.panHandlers}>
        <View style={styles.vInner}>
          <View style={styles.vTrackBg} />
          <Animated.View style={[styles.vFill, { height: fillH }]} />
          <Animated.View style={[styles.vThumb, { transform: [{ translateY: thumbTop }] }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={style}>
      {label != null ? (
        <View style={styles.head}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.val}>{format ? format(labelVal) : Math.round(labelVal)}{unit ? ` ${unit}` : ''}</Text>
        </View>
      ) : null}
      <View style={[styles.track, trackStyle]} onLayout={(e) => setSize(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        <View style={styles.bg} />
        <Animated.View style={[styles.fill, { width: pctStr }]} />
        <Animated.View style={[styles.thumb, { left: pctStr }]} />
      </View>
    </View>
  );
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: theme.text, fontSize: 13, fontWeight: '700' },
  val: { color: theme.danger, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 30, justifyContent: 'center' },
  bg: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: theme.surfaceActive },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: theme.good },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9, backgroundColor: theme.text, borderWidth: 1, borderColor: theme.border },

  vWrap: { width: 40, flex: 1, minHeight: 70, alignItems: 'center' },
  vInner: { flex: 1, width: 26 },
  vTrackBg: { position: 'absolute', top: 0, bottom: 0, left: 11.5, width: 3, borderRadius: 2, backgroundColor: theme.surfaceActive },
  vFill: { position: 'absolute', bottom: 0, left: 11.5, width: 3, backgroundColor: theme.good, borderRadius: 2 },
  vThumb: { position: 'absolute', top: 0, left: 0, width: 26, height: 12, borderRadius: 6, backgroundColor: theme.text, borderWidth: 1, borderColor: theme.border },
});
