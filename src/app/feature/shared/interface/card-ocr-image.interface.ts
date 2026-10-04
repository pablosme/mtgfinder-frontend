export interface CardOcrImage {
    image: HTMLCanvasElement;
    variant: 'gray' | 'normalized' | 'otsu' | 'adaptive' | 'inverted-otsu' | 'inverted-adaptive';
}
