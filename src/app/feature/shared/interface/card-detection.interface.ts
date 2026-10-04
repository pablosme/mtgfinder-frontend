import type { CardPoint } from './card-point.interface';

export interface CardDetection {
    detected: boolean;
    reason: 'ready' | 'outline' | 'perspective';
    score: number;
    corners?: CardPoint[];
    areaRatio?: number;
    perspectiveRatio?: number;
    aspectRatio?: number;
    sourceWidth?: number;
    sourceHeight?: number;
}
