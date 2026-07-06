export interface ScreenshotRequest {
  pageUrl: string;
}

export interface ScreenshotResult {
  imageUrl: string; // data URL or absolute URL served by the app
  width: number;
  height: number;
  capturedAt: string; // ISO 8601
  isMock: boolean;
}

export interface ScreenshotProvider {
  readonly name: string;
  capture(req: ScreenshotRequest): Promise<ScreenshotResult>;
}
