/**
 * =========================================================================
 * AI PROCESSING SERVICE & LLM INTEGRATION
 * =========================================================================
 * 
 * FLOW:
 * 1. Menerima EmailPayload (subject, sender, body, lampiran/attachments).
 * 2. Memeriksa keberadaan lampiran media (gambar/PDF) untuk memilih model Vision vs Core.
 * 3. Menyusun System Prompt dengan petunjuk ekstraksi JSON murni (urgensi, tindakan, CIT order ticket count).
 * 4. Mengirimkan prompt ke AI Completion API (Gemini / Multi-LLM provider).
 * 5. Jika AI API gagal, menjalankan mekanisme fallback otomatis.
 * 6. Mem-parsing hasil JSON dari AI dan mengembalikan metadata struktur.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { readFile } from 'node:fs/promises';
import OpenAI from 'openai';
import sharp from 'sharp';
import { getAiCompletion } from './aiService';

/**
 * 1. SETUP OPENAI CLIENT (PRIMARY AI)
 */
export const customAi = new OpenAI({
  apiKey: 'sk-WYKkPR_QQ6LTbnGWyIxPZA',
  baseURL: 'https://aim.adv.my.id/v1'
});

export interface EmailPayload {
  message_id?: string;
  uid?: string | number;
  subject?: string;
  sender?: string;
  date?: string;
  body_text?: string;
  body?: string;
  attachments?: any[];
  routingPromptContext?: string;
  action_parent?: string;
  action_child?: string;
}

/**
 * Call official Gemini Flash Latest REST API Endpoint
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent
 * Header: Content-Type: application/json, X-goog-api-key: process.env.GEMINI_API_KEY
 */
export async function callGeminiFlash(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di file .env");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-goog-api-key': apiKey
  };
  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ]
  };

  const response = await axios.post(url, payload, { headers, timeout: 30000 });
  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini Flash returned empty response candidates');
  }
  return text;
}

/**
 * Call Custom AI (aim.adv.my.id) using OpenAI-Compatible Chat API
 * Endpoints:
 *   1) https://aim.adv.my.id/engines/{model}/chat/completions
 *   2) https://aim.adv.my.id/v1/chat/completions
 * Headers: Content-Type: application/json, Authorization: Bearer <API_KEY>
 * Reads response.data.choices[0].message.content
 */
export async function callCustomAiModel(
  model: 'Core' | 'Vision' | string,
  messages: any[],
  apiKey: string = process.env.CUSTOM_AI_API_KEY || 'sk-WYKkPR_QQ6LTbnGWyIxPZA'
): Promise<string> {
  const targetModel = model || 'Core';
  const token = apiKey.replace(/^Bearer\s+/i, '');

  const endpoints = [
    `https://aim.adv.my.id/engines/${encodeURIComponent(targetModel)}/chat/completions`,
    `https://aim.adv.my.id/v1/chat/completions`
  ];

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const payload = {
    model: targetModel,
    messages
  };

  let lastError: any = null;

  for (const url of endpoints) {
    try {
      const response = await axios.post(url, payload, { headers, timeout: 30000 });
      const content = response.data?.choices?.[0]?.message?.content;
      if (content !== undefined && content !== null) {
        return typeof content === 'string' ? content : JSON.stringify(content);
      }
    } catch (err: any) {
      console.warn(`[Custom AI] Endpoint ${url} error:`, err.response?.data || err.message);
      lastError = err;
    }
  }

  throw new Error(`Custom AI (${targetModel}) request failed: ${lastError?.response?.data?.message || lastError?.message || String(lastError)}`);
}

/**
 * Helper to check if an attachment is an image or media/document format suitable for Vision model
 */
function isMediaAttachment(att: any): boolean {
  if (!att) return false;
  const filename = att.filename || att.name || '';
  const mimeType = att.mimeType || att.type || '';
  const ext = path.extname(filename).toLowerCase();

  const mediaExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.pdf', '.tiff'];
  if (mediaExtensions.includes(ext)) return true;
  if (mimeType.startsWith('image/') || mimeType.includes('pdf')) return true;

  return false;
}

/**
 * Analyzes email content using Custom AI (Primary: Core or Vision), Gemini Flash Latest, with NVIDIA AI Rotator Fallback
 */
