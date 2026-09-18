export function parseCsv(text: string): Record<string, string>[] {
  const rows = readRows(text);
  const header = rows.shift();
  if (!header) return [];

  return rows.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])));
}

function readRows(text: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      cells.push(cell);
      rows.push(cells);
      cells = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    rows.push(cells);
  }

  return rows;
}
