export interface CardTitleImage {
    readonly image: HTMLCanvasElement;
    readonly source?: 'detected' | 'fallback';
    readonly variant?:
        'gray' | 'normalized' | 'otsu' | 'adaptive' | 'inverted-otsu' | 'inverted-adaptive';
}