export async function analyzeEmailContent(emailPayload: EmailPayload): Promise<any> {
  const identifier = emailPayload.uid || emailPayload.message_id || emailPayload.subject || 'unknown';

  let attachments = emailPayload.attachments || [];
  if (typeof attachments === 'string') {
    try {
      attachments = JSON.parse(attachments);
    } catch {
      attachments = [];
    }
  }

  // 2. ROUTING MODEL UTAMA (Core vs Vision)
  const hasMediaAttachment = Array.isArray(attachments) && attachments.some(isMediaAttachment);
  const targetModel = hasMediaAttachment ? "Vision" : "Core";

  const routingContextStr = emailPayload.routingPromptContext ? `\n${emailPayload.routingPromptContext}\n` : '';

  const systemPrompt = `Anda adalah asisten data operasional cerdas. Ekstrak data operasional penting dari email dan lampirannya ke dalam format JSON murni tanpa markdown block, tanpa penjelasan apa pun di luar JSON.

ATURAN MERANGKUM (summary & summary_text): DILARANG KERAS menggunakan kalimat pembuka basa-basi seperti 'Email ini berisi...' atau 'Pesan dari pengirim mengenai...'. Langsung tuliskan inti instruksi secara profesional (Siapa, Melakukan Apa, Berapa Nominal, Kapan, Dimana). Contoh summary yang benar: 'Penukaran fisik valas USD 200,000 dari Bank CIMB Niaga ke Maybank, pecahan @100, jadwal Rabu 05 Agustus 2026.'

ATURAN SPESIFIK EMAIL LAMPIRAN (CIT/RUNSHEET): Jika email menyatakan pengiriman data, lampiran, atau instruksi operasional (seperti 'Terlampir data CIT Permata' atau konfirmasi penugasan) meskipun tidak ada nominal uang di dalam teks body, DILARANG KERAS menggunakan ringkasan generik seperti 'Berisi informasi operasional rutin'. WAJIB rangkum spesifik jenis datanya, siapa pengirimnya, dan tujuannya.
Contoh ringkasan yang benar: 'Pengiriman data CIT Permata untuk Advantage Batam dari Bank Permata (Sri Purwati) tanggal 06 Agustus 2026.'

ATURAN ANGKA: Untuk field total_amount, denomination_suggestion, atau key/value di dalam denomination_breakdown, JANGAN menyertakan mata uang (seperti USD, Rp, $). Berikan ANGKA MURNI saja.

Jika di dalam email terdapat rincian pecahan uang (denomination breakdown), WAJIB ekstrak data tersebut ke dalam key JSON denomination_breakdown dengan format Key-Value Pair murni. Contoh: {"50000": 350000000, "100000": 100000000}. Jangan campurkan teks lain di dalamnya. Jika tidak ada pecahan, kembalikan objek kosong {}.
${routingContextStr}
JSON Schema yang HARUS dikembalikan:
{
  "summary": "Ringkasan email utama dan tindakan secara langsung dan profesional tanpa kata pembuka basa-basi",
  "currency": "IDR",
  "total_amount": null,
  "denomination_suggestion": null,
  "denomination_breakdown": {},
  "suggested_bank": "${emailPayload.action_parent || 'BCA'}",
  "suggested_folder_parent": "${emailPayload.action_parent || 'Operation'}",
  "suggested_folder_child": "${emailPayload.action_child || 'General'}",
  "extracted_notes": "Instruksi khusus atau catatan operasional dari email/lampiran",
  "suggested_tag": "Informasi",
  "urgency_level": "Routine",
  "action_required": false,
  "is_cit_order": false,
  "cit_type": "None",
  "folder": "${emailPayload.action_parent || 'Operation'}",
  "sub_folder": "${emailPayload.action_child || 'General'}",
  "tags": ["Informasi"],
  "summary_email": "Ringkasan email",
  "summary_attachments": []
}`;

  const textBody = emailPayload.body_text || emailPayload.body || '';
  const textPrompt = `Detail Email:
Subject: ${emailPayload.subject || '(No Subject)'}
From: ${emailPayload.sender || 'Unknown Sender'}
Date: ${emailPayload.date || ''}
Body Text:
${textBody || '(No Body Content)'}`;

  // 3. PAYLOAD FORMATTING UTAMA
  let userMessagesContent: any = textPrompt;

  if (targetModel === "Vision" && Array.isArray(attachments)) {
    const contentArray: any[] = [
      { type: "text", text: textPrompt }
    ];

    for (const att of attachments) {
      if (!isMediaAttachment(att)) continue;

      let base64Data: string | null = null;
      let mimeType = att.mimeType || att.type || 'image/jpeg';
      const filename = att.filename || att.name || 'attachment';
      const ext = path.extname(filename).toLowerCase();

      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.pdf') mimeType = 'application/pdf';
      else if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';

      if (att.fileData) {
        base64Data = att.fileData.replace(/^data:[^;]+;base64,/, '');
      } else if (att.filePath && fs.existsSync(att.filePath)) {
        try {
          const buf = fs.readFileSync(att.filePath);
          base64Data = buf.toString('base64');
        } catch (e) {
          console.warn(`[AI Primary] Could not read file at ${att.filePath}:`, e);
        }
      }

      if (base64Data) {
        contentArray.push({
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`
          }
        });
      }
    }

    if (contentArray.length > 1) {
      userMessagesContent = contentArray;
    }
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessagesContent }
  ];

  // 4. MEKANISME ROTATOR & FALLBACK (Custom AI -> Gemini Flash -> NVIDIA Rotator)
  try {
    console.log(`[AI Pipeline] 1. Analyzing UID/Message "${identifier}" using Custom AI model: ${targetModel}`);
    const rawContent = await callCustomAiModel(targetModel, messages);
    const parsedData = parseCleanJson(rawContent);

    if (parsedData && typeof parsedData === 'object' && Object.keys(parsedData).length > 0) {
      console.log(`[AI Pipeline] Successfully analyzed UID/Message "${identifier}" with Custom AI (${targetModel})`);
      return parsedData;
    }
  } catch (primaryError: any) {
    console.warn(`[AI Pipeline] Custom AI (${targetModel}) failed. Proceeding to Gemini Flash Latest...`, primaryError?.message || String(primaryError));
  }

  // Fallback 1: Gemini Flash Latest
  try {
    console.log(`[AI Pipeline] 2. Attempting Gemini Flash Latest for UID/Message: ${identifier}...`);
    const promptCombined = `${systemPrompt}\n\n${textPrompt}\n\nKembalikan HANYA JSON murni yang valid sesuai schema di atas.`;
    const geminiText = await callGeminiFlash(promptCombined);
    const parsedGemini = parseCleanJson(geminiText);

    if (parsedGemini && typeof parsedGemini === 'object' && Object.keys(parsedGemini).length > 0) {
      console.log(`[AI Pipeline] Successfully analyzed UID/Message "${identifier}" with Gemini Flash Latest`);
      return parsedGemini;
    }
  } catch (geminiError: any) {
    console.warn(`[AI Pipeline] Gemini Flash Latest failed. Proceeding to NVIDIA AI Rotator fallback...`, geminiError?.message || String(geminiError));
  }

  // Fallback 2: NVIDIA AI Rotator
  try {
    console.log(`[AI Pipeline] 3. Executing NVIDIA AI Secondary Fallback for UID/Message: ${identifier}...`);
    const nvidiaPrompt = `${systemPrompt}\n\n${textPrompt}\n\nKembalikan HANYA JSON murni yang valid sesuai schema di atas.`;
    const nvidiaResponseText = await getAiCompletion(nvidiaPrompt);
    const parsedNvidia = parseCleanJson(nvidiaResponseText);

    if (parsedNvidia && typeof parsedNvidia === 'object' && Object.keys(parsedNvidia).length > 0) {
      console.log(`[AI Pipeline] Successfully analyzed UID/Message "${identifier}" with NVIDIA AI Rotator fallback`);
      return parsedNvidia;
    }
  } catch (secondaryError: any) {
    console.error(`[AI Pipeline] Secondary NVIDIA AI also failed for UID/Message ${identifier}:`, secondaryError?.message || String(secondaryError));
  }

  // 5. FINAL ERROR HANDLING
  console.error(`All AI endpoints failed, skipping analysis for UID ${identifier}...`);
  return null;
}

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
 * Nemotron-3-Nano-Omni-30B call via axios
 */
async function processWithNanoOmni(promptText: string, imageB64: string | null = null): Promise<string> {
  const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
  const headers = {
    "Authorization": "Bearer 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",
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  const content: any = imageB64 ? [
    { type: "text", text: promptText },
    {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${imageB64}`
      }
    }
  ] : promptText;

  const payload = {
    "messages": [{"role": "user", "content": content}],
    "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "max_tokens": 65536,
    "reasoning_budget": 16384,
    "stream": false, // Parse hasil JSON secara utuh (bukan stream)
    "temperature": 0.6,
    "top_p": 0.95
  };

  const response = await axios.post(invokeUrl, payload, { headers, responseType: 'json' });
  return response.data?.choices?.[0]?.message?.content || "";
}

/**
 * Nemotron-3-Super-120B call via OpenAI SDK (streamed)
 */
const super120Client = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function processWithSuper120(promptText: string): Promise<string> {
  let fullContent = "";
  const completion: any = await super120Client.chat.completions.create({
    model: "nvidia/nemotron-3-super-120b-a12b",
    messages: [{"role": "user", "content": promptText}],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    reasoning_budget: 16384,
    chat_template_kwargs: {"enable_thinking": true},
    stream: true
  } as any);

  for await (const chunk of completion) {
    fullContent += chunk.choices[0]?.delta?.content || '';
  }
  return fullContent;
}

/**
 * OpenAI GPT-OSS 120B call (Cascade Fallback Tier 1)
 */
export async function callGptOss120b(imageB64: string | null, promptText: string): Promise<string> {
  const chatgpt_NVIDIA = new OpenAI({
    apiKey: process.env.chatgpt_NVDIA_KEY || process.env.chatgpt_NVIDIA_KEY || process.env.NVIDIA_API_KEY || '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',
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

  const messagesPayload = [
    {
      role: "user",
      content: contentPayload
    }
  ];

  try {
    const completion = await chatgpt_NVIDIA.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: messagesPayload as any,
      temperature: 1,
      top_p: 1,
      max_tokens: 4096,
      stream: false
    });

    const choice = completion.choices[0]?.message as any;
    const reasoning = choice?.reasoning_content;
    const content = choice?.content;
    return content || reasoning || "";
  } catch (error: any) {
    const errorDetail = error.response?.data?.detail || error.response?.data || error.message || String(error);
    console.error("[NVIDIA AI Error]", errorDetail);
    throw new Error(typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : String(errorDetail));
  }
}

/**
 * NVIDIA Nemotron 3 Ultra 550B call (Ultra Deep Reasoning Engine)
 */
export async function callNemotronUltra550b(promptText: string): Promise<string> {
  const openaiUltra = new OpenAI({
    apiKey: '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',
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const completion = await openaiUltra.chat.completions.create({
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    messages: [
      {
        role: "user",
        content: promptText
      }
    ],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    reasoning_budget: 16384,
    chat_template_kwargs: { "enable_thinking": true },
    stream: false
  } as any);

  const choice = completion.choices[0]?.message as any;
  return choice?.content || choice?.reasoning_content || "";
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
 * Image Rotator (Nano Omni 30B -> OpenAI GPT-OSS 120B -> StepFun)
 */
export async function processImageAttachmentWithRotator(filePath: string, filename: string): Promise<string> {
  const imageB64 = await compressImageForNvidia(filePath);
  const promptText = `Ekstrak semua teks penting, angka, tabel, dan data penting dari gambar lampiran bernama "${filename}" dengan teliti, lengkap, dan rapi dalam Bahasa Indonesia.`;
  
  const models = [
    { name: 'Nemotron-3-Nano-Omni-30B', fn: () => processWithNanoOmni(promptText, imageB64) },
    { name: 'OpenAI-GPT-OSS-120B', fn: () => callGptOss120b(imageB64, promptText) },
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
 * Document Rotator (Nemotron 3 Ultra 550B -> Super 120B -> Nano Omni 30B -> OpenAI GPT-OSS 120B -> StepFun)
 */
export async function processDocumentAttachmentWithRotator(filePath: string, filename: string): Promise<string> {
  const rawText = extractAttachmentContent(filePath, filename);
  const promptText = `Berikut adalah teks mentah atau metadata hasil ekstraksi dari lampiran dokumen bernama "${filename}":
"""
${rawText}
"""

Harap ringkas dan analisis semua data penting, angka, transaksi, tabel, instruksi, atau informasi penting dari dokumen ini dalam Bahasa Indonesia secara mendalam, terstruktur, dan rapi.`;

  const models = [
    { name: 'Nemotron-3-Ultra-550B', fn: () => callNemotronUltra550b(promptText) },
    { name: 'Nemotron-3-Super-120B', fn: () => processWithSuper120(promptText) },
    { name: 'Nemotron-3-Nano-Omni-30B', fn: () => processWithNanoOmni(promptText) },
    { name: 'OpenAI-GPT-OSS-120B', fn: () => callGptOss120b(null, promptText) },
    { name: 'StepFun-3.7-Flash', fn: () => callStepFun(null, promptText) }
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
  return processWithSuper120(promptText);
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
  routingPromptContext?: string;
  action_parent?: string;
  action_child?: string;
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
    const routingContextStr = email.routingPromptContext ? `\n${email.routingPromptContext}\n` : '';
    const prompt = `[NEMO RETRIEVER CONTEXT]
${routingContextStr}
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
If a value is not explicitly findable or retrievable, use standard operational defaults (e.g., "${email.action_parent || 'Operation'}" or "${email.action_child || 'General'}"). All summaries must be in Bahasa Indonesia.

Expected JSON schema to return:
{
  "folder": "${email.action_parent || 'Major category retrieved from context (e.g., BCA, MANDIRI, BRI, BNI, Maybank, or Operation)'}",
  "sub_folder": "${email.action_child || 'Specific child category or transaction type (e.g., CIT, ATM, Collection, General, Uncategorized)'}",
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
        return await processWithSuper120(prompt);
      });
      console.log(`[Email Intelligence] Success with Nemotron-3-Super 120B!`);
    } catch (nemoErr: any) {
      console.warn(`[Email Intelligence] Primary model Nemotron-3-Super 120B failed: ${nemoErr.message || nemoErr}. Falling back to Nemotron-3-Nano-Omni-30B...`);
      try {
        aiResponse = await executeWithBackoff(async () => {
          return await processWithNanoOmni(prompt);
        });
        console.log(`[Email Intelligence] Success with Nemotron-3-Nano-Omni-30B fallback!`);
      } catch (nanoErr: any) {
        console.warn(`[Email Intelligence] Nemotron-3-Nano-Omni-30B failed: ${nanoErr.message || nanoErr}. Falling back to OpenAI GPT-OSS 120B...`);
        try {
          aiResponse = await executeWithBackoff(async () => {
            return await callGptOss120b(null, prompt);
          });
          console.log(`[Email Intelligence] Success with OpenAI GPT-OSS 120B fallback!`);
        } catch (gptErr: any) {
          console.warn(`[Email Intelligence] OpenAI GPT-OSS 120B failed: ${gptErr.message || gptErr}. Falling back to StepFun-AI Step-3.7-Flash...`);
          try {
            aiResponse = await executeWithBackoff(async () => {
              return await callStepFun(null, prompt);
            });
            console.log(`[Email Intelligence] Success with StepFun fallback!`);
          } catch (stepErr: any) {
            console.error(`[Email Intelligence] All models in cascade failed!`);
            throw new Error(`Cascade Failure: Super120, NanoOmni, GPT-OSS-120B, and StepFun all failed. Last error: ${stepErr.message}`);
          }
        }
      }
    }
    
    // 5. Clean & parse response
    const parsedResult = parseCleanJson(aiResponse);
    
    // Validate output structure
    return {
      folder: email.action_parent || parsedResult?.folder || 'Operation',
      sub_folder: email.action_child || parsedResult?.sub_folder || 'General',
      tags: Array.isArray(parsedResult?.tags) ? parsedResult.tags : ['General'],
      summary_email: parsedResult?.summary_email || email.subject || 'No summary generated',
      summary_attachments: Array.isArray(parsedResult?.summary_attachments) ? parsedResult.summary_attachments : []
    };

  } catch (err: any) {
    console.error(`[Email Intelligence] Error processing email intelligence for ${email.message_id}:`, err);
    // Return standard fallback model on failure
    return {
      folder: email.action_parent || 'Operation',
      sub_folder: email.action_child || 'General',
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
  attachments?: any[];
  routingPromptContext?: string;
  action_parent?: string;
  action_child?: string;
}): Promise<any> {
  const primaryResult = await analyzeEmailContent(email);
  if (primaryResult) {
    if (email.action_parent) {
      primaryResult.suggested_folder_parent = email.action_parent;
      primaryResult.folder = email.action_parent;
    }
    if (email.action_child) {
      primaryResult.suggested_folder_child = email.action_child;
      primaryResult.sub_folder = email.action_child;
    }
    return primaryResult;
  }

  const prompt = `Anda adalah asisten data operasional cerdas. Ekstrak data operasional penting dari email ke dalam format JSON murni tanpa markdown block, tanpa penjelasan apa pun di luar JSON.

JSON schema yang harus dikembalikan:
{
  "summary": "Ringkasan email utama dan tindakan yang harus diambil dalam Bahasa Indonesia",
  "currency": "IDR",
  "total_amount": null,
  "denomination_suggestion": null,
  "suggested_bank": "BCA",
  "suggested_folder_parent": "Operation",
  "suggested_folder_child": "General",
  "extracted_notes": "Instruksi khusus atau catatan operasional",
  "suggested_tag": "Informasi",
  "urgency_level": "Routine",
  "action_required": false
}

Detail Email:
Subject: ${email.subject || '(No Subject)'}
From: ${email.sender || 'Unknown Sender'}
Date: ${email.date || ''}
Body Text:
${email.body_text || '(No Body Content)'}
`;

  try {
    const responseText = await getAiCompletion(prompt);
    return parseCleanJson(responseText);
  } catch (err) {
    console.warn('[generateSummaryAndTagging] Fallback AI failed:', err);
    return null;
  }
}

/**
 * Processes a list of pending emails using Controlled Concurrency Batching (BAGIAN 1)
 */
export async function executeControlledBulkProcess(
  pendingEmails: any[],
  analyzeSingleEmailFn?: (messageId: string, tenantId?: number) => Promise<any>,
  onProgress?: (data: { current: number; total: number; percentage: number; log: string; status: string }) => void
): Promise<void> {
  const { emailQueue, aiQueue } = await import('../config/queue');
  const activeQueue = aiQueue || emailQueue;
  const total = pendingEmails.length;

  for (let i = 0; i < total; i++) {
    const email = pendingEmails[i];
    const messageId = String(email.message_id || email.id || '').trim();
    if (!messageId) continue;

    try {
      await activeQueue.add('process-email', {
        message_id: messageId,
        tenant_id: email.tenant_id || 1,
        subject: email.subject || '',
        body: email.body || email.body_text || email.html_body || '',
        sender: email.sender || email.sender_email || '',
        received_at: email.received_at || email.date || new Date().toISOString()
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      });
      console.log(`[Queue Enqueue] Added email ${messageId} to Redis queue.`);
    } catch (qErr) {
      console.error(`[Queue Add Error] Failed to enqueue email ${messageId}:`, qErr);
    }

    if (onProgress) {
      onProgress({
        status: i === total - 1 ? 'complete' : 'processing',
        current: i + 1,
        total,
        percentage: Math.round(((i + 1) / total) * 100),
        log: `Email ${i + 1}/${total} (${email.subject || messageId}) berhasil dimasukkan ke antrean Redis AI.`
      });
    }
  }
}

/**
 * Generates a Consolidated Daily Bulk Summary for Non-COS Divisions (e.g. RH, BM)
 */
export async function generateDailySummary(tenantId: number, targetDate?: string): Promise<any> {
  const { dbGetTenants, getDbService } = await import('./dbManager');
  const tenants = await dbGetTenants();
  const tenant = tenants.find(t => t.id === tenantId);
  if (!tenant) {
    throw new Error(`Tenant dengan ID ${tenantId} tidak ditemukan.`);
  }

  const dbService = await getDbService();
  let filteredEmails: any[] = [];
  
  const getYYYYMMDD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  let summaryDateStr = (targetDate && typeof targetDate === 'string' && targetDate.trim())
    ? targetDate.trim().split('T')[0]
    : getYYYYMMDD(new Date());

  let stats = {
    total_emails: 0,
    unread_count: 0,
    action_required_count: 0,
    urgent_count: 0,
    total_amount_sum: 0
  };

  if (dbService.type === 'postgres' && dbService.pgPool) {
    // 1. INSTRUKSI 1: Query SQL Agregasi untuk mengambil statistik tanpa payload body mentah
    let statsRes = await dbService.pgPool.query(
      `SELECT 
          COUNT(*) as total_emails,
          COUNT(CASE WHEN is_read = false THEN 1 END) as unread_count,
          COUNT(CASE WHEN action_required = true THEN 1 END) as action_required_count,
          COUNT(CASE WHEN urgency_level = 'High' OR is_important = true THEN 1 END) as urgent_count,
          COALESCE(SUM(total_amount), 0) as total_amount_sum
       FROM public.emails 
       WHERE tenant_id = $1 AND DATE("date") = $2::date`,
      [tenantId, summaryDateStr]
    );

    let count = Number(statsRes.rows[0]?.total_emails || 0);

    // Fallback ke MAX(DATE("date")) jika targetDate kosong / default hari ini dan tidak ada email
    if (count === 0 && !targetDate) {
      console.log(`[Daily Summary] Tidak ada email hari ini (${summaryDateStr}) untuk tenant ${tenantId}. Fallback ke MAX DATE...`);
      const maxDateRes = await dbService.pgPool.query(
        `SELECT MAX(DATE("date"))::text as max_date FROM public.emails WHERE tenant_id = $1`,
        [tenantId]
      );
      if (maxDateRes.rows[0]?.max_date) {
        summaryDateStr = maxDateRes.rows[0].max_date.split('T')[0];
        statsRes = await dbService.pgPool.query(
          `SELECT 
              COUNT(*) as total_emails,
              COUNT(CASE WHEN is_read = false THEN 1 END) as unread_count,
              COUNT(CASE WHEN action_required = true THEN 1 END) as action_required_count,
              COUNT(CASE WHEN urgency_level = 'High' OR is_important = true THEN 1 END) as urgent_count,
              COALESCE(SUM(total_amount), 0) as total_amount_sum
           FROM public.emails 
           WHERE tenant_id = $1 AND DATE("date") = $2::date`,
          [tenantId, summaryDateStr]
        );
      }
    }

    if (statsRes.rows[0]) {
      stats = {
        total_emails: Number(statsRes.rows[0].total_emails || 0),
        unread_count: Number(statsRes.rows[0].unread_count || 0),
        action_required_count: Number(statsRes.rows[0].action_required_count || 0),
        urgent_count: Number(statsRes.rows[0].urgent_count || 0),
        total_amount_sum: Number(statsRes.rows[0].total_amount_sum || 0)
      };
    }

    // 2. Ambil daftar email teragregasi (hanya kolom penting, TANPA body_text mentah)
    const emailRes = await dbService.pgPool.query(
      `SELECT id, message_id, subject, sender, date, summary, total_amount, currency, is_important, urgency_level, action_required, tag_type, suggested_bank, cit_type 
       FROM public.emails 
       WHERE tenant_id = $1 AND DATE("date") = $2::date
       ORDER BY date DESC LIMIT 100`,
      [tenantId, summaryDateStr]
    );
    filteredEmails = emailRes.rows;

  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    const col = dbService.mongoDb.collection('emails');
    const startOfDay = new Date(summaryDateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(summaryDateStr);
    endOfDay.setHours(23, 59, 59, 999);

    filteredEmails = await col.find({
      tenant_id: tenantId,
      $or: [
        { received_at: { $gte: startOfDay, $lte: endOfDay } },
        { date: { $gte: startOfDay, $lte: endOfDay } }
      ]
    }).limit(100).toArray();

    if (filteredEmails.length === 0 && !targetDate) {
      const latestEmail = await col.find({ tenant_id: tenantId }).sort({ date: -1, received_at: -1 }).limit(1).toArray();
      if (latestEmail.length > 0) {
        const latestDate = latestEmail[0].date || latestEmail[0].received_at;
        if (latestDate) {
          summaryDateStr = new Date(latestDate).toISOString().split('T')[0];
          const maxDate = new Date(summaryDateStr);
          maxDate.setHours(0, 0, 0, 0);
          const endMaxDate = new Date(summaryDateStr);
          endMaxDate.setHours(23, 59, 59, 999);
          filteredEmails = await col.find({
            tenant_id: tenantId,
            $or: [
              { received_at: { $gte: maxDate, $lte: endMaxDate } },
              { date: { $gte: maxDate, $lte: endMaxDate } }
            ]
          }).limit(100).toArray();
        }
      }
    }

    stats.total_emails = filteredEmails.length;
    stats.unread_count = filteredEmails.filter(e => e.is_read === false).length;
    stats.action_required_count = filteredEmails.filter(e => e.action_required === true).length;
    stats.urgent_count = filteredEmails.filter(e => e.urgency_level === 'High' || e.is_important === true).length;
    stats.total_amount_sum = filteredEmails.reduce((acc, e) => acc + (Number(e.total_amount) || 0), 0);
  }

  // Format email ringkas
  const emailListStr = filteredEmails.map((e, idx) => {
    const subject = e.subject || '(Tanpa Subjek)';
    const sender = e.sender || 'Pengirim Tidak Diketahui';
    const tag = e.tag_type || 'Lainnya';
    const urgency = e.urgency_level || 'Normal';
    const amountStr = e.total_amount ? `${e.currency || 'IDR'} ${Number(e.total_amount).toLocaleString('id-ID')}` : '-';
    const summary = e.summary || e.extracted_notes || 'Tidak ada ringkasan';
    return `[${idx + 1}] Dari: ${sender} | Subjek: ${subject} | Tag: ${tag} | Urgensi: ${urgency} | Nominal: ${amountStr}\n   Ringkasan: ${summary}`;
  }).join('\n\n');

  const formattedAmountSum = `Rp ${stats.total_amount_sum.toLocaleString('id-ID')}`;

  // INSTRUKSI 2: CORE AI ENGINE UNTUK EXECUTIVE REPORT
  const systemPrompt = `Anda adalah Asisten AI Executive untuk Rangkuman Harian (Daily Summary).
DILARANG KERAS menggunakan kata pembuka basa-basi seperti 'Email ini berisi...' atau 'Pesan dari pengirim...'.
WAJIB langsung merespons dalam format Markdown terstruktur yang presisi sesuai templat Executive Dashboard.`;

  const userPrompt = `Buatkan Daily AI Email Executive Summary untuk Divisi ${tenant.name} pada tanggal ${summaryDateStr}.

Data Statistik Teragregasi:
- Total Email: ${stats.total_emails}
- Email Belum Dibaca: ${stats.unread_count}
- Email Perlu Dibalas: ${stats.action_required_count}
- Email Sangat Mendesak: ${stats.urgent_count}
- Total Potensi Revenue / Nominal: ${formattedAmountSum}

Daftar Ringkasan Email Masuk:
${emailListStr || 'Tidak ada daftar ringkasan email.'}

Gunakan format Markdown berikut secara eksak:

# Daily AI Email Executive Summary
**Tanggal** : ${summaryDateStr}
**Periode Analisa** : ${summaryDateStr} 00:00 - 23:59 WIB
**Total Email Masuk** : ${stats.total_emails} Email

## Executive Dashboard
- Total Email: ${stats.total_emails}
- Email Belum Dibaca: ${stats.unread_count}
- Email Perlu Dibalas: ${stats.action_required_count}
- Email Sangat Mendesak: ${stats.urgent_count}
- Total Potensi Revenue / Nominal: ${formattedAmountSum}

1. PRIORITAS HARI INI (Email penting / action required)
2. ORDER MASUK & POTENSI REVENUE (Berdasarkan data email order / CIT)
3. JADWAL MEETING & AGENDA PENTING
4. TREND & KATEGORI UTAMA HARI INI`;

  // INSTRUKSI 3: INTEGRASI MODEL CORE AI & FALLBACK AMAN
  let summaryText = '';
  try {
    const response = await customAi.chat.completions.create({
      model: 'Custom AI Core',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 3000
    });
    summaryText = response.choices[0]?.message?.content || '';
  } catch (err: any) {
    console.warn(`Primary Custom AI Core error for generateDailySummary, trying Gemini fallback:`, err?.message || err);
    try {
      summaryText = await getAiCompletion(`${systemPrompt}\n\n${userPrompt}`);
    } catch (err2: any) {
      console.warn(`Gemini fallback error as well: ${err2?.message || err2}. Executing Rule-Based Fallback.`);
    }
  }

  // Rule-Based Fallback (Mencegah UI Blank atau Error 403)
  if (!summaryText || !summaryText.trim()) {
    summaryText = `# Daily AI Email Executive Summary
**Tanggal** : ${summaryDateStr}
**Periode Analisa** : ${summaryDateStr} 00:00 - 23:59 WIB
**Total Email Masuk** : ${stats.total_emails} Email

## Executive Dashboard
- Total Email: ${stats.total_emails}
- Email Belum Dibaca: ${stats.unread_count}
- Email Perlu Dibalas: ${stats.action_required_count}
- Email Sangat Mendesak: ${stats.urgent_count}
- Total Potensi Revenue / Nominal: ${formattedAmountSum}

1. PRIORITAS HARI INI (Email penting / action required)
- Terdeteksi ${stats.action_required_count} email yang memerlukan tindak lanjut/balasan operasional.
- Terdeteksi ${stats.urgent_count} email dengan tingkat urgensi tinggi atau ditandai penting.

2. ORDER MASUK & POTENSI REVENUE (Berdasarkan data email order / CIT)
- Akumulasi total potensi nominal transaksi/order: ${formattedAmountSum}.

3. JADWAL MEETING & AGENDA PENTING
- Mengikuti jadwal dan instruksi kerja operasional harian terlampir pada email.

4. TREND & KATEGORI UTAMA HARI INI
- Rangkuman dikompilasi secara otomatis melalui Rule-Based Aggregation Engine.`;
  }

  // Buat Rangkuman Ringkas (Telegram / WA)
  const topEmailsPreview = filteredEmails.slice(0, 5).map(e => 
    `• [${e.urgency_level || 'Normal'}] ${e.sender || 'Pengirim'}: "${(e.subject || 'Tanpa Subjek').slice(0, 50)}"`
  ).join('\n');

  const summaryTextShort = `📊 *RANGKUMAN HARIAN DIVISI ${tenant.name.toUpperCase()}* (${summaryDateStr})

📈 *Statistik Utama:*
• Total Email Masuk: ${stats.total_emails}
• Unread: ${stats.unread_count} | Perlu Tindakan: ${stats.action_required_count} | Urgen: ${stats.urgent_count}
• Potensi Nominal / Order: ${formattedAmountSum}

🔴 *Prioritas & Tindakan:*
${stats.action_required_count > 0 ? `• Terdeteksi ${stats.action_required_count} email yang memerlukan balasan/tindak lanjut operasional.` : '• Tidak ada email yang memerlukan tindakan mendesak.'}
${stats.urgent_count > 0 ? `• Terdeteksi ${stats.urgent_count} email tingkat urgensi tinggi.` : '• Status operasional stabil.'}

📝 *Garis Besar Email Masuk:*
${topEmailsPreview || '• Tidak ada email.'}`;

  const sourceEmailIds = filteredEmails.map(e => e.message_id || String(e.id));
  
  // Phase 4: Append-Only DB Save (Tanpa ON CONFLICT DO UPDATE)
  const { dbSaveDailySummary } = await import('./dbManager');
  const savedSummary = await dbSaveDailySummary({
    tenant_id: tenantId,
    summary_date: summaryDateStr,
    content_text: summaryText,
    content_text_short: summaryTextShort,
    is_sent_to_wa: false,
    source_email_ids: sourceEmailIds
  });

  return {
    ...savedSummary,
    summary_date: summaryDateStr,
    summary_text: summaryText,
    summary_text_short: summaryTextShort,
    generated_at: savedSummary?.created_at,
    source_emails: filteredEmails
  };
}

/**
 * Superadmin Single AI Model Tester
 * Tests an individual AI model with prompt 'hello world' and calculates latency.
 */
export async function testSingleAiModel(modelName: string): Promise<{
  success: boolean;
  latency: number;
  modelName: string;
  responseText: string;
  output?: string;
  error?: string;
}> {
  const startTime = Date.now();
  const normalized = (modelName || '').toLowerCase().trim();

  try {
    let responseText = '';
    const testPrompt = 'hello world';

    if (normalized.includes('gemini')) {
      responseText = await callGeminiFlash(testPrompt);
    } else if (normalized.includes('vision')) {
      responseText = await callCustomAiModel('Vision', [{ role: 'user', content: testPrompt }]);
    } else if (normalized.includes('core')) {
      responseText = await callCustomAiModel('Core', [{ role: 'user', content: testPrompt }]);
    } else if (normalized.includes('ultra') || normalized.includes('550b')) {
      responseText = await callNemotronUltra550b(testPrompt);
    } else if (normalized.includes('nano') || normalized.includes('omni')) {
      responseText = await processWithNanoOmni(testPrompt);
    } else if (normalized.includes('super') || (normalized.includes('120b') && !normalized.includes('gpt') && !normalized.includes('oss'))) {
      responseText = await processWithSuper120(testPrompt);
    } else if (normalized.includes('gpt') || normalized.includes('oss') || normalized.includes('qwen') || normalized.includes('gpt-oss')) {
      responseText = await callGptOss120b(null, testPrompt);
    } else if (normalized.includes('stepfun') || normalized.includes('step')) {
      responseText = await callStepFun(null, testPrompt);
    } else if (normalized.includes('flash')) {
      responseText = await callGeminiFlash(testPrompt);
    } else {
      // Default fallback
      responseText = await callGptOss120b(null, testPrompt);
    }

    const latency = Date.now() - startTime;
    return {
      success: true,
      latency,
      modelName,
      responseText,
      output: (responseText || '').slice(0, 300)
    };
  } catch (err: any) {
    const latency = Date.now() - startTime;
    const errorDetail = err.response?.data?.detail || err.response?.data || err.message || String(err);
    console.error("[NVIDIA AI Error]", errorDetail);
    return {
      success: false,
      latency,
      modelName,
      responseText: '',
      error: typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : String(errorDetail)
    };
  }
}


