/**
 * lib/rag/extract.js
 *
 * Extracts plain text from uploaded files.
 * Supported: PDF, DOCX, TXT, MD
 */

export async function extractText(file, mimeType) {
  if (mimeType === "application/pdf") {
    const { default: pdfParse } = await import("pdf-parse");
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // TXT, MD — plain text
  return await file.text();
}
