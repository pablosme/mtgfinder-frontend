/** Image Capture capabilities not yet included in TypeScript's DOM types. */
export interface CameraFocusCapabilities extends MediaTrackCapabilities {
    focusMode?: string[];
}
