import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RdioScannerCall, RdioScannerCallSource } from '../../rdio-scanner';
import { LabelerService } from '../labeler.service';

@Component({
    selector: 'rdio-scanner-call-source',
    templateUrl: './call-source.component.html',
    styleUrls: ['./call-source.component.scss']
})
export class CallSourceComponent {
    @Input() call: RdioScannerCall | undefined;
    @Input() source: RdioScannerCallSource | undefined;
    @Input() disableEditForm = false;
    @Input() hexFormat: boolean | 'uppercase' | 'lowercase' = true;

    @Output() edit = new EventEmitter<{ system: number, source: RdioScannerCallSource }>();

    constructor(
        private labeler: LabelerService,
    ) {}

    get isLabelClickable(): boolean {
        return !this.disableEditForm || this.edit.observed;
    }

    onLabelClick(): void {
        if (!this.call || !this.source) {
            return;
        }

        this.edit.emit({ system: this.call.system, source: this.source });

        if (!this.disableEditForm) {
            this.labeler.beginUnitLabelConfiguration(this.call, this.source);
        }
    }

    formatSrcId(src: number): string {
        return this.labeler.formatSrcId(src, this.hexFormat);
    }
}
