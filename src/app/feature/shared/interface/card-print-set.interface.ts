import type { CardPrint } from './card-search.interface';

/** Print availability for one set within the currently loaded card. */
export interface CardPrintSet {
    key: string;
    id: string | null;
    code: string;
    name: string;
    image: string | null;
    languages: string[];
    prints: CardPrint[];
}
