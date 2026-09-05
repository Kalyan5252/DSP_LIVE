import LiveTraxEngine from './src/LiveTraxEngineModule';

export function hello(): string {
  return LiveTraxEngine.hello();
}

export function add(a: number, b: number): number {
  return LiveTraxEngine.add(a, b);
}

export default LiveTraxEngine;
