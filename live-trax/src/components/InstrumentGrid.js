import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import Pad, { PAD_WIDTH, PAD_HEIGHT } from './Pad';
import { INSTRUMENTS, ROWS, padId } from '../config';
import { theme } from '../theme';

// The board: instrument columns across, variation rows down. Horizontally
// scrollable so all instruments fit on a phone; each column carries a colored
// header so the track is readable at a glance.
export default function InstrumentGrid({ pads, playingByColumn, queuedByColumn, onPadPress, onPadLong }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hcontent}
    >
      <View style={styles.columns}>
        {INSTRUMENTS.map((inst) => (
          <View key={inst.key} style={styles.column}>
            <View style={[styles.header, { borderBottomColor: inst.color }]}>
              <View style={[styles.headerDot, { backgroundColor: inst.color }]} />
              <Text style={[styles.headerText, { color: inst.color }]} numberOfLines={1}>
                {inst.name}
              </Text>
            </View>
            {ROWS.map((rowLabel, rowIndex) => {
              const id = padId(inst.key, rowIndex);
              return (
                <Pad
                  key={id}
                  pad={pads[id]}
                  instrument={inst}
                  rowLabel={rowLabel}
                  isPlaying={playingByColumn[inst.key] === rowIndex}
                  isQueued={queuedByColumn[inst.key] === rowIndex}
                  onPress={() => onPadPress(inst, rowIndex)}
                  onLongPress={() => onPadLong(inst, rowIndex)}
                />
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hcontent: { paddingHorizontal: 12, paddingBottom: 24 },
  columns: { flexDirection: 'row', gap: 8 },
  column: { gap: 8, width: PAD_WIDTH },
  header: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    marginBottom: 2,
  },
  headerDot: { width: 8, height: 8, borderRadius: 4 },
  headerText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
