import type { CameraFocusPoint } from './camera-focus-point.interface';

/** Optional Image Capture extension to the video track constraints. */
export interface CameraFocusConstraints extends MediaTrackConstraintSet {
    focusMode?: ConstrainDOMString;
    pointsOfInterest?: CameraFocusPoint[];
}
