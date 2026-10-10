import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { inject, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const manaSymbols = new Set([
    ...Array.from({ length: 21 }, (_, value) => String(value)),
    '100',
    '1000000',
    'w',
    'u',
    'b',
    'r',
    'g',
    'c',
    's',
    'x',
    'y',
    'z',
    'p',
    'wu',
    'wb',
    'ub',
    'ur',
    'br',
    'bg',
    'rw',
    'rg',
    'gw',
    'gu',
    '2w',
    '2u',
    '2b',
    '2r',
    '2g',
    'cw',
    'cu',
    'cb',
    'cr',
    'cg',
    'wp',
    'up',
    'bp',
    'rp',
    'gp',
    'wup',
    'wbp',
    'ubp',
    'urp',
    'brp',
    'bgp',
    'rwp',
    'rgp',
    'gwp',
    'gup',
]);

const manaLabels: Readonly<Record<string, string>> = {
    W: 'mana.white',
    U: 'mana.blue',
    B: 'mana.black',
    R: 'mana.red',
    G: 'mana.green',
    C: 'mana.colorless',
    S: 'mana.snow',
    P: 'mana.life',
};

const specialSymbols: Readonly<Record<string, { classes: string; label: string }>> = {
    T: { classes: 'ms ms-tap', label: 'mana.tap' },
    Q: { classes: 'ms ms-untap', label: 'mana.untap' },
    E: { classes: 'ms ms-energy', label: 'mana.energy' },
    CHAOS: { classes: 'ms ms-chaos', label: 'mana.chaos' },
    '∞': { classes: 'ms ms-infinity ms-cost', label: 'mana.infinite' },
};

export interface DisplayManaToken {
    readonly text: string;
    readonly classes: string;
    readonly labelKey?: string;
    readonly labelParams?: Record<string, unknown>;
    readonly staticLabel?: string;
}

@Component({
    imports: [TranslocoDirective],
    selector: 'app-mana-text',
    templateUrl: './mana-text.html',
    styleUrl: './mana-text.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManaText {
    readonly text = input<string | null | undefined>('');
    readonly tokens = computed<DisplayManaToken[]>(() =>
        (this.text() ?? '')
            .split(/(\{[^{}]+\})/g)
            .filter(Boolean)
            .map((text): DisplayManaToken => {
                if (!text.startsWith('{') || !text.endsWith('}')) {
                    return { text, classes: '' };
                }

                const symbol = text.slice(1, -1).toUpperCase();
                const special = specialSymbols[symbol];
                if (special) {
                    return { text, classes: special.classes, labelKey: special.label };
                }

                const code = symbol.replaceAll('/', '').toLowerCase();
                if (!manaSymbols.has(code)) {
                    return { text, classes: '' };
                }

                if (symbol === 'P') {
                    return {
                        text,
                        classes: `ms ms-${code} ms-cost ms-shadow`,
                        labelKey: 'mana.phyrexian',
                    };
                }

                const parts = symbol.split('/');
                if (parts.length === 1) {
                    const part = parts[0];
                    if (manaLabels[part]) {
                        return {
                            text,
                            classes: `ms ms-${code} ms-cost ms-shadow`,
                            labelKey: manaLabels[part],
                        };
                    }
                    if (/^[XYZ]$/.test(part)) {
                        return {
                            text,
                            classes: `ms ms-${code} ms-cost ms-shadow`,
                            staticLabel: part,
                        };
                    }
                    return {
                        text,
                        classes: `ms ms-${code} ms-cost ms-shadow`,
                        labelKey: 'mana.generic',
                        labelParams: { value: part },
                    };
                }

                return {
                    text,
                    classes: `ms ms-${code} ms-cost ms-shadow`,
                    staticLabel: symbol,
                };
            }),
    );
}
