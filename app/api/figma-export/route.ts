import { NextRequest, NextResponse } from 'next/server';
import { getFigmaProvider } from '@/lib/figmaProviders';
import type { FigmaExportRequest } from '@/lib/figmaProviders';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FigmaExportRequest;

    if (!body.figmaUrl || typeof body.figmaUrl !== 'string') {
      return NextResponse.json({ error: 'figmaUrl is required.' }, { status: 400 });
    }

    const provider = getFigmaProvider();
    const result = await provider.export(body);

    return NextResponse.json({ ...result, _provider: provider.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Figma export failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
