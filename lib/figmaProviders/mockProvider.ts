import type {
  FigmaProvider,
  FigmaExportRequest,
  FigmaExportResult,
  ListFramesRequest,
  ListFramesResult,
  FigmaFrameSummary,
} from './types';

export class MockFigmaProvider implements FigmaProvider {
  readonly name = 'mock';

  async export(_req: FigmaExportRequest): Promise<FigmaExportResult> {
    await new Promise((r) => setTimeout(r, 800)); // simulate latency
    return {
      imageUrl: '/fixtures/mock-design.svg',
      width: 1440,
      height: 900,
      fileName: 'mock-design.svg',
      isMock: true,
    };
  }

  /**
   * 返回一批假 frames，用于开发 UI 时不依赖真实 API。
   * 命名有意贴合常见截图名（home / detail / cart …），配合 fuzzy 匹配演示效果
   */
  async listFrames(_req: ListFramesRequest): Promise<ListFramesResult> {
    await new Promise((r) => setTimeout(r, 600));
    const frames: FigmaFrameSummary[] = [
      { nodeId: '1:2', name: 'Home', pageName: '主流程', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
      { nodeId: '1:3', name: 'Search', pageName: '主流程', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
      { nodeId: '1:4', name: 'Product Detail', pageName: '主流程', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
      { nodeId: '1:5', name: 'Cart', pageName: '交易流程', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
      { nodeId: '1:6', name: 'Checkout', pageName: '交易流程', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
      { nodeId: '1:7', name: 'Order Confirm', pageName: '交易流程', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
      { nodeId: '1:8', name: 'Profile', pageName: '个人中心', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
      { nodeId: '1:9', name: 'Settings', pageName: '个人中心', thumbnailUrl: '/fixtures/mock-design.svg', width: 375, height: 812 },
    ];
    return {
      fileKey: 'MOCK_FILE_KEY',
      fileName: 'Mock Design Library',
      frames,
      isMock: true,
    };
  }
}
