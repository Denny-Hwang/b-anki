// RFC 4180 CSV reader.
//
// The bundled data has quoted fields containing commas and escaped double
// quotes (45 and 4 cells respectively), so splitting on "," is not an option.

export function parseCsvRows(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
    started = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      started = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n') {
      endRow();
    } else if (c !== '\r') {
      field += c;
      started = true;
    }
  }
  if (started || field !== '' || row.length) endRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Rows as objects keyed by the header row, with values trimmed. */
export function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((key, i) => {
      record[key] = (cells[i] ?? '').trim();
    });
    return record;
  });
}
