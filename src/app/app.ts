import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './feature/footer/footer';
import { Header } from './feature/header/header';

@Component({
    selector: 'app-root',
    imports: [Footer, Header, RouterOutlet],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App {}
