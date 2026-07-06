import { NextRequest, NextResponse } from 'next/server';
import { getScreenshotProvider } from '@/lib/screenshotProviders';
import type { ScreenshotRequest } from '@/lib/screenshotProviders';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ScreenshotRequest;

    if (!body.pageUrl || typeof body.pageUrl !== 'string') {
      return NextResponse.json({ error: 'pageUrl is required.' }, { status: 400 });
    }

    const provider = getScreenshotProvider();
    const result = await provider.capture(body);

    return NextResponse.json({ ...result, _provider: provider.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Screenshot capture failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
