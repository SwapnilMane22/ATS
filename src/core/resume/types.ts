export type SectionPath = string[];

export interface ResumeBullet {
  bulletId: string;
  /** Plain normalized text for scoring and display */
  text: string;
  /** Raw LaTeX content after \item (with LaTeX escapes: \$, \%, etc.) for LLM rewriting */
  rawLatex?: string;
  sectionPath: SectionPath;
  meta?: {
    jobTitle?: string;
    company?: string;
    startDate?: string;
    endDate?: string;
  };
}

export interface ResumeSection {
  title: string;
  path: SectionPath;
}

export interface ResumeDocument {
  source: "latex";
  sections: ResumeSection[];
  bullets: ResumeBullet[];
  rawText: string;
}

export interface EvidenceItem {
  bulletId: string;
  sectionPath: SectionPath;
}

