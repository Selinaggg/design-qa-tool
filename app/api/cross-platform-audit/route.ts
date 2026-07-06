import { NextRequest, NextResponse } from 'next/server';
import { getCrossPlatformAnalyzer } from '@/lib/crossPlatform';
import type { CrossPlatformAuditRequest } from '@/lib/crossPlatform';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CrossPlatformAuditRequest;

    if (!body.iosImageUrl || !body.androidImageUrl) {
      return NextResponse.json(
        { error: 'iosImageUrl and androidImageUrl are required.' },
        { status: 400 },
      );
    }
    if (!body.iosDevice || !body.androidDevice) {
      return NextResponse.json(
        { error: 'iosDevice and androidDevice profiles are required.' },
        { status: 400 },
      );
    }

    const analyzer = getCrossPlatformAnalyzer();
    const result = await analyzer.analyze(body);

    return NextResponse.json({ ...result, _analyzer: analyzer.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cross-platform audit failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
