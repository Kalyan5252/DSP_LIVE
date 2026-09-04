import React, { useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import { theme } from '../theme';

// The left performance touch-strip (an XY-style filter pad in Remixlive). Here
// it's an interactive visual: drag the dot around. Hooking it to a real filter
// is a future step once the C++ engine's FX are in — for now it moves freely.
export default function LeftStrip() {
  const [size, setSize] = useState({ w: 40, h: 200 });
  const [dot, setDot] = useState({ x: 0.5, y: 0.5 }); // normalized 0..1
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const { w, h } = sizeRef.current;
        setDot({
          x: Math.max(0, Math.min(1, locationX / w)),
          y: Math.max(0, Math.min(1, locationY / h)),
        });
      },
    })
  ).current;

  const dotSize = 16;
  return (
    <View
      style={styles.strip}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...pan.panHandlers}
    >
      <View
        style={[
          styles.dot,
          {
            left: dot.x * (size.w - dotSize),
            top: dot.y * (size.h - dotSize),
            width: dotSize, height: dotSize, borderRadius: dotSize / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: 40,
    borderRadius: 20,
    backgroundColor: '#050507',
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  dot: { position: 'absolute', backgroundColor: '#F7A23E' },
});
