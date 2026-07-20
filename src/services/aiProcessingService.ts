import fs from 'fs';
import path from 'path';
import { getAiCompletion } from './aiService';

/**
 * AI Processing Service
 * Provides configuration, helper utilities, and intelligence logic for email and attachment processing
 * with batching, throttling, exponential backoff, and ephemeral attachment extraction.
 */

export const AI_CONFIG = {
  batchSize: 5,               // Maksimal 5-8 email per batch
  throttleDelay: 15000,       // Jeda waktu antar batch (15-20 detik)
  retryDelaySeconds: 30       // Detik tunggu jika kena limit 429
};

/**
 * Executes a function with exponential backoff on HTTP 429 (Too Many Requests).
 */
export async function executeWithBackoff<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const is429 = error?.status === 429 || 
                  error?.statusCode === 429 || 
                  error?.response?.status === 429;

    if (is429 && retries > 0) {
      const retryAfter = AI_CONFIG.retryDelaySeconds;
      console.warn(`[AI Warning] Limit NVIDIA tercapai (429). Menunggu ${retryAfter} detik...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return executeWithBackoff(fn, retries - 1);
    }
    throw error;
  }
}

/**
 * Clean and robust JSON parser to extract valid JSON blocks from AI model responses.
 */
export function parseCleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      try {
        return JSON.parse(cleaned.substring(startIdx, endIdx + 1));
      } catch (innerErr) {
        throw new Error(`Failed to parse AI JSON: ${err}. Cleaned input was: ${cleaned}`);
      }
    }
    throw err;
  }
}

/**
 * Helper to extract printable text sequences or metadata from temporary attachment files
 */
export function extractAttachmentContent(filePath: string, filename: string): string {
  try {
    if (!fs.existsSync(filePath)) {
      return `[File: ${filename} (Not found on disk)]`;
    }

    const ext = path.extname(filename).toLowerCase();
    const stats = fs.statSync(filePath);
    let meta = `[File Name: ${filename}, Size: ${stats.size} bytes, Format: ${ext || 'Unknown'}]\n`;

    // Direct read for standard text or delimited files
    if (['.txt', '.csv', '.json', '.xml', '.html', '.log', '.ini', '.md', '.sql'].includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return meta + `Raw Text Content (First 8000 chars):\n"""\n${content.substring(0, 8000)}\n"""`;
    }

    // Alphanumeric sequence extraction for binary files (PDFs, Excel, etc.) as a fallback
    const buffer = fs.readFileSync(filePath);
    const textRepresentation = buffer.toString('utf8');
    const cleanSeq = textRepresentation.replace(/[^\x20-\x7E\s]/g, ''); // keep only printable ascii
    const lines = cleanSeq.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5 && /^[a-zA-Z0-9\s-_.,:;()]{5,200}$/.test(line));
    
    if (lines.length > 0) {
      const preview = lines.slice(0, 50).join('\n');
      return meta + `Extracted Readable Metadata and Text Sequences:\n"""\n${preview.substring(0, 4000)}\n"""`;
    }

    return meta + `(Binary format: No plain text extracted)`;
  } catch (err: any) {
    return `[Error extracting text from ${filename}: ${err.message}]`;
  }
}

/**
 * Main Email Intelligence Processing logic:
 * 1. Creates a local temporary directory './temp'
 * 2. Decodes base64 attachments as actual files inside './temp'
 * 3. Extracts text representation from those files
 * 4. Construct AI Prompt to get folder, sub_folder, tags, summary_email, and summary_attachments
 * 5. Calls NVIDIA rotation model or fallback model
 * 6. Deletes temp files immediately (ephemeral processing)
 * 7. Returns parsed JSON results
 */
export async function processEmailIntelligence(email: {
  message_id: string;
  subject: string;
  sender: string;
  date: string;
  body_text: string;
  attachments?: any[];
}): Promise<{
  folder: string;
  sub_folder: string;
  tags: string[];
  summary_email: string;
  summary_attachments: { filename: string; desc: string }[];
}> {
  const tempDir = path.join(process.cwd(), 'temp');
  
  // Ensure temp folder exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const savedFiles: { filePath: string; filename: string }[] = [];
  const extractedContents: string[] = [];
  const rawAttachments = Array.isArray(email.attachments) 
    ? email.attachments 
    : (typeof email.attachments === 'string' ? JSON.parse(email.attachments || '[]') : []);

  try {
    // 1. Download/Write files to './temp'
    for (const att of rawAttachments) {
      if (att.filename && att.fileData) {
        const sanitizedFilename = path.basename(att.filename);
        const filePath = path.join(tempDir, `${email.message_id}_${sanitizedFilename}`);
        const buffer = Buffer.from(att.fileData, 'base64');
        fs.writeFileSync(filePath, buffer);
        savedFiles.push({ filePath, filename: att.filename });

        // 2. Extract content
        const extracted = extractAttachmentContent(filePath, att.filename);
        extractedContents.push(extracted);
      } else if (att.filename) {
        extractedContents.push(`[File: ${att.filename} (No file data payload stored in database)]`);
      }
    }

    // 3. Prompt Engineering
    const prompt = `Analisis email beserta isi attachment-nya dan berikan output JSON dengan struktur berikut:
{
  "folder": "BCA",
  "sub_folder": "CIT BCA",
  "tags": ["ORDER CIT", "URGENT", "NEED Action"],
  "summary_email": "Ringkasan tindakan yang harus diambil...",
  "summary_attachments": [
    { "filename": "A.png", "desc": "file untuk approval dan trip" },
    { "filename": "order.xlsx", "desc": "master untuk trip, terdapat 9 trip yaitu..." }
  ]
}

Detail Email:
Subject: ${email.subject || '(No Subject)'}
From: ${email.sender || 'Unknown Sender'}
Date: ${email.date || ''}
Body Text:
${email.body_text || '(No Body Content)'}

Isi Lampiran/Attachment (Temporary):
${extractedContents.length > 0 ? extractedContents.join('\n\n') : 'Tidak ada lampiran.'}

PENTING: Anda harus mengembalikan JSON murni tanpa markdown block, tanpa penjelasan apa pun di luar JSON. Pastikan JSON valid.`;

    // 4. Call rotating AI model
    console.log(`[Email Intelligence] Calling AI models for message_id: ${email.message_id}...`);
    const aiResponse = await getAiCompletion(prompt);
    
    // 5. Clean & parse response
    const parsedResult = parseCleanJson(aiResponse);
    
    // Validate output structure
    return {
      folder: parsedResult?.folder || 'Operation',
      sub_folder: parsedResult?.sub_folder || 'General',
      tags: Array.isArray(parsedResult?.tags) ? parsedResult.tags : ['General'],
      summary_email: parsedResult?.summary_email || email.subject || 'No summary generated',
      summary_attachments: Array.isArray(parsedResult?.summary_attachments) ? parsedResult.summary_attachments : []
    };

  } catch (err: any) {
    console.error(`[Email Intelligence] Error processing email intelligence for ${email.message_id}:`, err);
    // Return standard fallback model on failure
    return {
      folder: 'Operation',
      sub_folder: 'General',
      tags: ['Error', 'NVIDIA Fail'],
      summary_email: `Gagal menganalisis email secara cerdas. Error: ${err.message || String(err)}`,
      summary_attachments: rawAttachments.map((att: any) => ({
        filename: att.filename || 'Attachment',
        desc: 'Gagal diproses oleh AI'
      }))
    };
  } finally {
    // 3. Ephemeral cleanup: Delete attachment files from './temp' immediately
    for (const file of savedFiles) {
      try {
        if (fs.existsSync(file.filePath)) {
          fs.unlinkSync(file.filePath);
          console.log(`[Email Ephemeral Cleanup] Deleted temporary attachment: ${file.filename}`);
        }
      } catch (cleanupErr: any) {
        console.error(`[Email Ephemeral Cleanup] Failed to delete ${file.filePath}:`, cleanupErr.message);
      }
    }
  }
}
