import type { AIProvider, AnalyzeRequest } from './types';
import type { AnalysisResult } from '@/types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(req: AnalyzeRequest): Promise<AnalysisResult> {
    // TODO: implement OpenAI Vision API
    //
    // Suggested implementation:
    //   const messages = [
    //     { role: 'system', content: 'You are a design QA assistant...' },
    //     { role: 'user', content: [
    //       { type: 'text', text: buildPrompt(req.spec) },
    //       ...(req.diffBase64
    //         ? [{ type: 'image_url', image_url: { url: req.diffBase64 } }]
    //         : []),
    //     ]},
    //   ];
    //   const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //     method: 'POST',
    //     headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: 2048 }),
    //   });
    //   const data = await response.json();
    //   return parseOpenAIResponse(data);

    void this.apiKey;
    void req;
    throw new Error('OpenAI provider is not yet implemented.');
  }
}
