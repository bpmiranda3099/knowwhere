import pdfParse from 'pdf-parse';

export async function fetchPdfText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const parsed = await pdfParse(data);
    const text = parsed.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
