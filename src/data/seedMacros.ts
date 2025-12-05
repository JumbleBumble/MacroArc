import { nanoid } from 'nanoid';
import { MacroEvent, MacroSequence } from '../utils/macroTypes';

const makeEvent = (offsetMs: number, kind: MacroEvent['kind']): MacroEvent => ({
  id: nanoid(),
  offsetMs,
  kind,
  createdAt: Date.now(),
});

const createMacro = (
  name: string,
  accent: string,
  offsets: MacroEvent['kind'][],
  loopCount: number,
): MacroSequence => ({
  id: nanoid(),
  name,
  accent,
  tags: ['macro', 'seed'],
  loopCount,
  events: offsets.map((kind, idx) => makeEvent(idx * 180 + 80, kind)),
  lastRun: Date.now() - Math.floor(Math.random() * 600000),
});

export const seedMacros: MacroSequence[] = [
  createMacro('Design QA Sweep', '#8e67ff', [
    { type: 'mouse-move', x: 380, y: 420 },
    { type: 'mouse-down', button: 'left' },
    { type: 'mouse-up', button: 'left' },
    { type: 'key-down', key: 'Cmd+C' },
    { type: 'key-up', key: 'Cmd+C' },
    { type: 'mouse-move', x: 620, y: 520 },
    { type: 'mouse-down', button: 'left' },
    { type: 'mouse-up', button: 'left' },
  ], 2),
  createMacro('Spreadsheet Merge', '#5ad7ff', [
    { type: 'mouse-move', x: 540, y: 260 },
    { type: 'mouse-down', button: 'left' },
    { type: 'mouse-up', button: 'left' },
    { type: 'key-down', key: 'Ctrl+V' },
    { type: 'key-up', key: 'Ctrl+V' },
    { type: 'scroll', delta_x: 0, delta_y: -120 },
  ], 1),
];
