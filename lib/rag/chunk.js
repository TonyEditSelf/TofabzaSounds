/**
 * lib/rag/chunk.js
 *
 * Splits text into overlapping chunks for embedding.
 * 1 token ≈ 4 characters (rough estimate for Indian languages too).
 */

/**
 * @param {string} text
 * @param {number} [chunkSize=1600]  - chars per chunk (~400 tokens)
 * @param {number} [overlap=200]     - overlap between chunks (~50 tokens)
 * @returns {string[]}
 */
export function chunkText(text, chunkSize = 1600, overlap = 200) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks.filter((c) => c.length > 50);
}
