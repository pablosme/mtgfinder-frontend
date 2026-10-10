import { TranslocoDirective } from '@jsverse/transloco';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-footer',
    imports: [TranslocoDirective, RouterLink],
    templateUrl: './footer.html',
    styleUrl: './footer.scss',
})
export class Footer {}
