import { normalizeText } from './normalize';

/** DOCX import with mammoth's browser build, loaded on demand (options page only). */
export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return normalizeText(result.value);
}
