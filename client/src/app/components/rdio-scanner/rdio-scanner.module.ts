/*
 * *****************************************************************************
 * Copyright (C) 2019-2022 Chrystian Huot <chrystian.huot@saubeo.solutions>
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
import { AppSharedModule } from '../../shared/shared.module';
import { RdioScannerComponent } from './rdio-scanner.component';
import { RdioScannerService } from './rdio-scanner.service';
import { RdioScannerMainComponent } from './main/main.component';
import { RdioScannerSearchComponent } from './search/search.component';
import { RdioScannerSelectComponent } from './select/select.component';
import { KeyboardShortcutsModule } from '@egoistdeveloper/ng-keyboard-shortcuts';
import { DurationModule } from "../../duration.module";
import { RdioScannerAdminModule } from './admin';
import { A11yModule } from '@angular/cdk/a11y';
import { CallSourceComponent } from './labeler/call-source/call-source.component';
import { LabelerComponent } from './labeler/labeler.component';
import { UnitLabelHistoryDialogComponent } from './labeler/unit-label-history-dialog/unit-label-history-dialog.component';

@NgModule({
    declarations: [
        RdioScannerComponent,
        RdioScannerMainComponent,
        RdioScannerSearchComponent,
        RdioScannerSelectComponent,
        CallSourceComponent,
        LabelerComponent,
        UnitLabelHistoryDialogComponent,
    ],
    exports: [RdioScannerComponent],
    imports: [
        AppSharedModule,
        KeyboardShortcutsModule.forRoot(),
        DurationModule,
        RdioScannerAdminModule,
        A11yModule,
    ],
    providers: [
        RdioScannerService,
        {provide: OverlayContainer, useClass: FullscreenOverlayContainer},
    ],
})
export class RdioScannerModule {
}
