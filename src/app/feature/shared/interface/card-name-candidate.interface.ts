import type { CardNameRecognition } from './card-name-recognition.interface';
import type { CardTitleImage } from './card-title-image.interface';

export interface CardNameCandidate extends CardNameRecognition {
    readonly source: CardTitleImage['source'];
}
