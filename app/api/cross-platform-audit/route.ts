import { NextRequest, NextResponse } from 'next/server';
import { getCrossPlatformAnalyzer } from '@/lib/crossPlatform';
import type { CrossPlatformAuditRequest } from '@/lib/crossPlatform';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CrossPlatformAuditRequest;

    const hasIos = !!body.iosImageUrl;
    const hasAndroid = !!body.androidImageUrl;
    const hasDesign = !!body.designImageUrl;

    // 至少一端截图
    if (!hasIos && !hasAndroid) {
      return NextResponse.json(
        { error: 'At least one of iosImageUrl / androidImageUrl is required.' },
        { status: 400 },
      );
    }
    // 单端必须搭配设计稿（否则跨端走查无对比对象）
    if ((!hasIos || !hasAndroid) && !hasDesign) {
      return NextResponse.json(
        {
          error:
            'Single-platform audit requires designImageUrl as a reference baseline.',
        },
        { status: 400 },
      );
    }
    // 对应端截图必须有对应端设备配置
    if (hasIos && !body.iosDevice) {
      return NextResponse.json(
        { error: 'iosDevice profile is required when iosImageUrl is provided.' },
        { status: 400 },
      );
    }
    if (hasAndroid && !body.androidDevice) {
      return NextResponse.json(
        {
          error:
            'androidDevice profile is required when androidImageUrl is provided.',
        },
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
