/** The original frame and rectified card always belong to the same exposure. */
export interface CardCapture {
    frame: HTMLCanvasElement;
    card: HTMLCanvasElement;
    sharpness: number;
}
