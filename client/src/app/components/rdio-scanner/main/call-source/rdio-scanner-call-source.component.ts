import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { RdioScannerCall, RdioScannerCallSource } from '../../rdio-scanner';

@Component({
    selector: 'rdio-scanner-call-source',
    templateUrl: './rdio-scanner-call-source.component.html',
    styleUrls: ['./rdio-scanner-call-source.component.scss']
})
export class RdioScannerCallSourceComponent {
    @Input() call: RdioScannerCall | undefined;
    @Input() source: RdioScannerCallSource | undefined;
    @Input() hexFormat: boolean | 'uppercase' | 'lowercase' = true;

    @Output() edit = new EventEmitter<{ system: number, source: RdioScannerCallSource }>();

    onLabelClick(): void {
        if (!this.call || !this.source) {
            return;
        }

        this.edit.emit({ system: this.call.system, source: this.source });
    }

    formatSrcId(src: number): string {
        if (this.hexFormat) {
            let formattedSourceId = src.toString(16);
            if (formattedSourceId.length % 2) {
                formattedSourceId = '0' + formattedSourceId;
            }
            if (this.hexFormat !== 'lowercase') {
                formattedSourceId = formattedSourceId.toUpperCase();
            }
            return formattedSourceId;
        } else {
            return src.toString();
        }
    }
}
