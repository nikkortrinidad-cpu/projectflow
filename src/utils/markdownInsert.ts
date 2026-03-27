export interface InsertResult {
  newValue: string;
  selectionStart: number;
  selectionEnd: number;
}

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
): InsertResult {
  const selected = value.slice(start, end);
  const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
  return {
    newValue,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

export function insertAtLineStart(
  value: string,
  start: number,
  end: number,
  prefix: string | ((lineIndex: number) => string),
): InsertResult {
  // Find the start of the first selected line
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const selected = value.slice(lineStart, end);
  const lines = selected.split('\n');

  const newLines = lines.map((line, i) => {
    const p = typeof prefix === 'function' ? prefix(i) : prefix;
    return p + line;
  });

  const newSelected = newLines.join('\n');
  const newValue = value.slice(0, lineStart) + newSelected + value.slice(end);

  return {
    newValue,
    selectionStart: lineStart,
    selectionEnd: lineStart + newSelected.length,
  };
}

export function insertLink(
  value: string,
  start: number,
  end: number,
): InsertResult {
  const selected = value.slice(start, end);
  const text = selected || 'link text';
  const insert = `[${text}](url)`;
  const newValue = value.slice(0, start) + insert + value.slice(end);
  // Select "url" so user can type over it
  const urlStart = start + text.length + 3;
  return {
    newValue,
    selectionStart: urlStart,
    selectionEnd: urlStart + 3,
  };
}

export function insertImage(
  value: string,
  start: number,
  end: number,
): InsertResult {
  const selected = value.slice(start, end);
  const alt = selected || 'alt text';
  const insert = `![${alt}](image-url)`;
  const newValue = value.slice(0, start) + insert + value.slice(end);
  const urlStart = start + alt.length + 4;
  return {
    newValue,
    selectionStart: urlStart,
    selectionEnd: urlStart + 9,
  };
}

export function setHeading(
  value: string,
  start: number,
  level: number, // 0 = plain text, 1-5 = H1-H5
): InsertResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start);
  const line = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  // Strip any existing heading prefix
  const stripped = line.replace(/^#{1,6}\s/, '');
  const newLine = level > 0 ? '#'.repeat(level) + ' ' + stripped : stripped;

  const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd === -1 ? value.length : lineEnd);
  return {
    newValue,
    selectionStart: lineStart + newLine.length,
    selectionEnd: lineStart + newLine.length,
  };
}
