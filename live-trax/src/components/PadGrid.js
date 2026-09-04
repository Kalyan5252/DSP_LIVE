import React from 'react';
import { View, StyleSheet } from 'react-native';
import Pad from './Pad';

// Lays the pads out as a square grid. `columns` rows are derived from the pad
// count, so 16 pads render as 4x4, 8 pads as (with columns=2) 2x4, etc.
export default function PadGrid({ pads, playing, columns, onTrigger, onOptions }) {
  const rows = [];
  for (let i = 0; i < pads.length; i += columns) {
    rows.push(pads.slice(i, i + columns));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((pad) => (
            <Pad
              key={pad.id}
              pad={pad}
              isPlaying={!!playing[pad.id]}
              onTrigger={() => onTrigger(pad)}
              onOptions={() => onOptions(pad)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});
