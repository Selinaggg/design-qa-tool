export interface FigmaExportRequest {
  figmaUrl: string;
}

export interface FigmaExportResult {
  imageUrl: string; // data URL or absolute URL served by the app
  width: number;
  height: number;
  fileName: string;
  isMock: boolean;
}

export interface FigmaProvider {
  readonly name: string;
  export(req: FigmaExportRequest): Promise<FigmaExportResult>;
}
