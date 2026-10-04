export interface CardNameRecognition {
    readonly name: string;
    readonly rawText: string;
    readonly confidence: number;
    readonly requiresReview: boolean;
}
