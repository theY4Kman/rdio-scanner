/*
 * *****************************************************************************
 * Copyright (C) 2019-2020 Chrystian Huot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 * ****************************************************************************
 */

import { FullscreenOverlayContainer, OverlayContainer } from '@angular/cdk/overlay';
import { NgModule } from '@angular/core';
import { KeyboardShortcutsModule } from 'ng-keyboard-shortcuts';
import { AppSharedModule } from '../../shared/shared.module';
import { AppRdioScannerComponent } from './rdio-scanner.component';
import { AppRdioScannerService } from './rdio-scanner.service';
import { AppRdioScannerMainComponent } from './main/main.component';
import { AppRdioScannerSearchComponent } from './search/search.component';
import { AppRdioScannerSelectComponent } from './select/select.component';

@NgModule({
    declarations: [
        AppRdioScannerComponent,
        AppRdioScannerMainComponent,
        AppRdioScannerSearchComponent,
        AppRdioScannerSelectComponent,
    ],
    exports: [AppRdioScannerComponent],
    imports: [
        KeyboardShortcutsModule.forRoot(),
        AppSharedModule,
    ],
    providers: [
        AppRdioScannerService,
        { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
    ],
})
export class AppRdioScannerModule { }
