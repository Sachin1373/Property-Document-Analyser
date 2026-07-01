
export function chunkText(text: string, maxWords = 800): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}|\n(?=\d{1,3}\.\s)/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const chunks: string[] = [];
  let buffer: string[] = [];
  let bufferWordCount = 0;
  const overlapParagraphs = 1;

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push(buffer.join('\n\n'));
  
    const kept = buffer.slice(-overlapParagraphs);
    buffer = kept;
    bufferWordCount = kept.reduce((n, p) => n + wordCount(p), 0);
  };

  for (const para of paragraphs) {
    const wc = wordCount(para);

    if (wc > maxWords) {
      flush();
      const words = para.split(/\s+/);
      const overlap = 80;
      for (let i = 0; i < words.length; i += maxWords - overlap) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
        if (i + maxWords >= words.length) break;
      }
      buffer = [];
      bufferWordCount = 0;
      continue;
    }

    if (bufferWordCount + wc > maxWords && buffer.length > 0) {
      flush();
    }

    buffer.push(para);
    bufferWordCount += wc;
  }

  if (buffer.length > 0) {
    chunks.push(buffer.join('\n\n'));
  }

  return chunks.length > 0 ? chunks : [normalized.substring(0, 4000)];
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
