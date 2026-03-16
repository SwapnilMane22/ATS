export type SectionPath = string[];
export interface ResumeBullet {
    bulletId: string;
    text: string;
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
//# sourceMappingURL=types.d.ts.map