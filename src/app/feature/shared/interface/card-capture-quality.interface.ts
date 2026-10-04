export interface CardCaptureQuality {
    usable: boolean;
    reason: 'ready' | 'focus';
    sharpness: number;
}
