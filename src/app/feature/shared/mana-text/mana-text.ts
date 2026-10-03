import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

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
    W: 'white',
    U: 'blue',
    B: 'black',
    R: 'red',
    G: 'green',
    C: 'colorless',
    S: 'snow',
    P: '2 life',
    X: 'X',
    Y: 'Y',
    Z: 'Z',
};
const specialSymbols: Readonly<Record<string, { classes: string; label: string }>> = {
    T: { classes: 'ms ms-tap', label: 'Tap' },
    Q: { classes: 'ms ms-untap', label: 'Untap' },
    E: { classes: 'ms ms-energy', label: 'Energy' },
    CHAOS: { classes: 'ms ms-chaos', label: 'Chaos' },
    '∞': { classes: 'ms ms-infinity ms-cost', label: 'Infinite mana' },
};

@Component({
    selector: 'app-mana-text',
    templateUrl: './mana-text.html',
    styleUrl: './mana-text.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManaText {
    readonly text = input<string | null | undefined>('');
    readonly tokens = computed(() =>
        (this.text() ?? '')
            .split(/(\{[^{}]+\})/g)
            .filter(Boolean)
            .map((text) => {
                if (!text.startsWith('{') || !text.endsWith('}')) {
                    return { text, classes: '', label: '' };
                }

                const symbol = text.slice(1, -1).toUpperCase();
                const special = specialSymbols[symbol];
                if (special) return { text, ...special };

                const code = symbol.replaceAll('/', '').toLowerCase();
                if (!manaSymbols.has(code)) return { text, classes: '', label: '' };

                const label =
                    symbol === 'P'
                        ? 'Phyrexian mana'
                        : symbol
                              .split('/')
                              .map((part) => manaLabels[part] ?? `${part} generic mana`)
                              .join(' or ');
                return { text, classes: `ms ms-${code} ms-cost ms-shadow`, label };
            }),
    );
}
