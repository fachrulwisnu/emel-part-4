import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { readFile } from 'node:fs/promises';
import OpenAI from 'openai';
import sharp from 'sharp';
import { GoogleGenAI } from "@google/genai";
import { getAiCompletion, generateWithGemini } from './aiService';

/**
 * AI Processing Service
 * Provides configuration, helper utilities, and intelligence logic for email and attachment processing
 * with batching, throttling, exponential backoff, and ephemeral attachment extraction.
 */

export const AI_CONFIG = {
  batchSize: 2,               // Diperkecil menjadi maksimal 2 atau 3 email per batch
  throttleDelay: 15000,       // Jeda waktu antar batch (15-20 detik)
  retryDelaySeconds: 30       // Detik tunggu jika kena limit 429
};

// Google GenAI SDK Client Initialization (Sesuai panduan skill)
const aiClient = new GoogleGenAI({
  apiKey: "AIzaSyAM5OQ6yxiY2Us9esJzhub3MgFjPb9chkA",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * Automatically compress images to keep the payload size under 180KB for API calls.
 */
async function compressImageForNvidia(filePath: string): Promise<string> {
  const stat = await fs.promises.stat(filePath);
  const MAX_API_SIZE = 180 * 1024; // 180KB
  
  // Jika file sudah kecil, langsung return base64
  if (stat.size < MAX_API_SIZE) {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.toString('base64');
  }
  
  console.log(`[Image Optimizer] Mengompresi gambar ${filePath} untuk API NIM/Gemini...`);
  let quality = 80;
  let compressedBuffer = await sharp(filePath)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality }) 
    .toBuffer();
      
  // Iterasi penurunan kualitas jika hasil masih di atas 180KB
  while (compressedBuffer.length > MAX_API_SIZE && quality > 20) {
    quality -= 15;
    compressedBuffer = await sharp(filePath)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }
  
  return compressedBuffer.toString('base64');
}

/**
 * Cosmos3-Nano-Reasoner call
 */
async function callCosmos3(imageB64: string | null, promptText: string): Promise<string> {
  const client = new OpenAI({
    apiKey: "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",
    baseURL: "https://integrate.api.nvidia.com/v1",
  });

  const contentPayload: any = imageB64 ? [
    { type: "text", text: promptText },
    {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${imageB64}`
      }
    }
  ] : promptText;

  const response = await client.chat.completions.create({
    model: "nvidia/cosmos3-nano-reasoner",
    messages: [
      {
        role: "user",
        content: contentPayload
      }
    ] as any,
    max_tokens: 4096,
    stream: false
  });
  return response.choices[0]?.message?.content || "";
}

/**
 * Gemini 3.5 Flash call
 */
async function callGemini(imageB64: string | null, promptText: string): Promise<string> {
  if (imageB64) {
    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: imageB64,
      },
    };
    const textPart = {
      text: promptText,
    };
    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
    });
    return response.text || "";
  } else {
    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: promptText,
    });
    return response.text || "";
  }
}

/**
 * Qwen3-Next-80B-A3B-Instruct call
 */
async function callQwen3(imageB64: string | null, promptText: string): Promise<string> {
  const client = new OpenAI({
    apiKey: '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',
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const contentPayload: any = imageB64 ? [
    { type: "text", text: promptText },
    {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${imageB64}`
      }
    }
  ] : promptText;

  const response = await client.chat.completions.create({
    model: "qwen/qwen3-next-80b-a3b-instruct",
    messages: [
      {
        role: "user",
        content: contentPayload
      }
    ] as any,
    temperature: 0.6,
    top_p: 0.7,
    max_tokens: 4096,
    stream: false
  });
  return response.choices[0]?.message?.content || "";
}

/**
 * StepFun-AI Step-3.7-Flash call
 */
