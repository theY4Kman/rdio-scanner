import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UnitLabelHistoryEntry } from '../../admin/admin.service';

export interface UnitLabelHistoryDialogData {
    systemId: number;
    unitId: number;
    history: UnitLabelHistoryEntry[];
    formatSrcId: (src: number | undefined, hexFormat?: boolean | 'uppercase' | 'lowercase') => string;
}

@Component({
    selector: 'rdio-scanner-unit-label-history-dialog',
    templateUrl: './unit-label-history-dialog.component.html',
    styleUrls: ['./unit-label-history-dialog.component.scss']
})
export class UnitLabelHistoryDialogComponent {
    constructor(
        public dialogRef: MatDialogRef<UnitLabelHistoryDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: UnitLabelHistoryDialogData,
    ) {}

    close(): void {
        this.dialogRef.close();
    }

    get formattedUnitId(): string {
        return this.data.formatSrcId(this.data.unitId);
    }
}
