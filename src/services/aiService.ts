import OpenAI from 'openai';
import dotenv from 'dotenv';
import { executeWithBackoff } from './aiProcessingService';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Load environment variables
dotenv.config();

// Hardcoded API Key (Sesuai instruksi)
const GEMINI_API_KEY = "AIzaSyAM5OQ6yxiY2Us9esJzhub3MgFjPb9chkA"; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function generateWithGemini(prompt: string | any[]): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  let textPrompt = "";
  if (typeof prompt === 'string') {
    textPrompt = prompt;
  } else if (Array.isArray(prompt)) {
    textPrompt = prompt.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  }

  const result = await model.generateContent(textPrompt);
  const responseText = result.response.text();
  if (!responseText) {
    throw new Error("Empty response from Gemini 1.5 Flash");
  }
  return responseText;
}

export interface ModelConfig {
  name: string;
  id: string;
  apiKey: string | undefined;
}

const MODELS: ModelConfig[] = [
  {
    name: 'Nemotron',
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    apiKey: process.env.NVIDIA_API_KEY_NEMOTRON || process.env.NVIDIA_API_KEY || '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'
  },
  {
    name: 'Gemini',
    id: 'gemini-1.5-flash',
    apiKey: GEMINI_API_KEY
  },
  {
    name: 'DeepSeek',
    id: 'deepseek-ai/deepseek-v4-pro',
    apiKey: process.env.NVIDIA_API_KEY_DEEPSEEK || process.env.NVIDIA_API_KEY || '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'
  },
  {
    name: 'Gemma',
    id: 'google/gemma-4-31b-it',
    apiKey: process.env.NVIDIA_API_KEY_GEMMA || process.env.NVIDIA_API_KEY || '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'
  },
  {
    name: 'Minimax',
    id: 'minimaxai/minimax-m3',
    apiKey: process.env.NVIDIA_API_KEY_MINIMAX || process.env.NVIDIA_API_KEY || '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'
  }
];

/**
 * Executes a completion across NVIDIA and Google Gemini models with Auto-Model Rotation.
 * If one model fails, it automatically continues to the next model in rotation.
 * 
 * Supports both a raw string prompt or structured OpenAI messages array.
 */
export async function getAiCompletion(prompt: string | any[]): Promise<string> {
  const messages = typeof prompt === 'string'
    ? [{ role: 'user', content: prompt }]
    : prompt;

  let lastError: Error | null = null;

  for (const model of MODELS) {
    try {
      console.log(`[AI Rotator] Attempting generation with model: ${model.name} (${model.id})`);
      if (!model.apiKey) {
        throw new Error(`API Key for model ${model.name} is not configured.`);
      }

      let rawContent = "";
      if (model.name === 'Gemini') {
        rawContent = await executeWithBackoff(async () => {
          return await generateWithGemini(prompt);
        });
      } else {
        rawContent = await executeWithBackoff(async () => {
          const openai = new OpenAI({
            apiKey: model.apiKey,
            baseURL: 'https://integrate.api.nvidia.com/v1',
            timeout: 60000,
          });

          const completion = await openai.chat.completions.create({
            model: model.id,
            messages: messages,
            temperature: 1,
            top_p: 0.95,
            max_tokens: 4096,
            stream: false
          });

          const content = completion.choices[0]?.message?.content || '';
          if (!content) {
            throw new Error(`Empty response from model: ${model.name}`);
          }
          return content;
        });
      }

      console.log(`[AI Rotator] Success with model: ${model.name}`);
      return rawContent;
    } catch (err: any) {
      console.warn(`[AI Rotator] Error with model ${model.name}:`, err.message || String(err));
      lastError = err;
      continue; // Auto-rotate to next model
    }
  }

  throw new Error(`All rotated AI models failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Robust fallback completion implementation specifically requested by the user.
 */
export async function getAiCompletionWithFallback(prompt: string | any[]): Promise<string> {
  return getAiCompletion(prompt);
}
