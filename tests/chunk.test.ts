import { describe, expect, it } from 'vitest';
import { chunkText } from '../scripts/utils/chunk';

describe('chunkText', () => {
  it('chunks with overlap', () => {
    const text = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(text, 10, 5);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].split(' ')).toHaveLength(10);
    expect(chunks[1].split(' ')[0]).toBe('w5');
  });
});
