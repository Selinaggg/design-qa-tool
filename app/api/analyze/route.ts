import { NextRequest, NextResponse } from 'next/server';
import { getAIProvider, readAIOverrideFromHeaders } from '@/lib/aiProviders';
import type { AnalyzeRequest } from '@/lib/aiProviders';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeRequest;

    if (typeof body.spec !== 'string') {
      return NextResponse.json({ error: 'Invalid request: spec must be a string.' }, { status: 400 });
    }

    const override = readAIOverrideFromHeaders(req.headers);
    const provider = getAIProvider(override);
    const result = await provider.analyze(body);

    return NextResponse.json({ ...result, _provider: provider.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
