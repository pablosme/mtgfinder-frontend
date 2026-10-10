import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SEARCH_SYNTAX_COMMANDS } from './search-syntax-commands';

@Component({
    selector: 'app-search-syntax',
    imports: [RouterLink],
    templateUrl: './search-syntax.html',
    styleUrl: './search-syntax.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchSyntax {
    readonly commands = SEARCH_SYNTAX_COMMANDS;
}
