import React from 'react';
import { View, StyleSheet } from 'react-native';
import Pad from './Pad';
import { INSTRUMENTS, ROWS, padId } from '../config';

// The whole board, sized with flex so all 8 columns x 6 rows fit the screen
// with NO scrolling. Each column has a thin colored header strip (like the
// reference) and stacks its variation pads underneath.
//
// Play/armed highlight and the playhead ring come from the native transport
// (each Pad subscribes to syncStore by id), so this grid does not re-render on
// every audio frame.
function InstrumentGrid({ pads, den, onPadPress, onPadLong }) {
  return (
    <View style={styles.grid}>
      <View style={styles.headerRow}>
        {INSTRUMENTS.map((inst) => (
          <View key={inst.key} style={styles.headerCell}>
            <View style={[styles.headerStrip, { backgroundColor: withAlpha(inst.color, 0.55) }]} />
          </View>
        ))}
      </View>

      <View style={styles.columns}>
        {INSTRUMENTS.map((inst) => (
          <View key={inst.key} style={styles.column}>
            {ROWS.map((_, rowIndex) => {
              const id = padId(inst.key, rowIndex);
              return (
                <Pad
                  key={id}
                  id={id}
                  pad={pads[id]}
                  color={inst.color}
                  den={den}
                  onPress={() => onPadPress(inst, rowIndex)}
                  onLongPress={() => onPadLong(inst, rowIndex)}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function withAlpha(hex, a) {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return `${hex}${v}`;
}

const GAP = 6;

const styles = StyleSheet.create({
  grid: { flex: 1 },
  headerRow: { flexDirection: 'row', gap: GAP, height: 6, marginBottom: GAP },
  headerCell: { flex: 1 },
  headerStrip: { flex: 1, borderRadius: 3 },
  columns: { flex: 1, flexDirection: 'row', gap: GAP },
  column: { flex: 1, gap: GAP },
});

export default React.memo(InstrumentGrid);
