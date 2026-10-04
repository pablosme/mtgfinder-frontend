import type { CameraFocusPoint } from './camera-focus-point.interface';

export interface CameraFocusSettings extends MediaTrackSettings {
    focusMode?: string;
    pointsOfInterest?: CameraFocusPoint[];
}
