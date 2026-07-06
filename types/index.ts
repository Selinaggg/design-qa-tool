export interface ImageFile {
  file: File;
  url: string;
  width: number;
  height: number;
}

export type ComparisonMode = 'side-by-side' | 'slider' | 'diff';

export type IssueSeverity = 'Critical' | 'Major' | 'Minor';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  impact: string;
  suggestion: string;
}

export interface AnalysisResult {
  issues: Issue[];
  summary: string;
}

/**
 * Alignment strategies for future versions.
 * 'none' is the MVP behavior: require identical dimensions.
 */
export type AlignmentStrategy =
  | 'none'            // MVP: require identical dimensions, show error otherwise
  | 'scale-to-design' // v2: scale live image to match design width proportionally
  | 'crop-top'        // v2: crop both to the smaller dimension, aligned from top-left
  | 'smart';          // v3: AI-assisted feature detection for alignment

export interface ImageProcessingOptions {
  alignment: AlignmentStrategy;
}
