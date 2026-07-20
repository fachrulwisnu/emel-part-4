import OpenAI from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';
import { executeWithBackoff } from './aiProcessingService';

// Load environment variables
dotenv.config();

export interface ModelConfig {
  name: string;
  id: string;
  fn: (messages: any[]) => Promise<string>;
}

const MODELS: ModelConfig[] = [
  {
    name: 'Nemotron-3-Nano-Omni-30B',
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    fn: async (messages: any[]) => {
      const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
      const headers = {
        "Authorization": "Bearer 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",
        "Accept": "application/json",
        "Content-Type": "application/json"
      };
      const payload = {
        messages,
        model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        max_tokens: 16384,
        reasoning_budget: 4096,
        stream: false,
        temperature: 0.6,
        top_p: 0.95
      };
      const response = await axios.post(invokeUrl, payload, { headers, timeout: 30000 });
      return response.data?.choices?.[0]?.message?.content || "";
    }
  },
  {
    name: 'Nemotron-3-Super-120B',
    id: 'nvidia/nemotron-3-super-120b-a12b',
    fn: async (messages: any[]) => {
      const openai = new OpenAI({
        apiKey: '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',
        baseURL: 'https://integrate.api.nvidia.com/v1'
      });
      const completion = await openai.chat.completions.create({
        model: "nvidia/nemotron-3-super-120b-a12b",
        messages,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        chat_template_kwargs: {"enable_thinking": true},
        stream: false
      } as any);
      return completion.choices[0]?.message?.content || "";
    }
  },
  {
    name: 'Qwen3-Next-80B',
    id: 'qwen/qwen3-next-80b-a3b-instruct',
    fn: async (messages: any[]) => {
      const openai = new OpenAI({
        apiKey: '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',
        baseURL: 'https://integrate.api.nvidia.com/v1'
      });
      const completion = await openai.chat.completions.create({
        model: "qwen/qwen3-next-80b-a3b-instruct",
        messages,
        temperature: 0.6,
        top_p: 0.7,
        max_tokens: 4096,
        stream: false
      });
      return completion.choices[0]?.message?.content || "";
    }
  },
  {
    name: 'StepFun-3.7-Flash',
    id: 'stepfun-ai/step-3.7-flash',
    fn: async (messages: any[]) => {
      const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
      const headers = {
        "Authorization": "Bearer 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",
        "Accept": "application/json",
        "Content-Type": "application/json"
      };
      const payload = {
        model: "stepfun-ai/step-3.7-flash",
        messages,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 4096,
        stream: false
      };
      const response = await axios.post(invokeUrl, payload, { headers, timeout: 30000 });
      return response.data?.choices?.[0]?.message?.content || "";
    }
  }
];

/**
 * Executes a completion across our 4 active models with Auto-Model Rotation.
 * If one model fails, it automatically continues to the next model in rotation.
 */
export async function getAiCompletion(prompt: string | any[]): Promise<string> {
  const messages = typeof prompt === 'string'
    ? [{ role: 'user', content: prompt }]
    : prompt;

  let lastError: Error | null = null;

  for (const model of MODELS) {
    try {
      console.log(`[AI Rotator] Attempting generation with model: ${model.name} (${model.id})`);
      const rawContent = await executeWithBackoff(async () => {
        return await model.fn(messages);
      });

      if (!rawContent) {
        throw new Error(`Empty response from model: ${model.name}`);
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
