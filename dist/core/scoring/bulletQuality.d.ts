import type { ResumeBullet } from "../resume/types.js";
export type BulletScoreDimension = "action" | "scope" | "tools" | "impact" | "ownership";
export interface BulletDimensionScore {
    dim: BulletScoreDimension;
    score: number;
    notes: string[];
}
export interface BulletQualityScore {
    bulletId: string;
    total: number;
    dimensions: BulletDimensionScore[];
}
export declare function scoreBulletQuality(bullet: ResumeBullet): BulletQualityScore;
export declare function scoreAllBulletsQuality(bullets: ResumeBullet[]): BulletQualityScore[];
//# sourceMappingURL=bulletQuality.d.ts.map