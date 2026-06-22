import fs from 'fs';
import path from 'path';

/**
 * z-ai-web-dev-sdk only reads its key from a ./.z-ai-config JSON file, not
 * env vars. Locally that file is hand-edited (gitignored). In production
 * (Firebase App Hosting) there's no way to commit that file, so secrets are
 * injected as ZAI_API_KEY / ZAI_BASE_URL env vars instead -- this writes the
 * file from them on first use, mirroring the lazy-init pattern already used
 * for the Firebase Admin credentials.
 */
export function ensureZaiConfig(): void {
  const configPath = path.join(process.cwd(), '.z-ai-config');
  if (fs.existsSync(configPath)) return;

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) return;

  const baseUrl = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4';
  fs.writeFileSync(configPath, JSON.stringify({ baseUrl, apiKey }));
}