async function callStepFun(imageB64: string | null, promptText: string): Promise<string> {
  const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
  const headers = {
    "Authorization": "Bearer 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",
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  const contentPayload: any = imageB64 ? [
    { type: "text", text: promptText },
    {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${imageB64}`
      }
    }
  ] : promptText;

  const payload = {
    model: "stepfun-ai/step-3.7-flash",
    messages: [
      {
        role: "user",
        content: contentPayload
      }
    ],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 4096,
    stream: false
  };

  const response = await axios.post(invokeUrl, payload, { headers, timeout: 30000 });
  return response.data?.choices?.[0]?.message?.content || "";
}

/**
 * Image Rotator (Cosmos3 -> Gemini -> Qwen3 -> StepFun)
 */
export async function processImageAttachmentWithRotator(filePath: string, filename: string): Promise<string> {
  const imageB64 = await compressImageForNvidia(filePath);
  const promptText = `Ekstrak semua teks penting, angka, tabel, dan data penting dari gambar lampiran bernama "${filename}" dengan teliti, lengkap, dan rapi dalam Bahasa Indonesia.`;
  
  const models = [
    { name: 'Cosmos3-Nano-Reasoner', fn: () => callCosmos3(imageB64, promptText) },
    { name: 'Gemini 3.5 Flash', fn: () => callGemini(imageB64, promptText) },
    { name: 'Qwen3-Next-80B', fn: () => callQwen3(imageB64, promptText) },
    { name: 'StepFun-3.7-Flash', fn: () => callStepFun(imageB64, promptText) }
  ];

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      console.log(`[AI Rotator Image] Mencoba analisis gambar dengan model: ${model.name}`);
      const result = await executeWithBackoff(async () => {
        return await model.fn();
      });
      if (result) {
        console.log(`[AI Rotator Image] Sukses mengekstrak menggunakan model: ${model.name}`);
        return `[Hasil Ekstraksi ${model.name} dari ${filename}]:\n"""\n${result}\n"""`;
      }
    } catch (err: any) {
      console.warn(`[AI Rotator Image Error] Gagal menggunakan model ${model.name}:`, err.message || String(err));
      lastError = err;
    }
  }

  console.error(`[AI Rotator Image Fail] Semua model rotator gambar gagal mengekstrak ${filename}.`);
  const basicExtract = extractAttachmentContent(filePath, filename);
  return `[Semua Model Rotator Gagal] Fallback ke ekstraksi metadata dasar.\n${basicExtract}\nLast Error: ${lastError?.message || 'Unknown'}`;
}

/**
 * Document Rotator (Qwen3 -> StepFun -> Gemini)
 */
export async function processDocumentAttachmentWithRotator(filePath: string, filename: string): Promise<string> {
  const rawText = extractAttachmentContent(filePath, filename);
  const promptText = `Berikut adalah teks mentah atau metadata hasil ekstraksi dari lampiran dokumen bernama "${filename}":
"""
${rawText}
"""

Harap ringkas dan analisis semua data penting, angka, transaksi, tabel, instruksi, atau informasi penting dari dokumen ini dalam Bahasa Indonesia secara mendalam, terstruktur, dan rapi.`;

  const models = [
    { name: 'Qwen3-Next-80B', fn: () => callQwen3(null, promptText) },
    { name: 'StepFun-3.7-Flash', fn: () => callStepFun(null, promptText) },
    { name: 'Gemini 3.5 Flash', fn: () => callGemini(null, promptText) }
  ];

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      console.log(`[AI Rotator Document] Mencoba analisis dokumen dengan model: ${model.name}`);
      const result = await executeWithBackoff(async () => {
        return await model.fn();
      });
      if (result) {
        console.log(`[AI Rotator Document] Sukses menganalisis menggunakan model: ${model.name}`);
        return `[Hasil Ringkasan ${model.name} dari ${filename}]:\n"""\n${result}\n"""`;
      }
    } catch (err: any) {
      console.warn(`[AI Rotator Document Error] Gagal menggunakan model ${model.name}:`, err.message || String(err));
      lastError = err;
    }
  }

  console.error(`[AI Rotator Document Fail] Semua model rotator dokumen gagal menganalisis ${filename}.`);
  return `[Semua Model Rotator Gagal] Hanya menampilkan teks mentah hasil ekstraksi.\n${rawText}\nLast Error: ${lastError?.message || 'Unknown'}`;
}

/**
 * Image/Attachment OCR Extraction using NVIDIA Nemotron OCR v2
 * Hardcoded API Key according to instructions
 */
export async function extractTextWithNvidiaOCR(filePath: string): Promise<any> {
  const invokeUrl = "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2";
  const headers = {
    "Authorization": "Bearer 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",
    "Accept": "application/json"
  };
  
  const imageB64 = await compressImageForNvidia(filePath);
  
  if (imageB64.length > 180000) {
    console.warn("[NVIDIA OCR] File over 180KB base64 limit even after compression, proceeding with caution.");
  }

  const payload = { input: [{ type: "image_url", url: `data:image/jpeg;base64,${imageB64}` }] };
  const response = await axios.post(invokeUrl, payload, { headers, responseType: 'json' });
  return response.data;
}

/**
 * Deep Reasoning & Analysis with NVIDIA Nemotron 3 Super 120B a12b
 * Hardcoded API Key according to instructions
 */
export async function processWithNemoSuper(promptText: string): Promise<string> {
  const nvidiaOpenAI = new OpenAI({
    apiKey: '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',
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  let fullContent = "";
  const completion: any = await nvidiaOpenAI.chat.completions.create({
    model: "nvidia/nemotron-3-super-120b-a12b",
    messages: [{"role": "user", "content": promptText}],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    chat_template_kwargs: {"enable_thinking": true},
    stream: true
  } as any);

  for await (const chunk of completion) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullContent += content;
  }
  return fullContent;
}

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
 * 3. Extracts text representation (using Nemotron OCR v2 for images, basic extract fallback for others)
 * 4. Construct AI Retriever Prompt to retrieve folder, sub_folder, tags, summary_email, and summary_attachments
 * 5. Calls Nemotron-3-Super 120B as Primary model
 * 6. Falling back to Gemini -> DeepSeek -> Gemma on failures
 * 7. Deletes temp files immediately (ephemeral processing)
 * 8. Returns parsed JSON results
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
        const buffer = Buffer.from(att.fileData, 'base64');
        const fileSize = buffer.length;
        const MAX_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB

        if (fileSize > MAX_SIZE_LIMIT) {
          console.warn(`[AI Warning] File ${att.filename} terlalu besar (${(fileSize / (1024 * 1024)).toFixed(2)}MB) melebihi batas 20MB. SKIP pemrosesan AI.`);
          extractedContents.push(`[File: ${att.filename} (Dilewati: Ukuran file melebihi batas 20MB)]`);
          continue;
        }

        const sanitizedFilename = path.basename(att.filename);
        const filePath = path.join(tempDir, `${email.message_id}_${sanitizedFilename}`);
        fs.writeFileSync(filePath, buffer);
        savedFiles.push({ filePath, filename: att.filename });

        // 2. OCR or Basic extract using Ultimate AI Rotator
        const ext = path.extname(att.filename).toLowerCase();
        let extracted = "";
        
        if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'].includes(ext)) {
          extracted = await processImageAttachmentWithRotator(filePath, att.filename);
        } else {
          extracted = await processDocumentAttachmentWithRotator(filePath, att.filename);
        }
        
        extractedContents.push(extracted);
      } else if (att.filename) {
        extractedContents.push(`[File: ${att.filename} (No file data payload stored in database)]`);
      }
    }

    // 3. Prompt Engineering using Nemo Retriever Skills Adaptation
    const prompt = `[NEMO RETRIEVER CONTEXT]
Below is the structured raw email metadata and raw text/OCR content from the email attachments.
Your task is to "retrieve" and extract specific fields strictly based on the provided context without introducing hallucinations or assumptions.

--- START EMAIL CONTEXT ---
Sender: ${email.sender || 'Unknown Sender'}
Date: ${email.date || ''}
Subject: ${email.subject || '(No Subject)'}
Body Text:
${email.body_text || '(No Body Content)'}
--- END EMAIL CONTEXT ---

--- START ATTACHMENT OCR CONTEXT ---
${extractedContents.length > 0 ? extractedContents.join('\n\n') : 'Tidak ada lampiran.'}
--- END ATTACHMENT OCR CONTEXT ---

--- INSTRUCTIONS ---
Strictly retrieve and construct the output JSON structure. No explanations, no markdown blocks, no conversational preamble. Valid JSON only.
If a value is not explicitly findable or retrievable, use standard operational defaults (e.g., "Operation" or "General"). All summaries must be in Bahasa Indonesia.

Expected JSON schema to return:
{
  "folder": "Major category retrieved from context (e.g., BCA, MANDIRI, BRI, BNI, Maybank, or Operation)",
  "sub_folder": "Specific child category or transaction type (e.g., CIT, ATM, Collection, General, Uncategorized)",
  "tags": ["Retrieve relevant operational keywords, codes, status tags. E.g., ORDER CIT, URGENT, NEED ACTION, etc."],
  "summary_email": "A deep, concise operational summary of the email text and actions to take in Bahasa Indonesia",
  "summary_attachments": [
    {
      "filename": "Exact file name from context",
      "desc": "Retrieve and summarize the specific details, transaction values, or key data points found in this file's OCR/text content in Bahasa Indonesia"
    }
  ]
}
`;

    // 4. Primary & Cascading Fallback Chain Execution
    console.log(`[Email Intelligence] Calling Nemotron-3-Super 120B for message_id: ${email.message_id}...`);
    let aiResponse = "";
    
    try {
      aiResponse = await executeWithBackoff(async () => {
        return await processWithNemoSuper(prompt);
      });
      console.log(`[Email Intelligence] Success with Nemotron-3-Super 120B!`);
    } catch (nemoErr: any) {
      console.warn(`[Email Intelligence] Primary model Nemotron-3-Super 120B failed: ${nemoErr.message || nemoErr}. Falling back to Gemini 3.5 Flash...`);
      try {
        aiResponse = await executeWithBackoff(async () => {
          return await callGemini(null, prompt);
        });
        console.log(`[Email Intelligence] Success with Gemini 3.5 Flash fallback!`);
      } catch (geminiErr: any) {
        console.warn(`[Email Intelligence] Gemini 3.5 Flash failed: ${geminiErr.message || geminiErr}. Falling back to DeepSeek...`);
        try {
          // Direct fallback to DeepSeek via OpenAI SDK configured with DeepSeek parameters
          aiResponse = await executeWithBackoff(async () => {
            const deepseekOpenAI = new OpenAI({
              apiKey: process.env.NVIDIA_API_KEY_DEEPSEEK || process.env.NVIDIA_API_KEY || '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',
              baseURL: 'https://integrate.api.nvidia.com/v1'
            });
            const completion = await deepseekOpenAI.chat.completions.create({
              model: 'deepseek-ai/deepseek-v4-pro',
              messages: [{ role: 'user', content: prompt }],
              temperature: 1,
              top_p: 0.95,
              max_tokens: 4096,
              stream: false
            });
            return completion.choices[0]?.message?.content || '';
          });
          console.log(`[Email Intelligence] Success with DeepSeek fallback!`);
        } catch (dsErr: any) {
          console.warn(`[Email Intelligence] DeepSeek failed: ${dsErr.message || dsErr}. Falling back to Gemma...`);
          try {
            // Direct fallback to Gemma via OpenAI SDK configured with Gemma parameters
            aiResponse = await executeWithBackoff(async () => {
              const gemmaOpenAI = new OpenAI({
                apiKey: process.env.NVIDIA_API_KEY_GEMMA || process.env.NVIDIA_API_KEY || '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',
                baseURL: 'https://integrate.api.nvidia.com/v1'
              });
              const completion = await gemmaOpenAI.chat.completions.create({
                model: 'google/gemma-4-31b-it',
                messages: [{ role: 'user', content: prompt }],
                temperature: 1,
                top_p: 0.95,
                max_tokens: 4096,
                stream: false
              });
              return completion.choices[0]?.message?.content || '';
            });
            console.log(`[Email Intelligence] Success with Gemma fallback!`);
          } catch (gemmaErr: any) {
            console.error(`[Email Intelligence] All models in cascade failed!`);
            throw new Error(`Cascade Failure: NemoSuper, Gemini, DeepSeek, and Gemma all failed. Last error: ${gemmaErr.message}`);
          }
        }
      }
    }
    
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
      tags: ['Error', 'Cascade Fail'],
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

/**
 * Generates the structural summary and tagging classification fields using the AI Rotator
 */
export async function generateSummaryAndTagging(email: {
  subject: string;
  body_text: string;
  sender: string;
  date: string;
}): Promise<any> {
  const prompt = `Anda adalah asisten data operasional cerdas. Ekstrak data operasional penting dari email ke dalam format JSON murni tanpa markdown block, tanpa penjelasan apa pun di luar JSON.

JSON schema yang harus dikembalikan:
{
  "summary": "Ringkasan email utama dan tindakan yang harus diambil dalam Bahasa Indonesia",
  "currency": "IDR" or "USD",
  "total_amount": number or null,
  "denomination_suggestion": number or null,
  "suggested_bank": "BCA" or "MANDIRI" or "BRI" or "BNI" or "Lainnya" or "",
  "suggested_folder_parent": "Bank Mandiri" or "Bank Maybank" or "Operation" or "Uncategorized",
  "suggested_folder_child": "Collection" or "ATM" or "CIT" or "General" or "Uncategorized",
  "extracted_notes": "Instruksi khusus atau catatan operasional",
  "suggested_tag": "CIT" or "ATM" or "Lainnya",
  "urgency_level": "High" or "Medium" or "Routine",
  "action_required": true or false
}

Detail Email:
Subject: ${email.subject || '(No Subject)'}
From: ${email.sender || 'Unknown Sender'}
Date: ${email.date || ''}
Body Text:
${email.body_text || '(No Body Content)'}
`;

  const responseText = await getAiCompletion(prompt);
  return parseCleanJson(responseText);
}

/**
 * Processes a list of pending emails using Controlled Concurrency Batching (BAGIAN 1)
 */
export async function executeControlledBulkProcess(
  pendingEmails: any[],
  analyzeSingleEmailFn: (messageId: string) => Promise<any>,
  onProgress?: (data: { current: number; total: number; percentage: number; log: string; status: string }) => void
): Promise<void> {
  const BATCH_SIZE = 2;
  const DELAY_MS = 15000;
  const total = pendingEmails.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = pendingEmails.slice(i, i + BATCH_SIZE);
    
    if (onProgress) {
      onProgress({
        status: 'processing',
        current: i,
        total,
        percentage: Math.round((i / total) * 100),
        log: `Memproses batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)} (jumlah: ${batch.length} email)...`
      });
    }

    const tasks = batch.map(async (email) => {
      try {
        await analyzeSingleEmailFn(email.message_id);
        console.log(`[Controlled Concurrency] Selesai memproses email: ${email.message_id}`);
      } catch (err: any) {
        console.error(`[Controlled Concurrency] Gagal memproses email ${email.message_id}:`, err);
      }
    });

    await Promise.allSettled(tasks); // Tunggu batch pararel selesai

    const currentProcessed = Math.min(i + BATCH_SIZE, total);
    if (onProgress) {
      onProgress({
        status: 'processing',
        current: currentProcessed,
        total,
        percentage: Math.round((currentProcessed / total) * 100),
        log: `Batch ${Math.floor(i / BATCH_SIZE) + 1} selesai diproses (${currentProcessed}/${total}).`
      });
    }

    console.log(`[Batch] Selesai memproses ${currentProcessed} dari ${total}`);

    if (i + BATCH_SIZE < total) {
      if (onProgress) {
        onProgress({
          status: 'delaying',
          current: currentProcessed,
          total,
          percentage: Math.round((currentProcessed / total) * 100),
          log: `Menunggu jeda wajib ${DELAY_MS / 1000} detik sebelum batch berikutnya...`
        });
      }
      console.log(`[Batch] Menunggu ${DELAY_MS}ms sebelum batch berikutnya...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
}

