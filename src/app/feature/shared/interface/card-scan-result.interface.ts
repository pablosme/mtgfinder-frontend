export interface CardScanResult {
    readonly name: string;
    /** Perspective-corrected color image, encoded as a PNG data URL. */
    readonly normalizedImage: string;
    readonly width: number;
    readonly height: number;
    readonly language: string;
    /** Unedited OCR output from the title region, not the rules text. */
    readonly rawText: string;
    /** Original OCR confidence from 0–100; null when OCR did not run or failed. */
    readonly confidence: number | null;
}
