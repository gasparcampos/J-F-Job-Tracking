/**
 * Google Cloud Vision OCR for photos and scanned PDFs (prints, route
 * sheets). Same credentials as Firebase Admin.
 */
export async function ocrBuffer(buffer: Buffer, isPdf: boolean): Promise<string> {
  const visionMod = await import('@google-cloud/vision');
  const Client = visionMod.default.ImageAnnotatorClient;
  const client = new Client({
    projectId: process.env.FIREBASE_PROJECT_ID,
    credentials:
      process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
        ? {
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }
        : undefined,
  });

  if (isPdf) {
    // No `pages` set = Vision reads the first 5 pages (route sheet + drawing).
    const [result] = await client.batchAnnotateFiles({
      requests: [
        {
          inputConfig: { mimeType: 'application/pdf', content: buffer },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    });
    return (result.responses?.[0]?.responses ?? [])
      .map((r) => r.fullTextAnnotation?.text ?? '')
      .join('\n');
  }

  const [result] = await client.documentTextDetection({ image: { content: buffer } });
  return result.fullTextAnnotation?.text ?? '';
}
