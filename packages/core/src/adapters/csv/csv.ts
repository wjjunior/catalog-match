export function parseCsv(text: string): Record<string, string>[] {
  const rows = readRows(text);
  const header = rows.shift();
  if (!header) return [];

  return rows.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])));
}

interface ParseState {
  rows: string[][];
  cells: string[];
  cell: string;
  quoted: boolean;
  index: number;
}

function pushCell(state: ParseState): void {
  state.cells.push(state.cell);
  state.cell = '';
}

function endRow(state: ParseState): void {
  pushCell(state);
  state.rows.push(state.cells);
  state.cells = [];
}

function readQuoted(text: string, state: ParseState, char: string): void {
  if (char !== '"') {
    state.cell += char;
    return;
  }

  if (text[state.index + 1] === '"') {
    state.cell += '"';
    state.index += 1;
    return;
  }

  state.quoted = false;
}

function readUnquoted(text: string, state: ParseState, char: string): void {
  if (char === '"') {
    state.quoted = true;
    return;
  }

  if (char === ',') {
    pushCell(state);
    return;
  }

  if (char === '\n' || char === '\r') {
    if (char === '\r' && text[state.index + 1] === '\n') state.index += 1;
    endRow(state);
    return;
  }

  state.cell += char;
}

function readRows(text: string): string[][] {
  const state: ParseState = { rows: [], cells: [], cell: '', quoted: false, index: 0 };

  for (; state.index < text.length; state.index += 1) {
    const char = text[state.index] ?? '';

    if (state.quoted) readQuoted(text, state, char);
    else readUnquoted(text, state, char);
  }

  if (state.cell !== '' || state.cells.length > 0) endRow(state);

  return state.rows;
}
