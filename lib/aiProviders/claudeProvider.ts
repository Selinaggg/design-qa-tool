import type { AIProvider, AnalyzeRequest } from './types';
import type { AnalysisResult } from '@/types';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(req: AnalyzeRequest): Promise<AnalysisResult> {
    // TODO: implement Claude Vision API
    //
    // Suggested implementation:
    //   const content = [
    //     { type: 'text', text: buildPrompt(req.spec) },
    //     ...(req.diffBase64
    //       ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: req.diffBase64.split(',')[1] } }]
    //       : []),
    //   ];
    //   const response = await fetch('https://api.anthropic.com/v1/messages', {
    //     method: 'POST',
    //     headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    //     body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2048, messages: [{ role: 'user', content }] }),
    //   });
    //   const data = await response.json();
    //   return parseClaudeResponse(data);

    void this.apiKey;
    void req;
    throw new Error('Claude provider is not yet implemented.');
  }
}
