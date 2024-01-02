import { Injectable } from '@angular/core';
import { RdioScannerAdminService } from '../admin/admin.service';
import { BehaviorSubject } from 'rxjs';
import { RdioScannerCall, RdioScannerCallSource } from '../rdio-scanner';

@Injectable({
    providedIn: 'root'
})
export class LabelerService {
    constructor(
        private adminService: RdioScannerAdminService,
    ) {}

    get isAdminAuthenticated(): boolean {
        return this.adminService.authenticated;
    }

    private readonly _unitLabelCall = new BehaviorSubject<RdioScannerCall | undefined>(undefined);
    readonly unitLabelCall$ = this._unitLabelCall.asObservable();
    get unitLabelCall(): RdioScannerCall | undefined { return this._unitLabelCall.value; }
    private set unitLabelCall(value: RdioScannerCall | undefined) { this._unitLabelCall.next(value); }

    private readonly _unitLabelSource = new BehaviorSubject<RdioScannerCallSource | undefined>(undefined);
    readonly unitLabelSource$ = this._unitLabelSource.asObservable();
    get unitLabelSource(): RdioScannerCallSource | undefined { return this._unitLabelSource.value; }
    private set unitLabelSource(value: RdioScannerCallSource | undefined) { this._unitLabelSource.next(value); }

    beginUnitLabelConfiguration(call: RdioScannerCall, source: RdioScannerCallSource): void {
        this.unitLabelCall = call;
        this.unitLabelSource = source;
    }

    async completeUnitLabelConfiguration(label: string): Promise<boolean> {
        return await this._completeUnitLabelConfiguration(label);
    }

    async deleteUnitLabel(): Promise<boolean> {
        return await this._completeUnitLabelConfiguration(undefined);
    }

    async _completeUnitLabelConfiguration(label: string | undefined): Promise<boolean> {
        if (!this.unitLabelCall || !this.unitLabelSource) {
            return false;
        }

        const unitId = this.unitLabelSource.src;
        if (unitId == null) {
            return false;
        }

        const success =
            label != null
                ? await this.adminService.setUnitLabel(this.unitLabelCall.system, unitId, label)
                : await this.adminService.deleteUnitLabel(this.unitLabelCall.system, unitId);

        if (success) {
            this.cancelUnitLabelConfiguration();
        }

        return success;
    }

    cancelUnitLabelConfiguration(): void {
        this.unitLabelCall = undefined;
        this.unitLabelSource = undefined;
    }

    formatSrcId(src: number | undefined, hexFormat: boolean | 'uppercase' | 'lowercase' = true): string {
        if (src == null) {
            return '';
        }

        if (hexFormat) {
            let formattedSourceId = src.toString(16);
            if (formattedSourceId.length % 2) {
                formattedSourceId = '0' + formattedSourceId;
            }
            if (hexFormat !== 'lowercase') {
                formattedSourceId = formattedSourceId.toUpperCase();
            }
            return formattedSourceId;
        } else {
            return src.toString();
        }
    }
}
