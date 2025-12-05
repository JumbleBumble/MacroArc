const SPECIAL_KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  space: 'Space',
  escape: 'Escape',
  esc: 'Escape',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  delete: 'Delete',
  backspace: 'Backspace',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
};

const PRETTY_SEGMENTS: Record<string, string> = {
  CommandOrControl: 'Ctrl/Cmd',
  Control: 'Ctrl',
  Meta: 'Cmd',
  Super: 'Super',
  Alt: 'Alt',
  Shift: 'Shift',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

const isModifierKey = (key: string) => ['Shift', 'Alt', 'Control', 'Meta'].includes(key);

const normalizeKey = (rawKey: string) => {
  if (!rawKey) return '';
  const key = SPECIAL_KEY_MAP[rawKey.toLowerCase()] ?? rawKey;
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key
    .replace('Arrow', '')
    .replace(/^[a-z]/, (match) => match.toUpperCase());
};

export const formatHotkeyFromEvent = (event: KeyboardEvent) => {
  const sequence: string[] = [];

  if (event.metaKey || event.ctrlKey) {
    sequence.push('CommandOrControl');
  }
  if (event.altKey) {
    sequence.push('Alt');
  }
  if (event.shiftKey) {
    sequence.push('Shift');
  }

  const normalizedKey = normalizeKey(event.key);
  if (!normalizedKey || isModifierKey(normalizedKey)) {
    return null;
  }

  sequence.push(normalizedKey);
  return sequence.join('+');
};

export const describeHotkey = (hotkey?: string | null) => {
  if (!hotkey) return '';
  return hotkey
    .split('+')
    .map((segment) => PRETTY_SEGMENTS[segment] ?? segment)
    .join(' + ');
};

export const isValidHotkey = (value?: string | null) => Boolean(value && value.split('+').length >= 1);