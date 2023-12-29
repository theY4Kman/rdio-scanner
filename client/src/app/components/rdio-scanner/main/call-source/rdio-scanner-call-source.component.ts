import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { RdioScannerCall, RdioScannerCallSource } from '../../rdio-scanner';
import { RdioScannerAdminService } from '../../admin/admin.service';
import { FormBuilder } from '@angular/forms';

@Component({
    selector: 'rdio-scanner-call-source',
    templateUrl: './rdio-scanner-call-source.component.html',
    styleUrls: ['./rdio-scanner-call-source.component.scss']
})
export class RdioScannerCallSourceComponent {
    @Input() call: RdioScannerCall | undefined;
    @Input() source: RdioScannerCallSource | undefined;
    @Input() disableEditForm = false;
    @Input() hexFormat: boolean | 'uppercase' | 'lowercase' = true;

    @Output() edit = new EventEmitter<{ system: number, source: RdioScannerCallSource }>();

    isConfiguringUnitLabel = false;
    didClickDelete = false;
    isDeleting = false;
    unitLabelForm = this.ngFormBuilder.group({ label: [] });

    constructor(
        private adminService: RdioScannerAdminService,
        private ngFormBuilder: FormBuilder,
    ) {}

    get isLabelClickable(): boolean {
        return !this.disableEditForm || this.edit.observed;
    }

    get isAdminAuthenticated(): boolean {
        return this.adminService.authenticated;
    }

    onLabelClick(): void {
        if (!this.call || !this.source) {
            return;
        }

        this.edit.emit({ system: this.call.system, source: this.source });

        if (!this.disableEditForm) {
            this.showUnitLabelConfigurationForm();
        }
    }

    showUnitLabelConfigurationForm(): void {
        this.isConfiguringUnitLabel = true;
        this.didClickDelete = false;
        this.isDeleting = false;
        this.unitLabelForm.get('label')?.setValue(this.source?.label ?? '');
    }

    async onDeleteClick(): Promise<boolean> {
        if (!this.didClickDelete) {
            this.didClickDelete = true;
            return false;
        }

        this.isDeleting = true;
        try {
            const didDelete = await this.deleteUnitLabel();
            this.isConfiguringUnitLabel = !didDelete;
            return didDelete;
        } finally {
            this.isDeleting = false;
        }
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

    async submitUnitLabelConfiguration(): Promise<boolean> {
        if (this.unitLabelForm.invalid) {
            return false;
        }

        const label = this.unitLabelForm.get('label')?.value;

        if (typeof label !== 'string' || label === '' || label === this.source?.label) {
            return true;
        }

        const config = await this.adminService.getConfig();

        const system = config.systems?.find((s) => s.id === this.call?.system);
        if (!system) {
            return true;
        }

        const unitId = this.source?.src;
        const unit = system.units?.find((u) => u.id === unitId);

        if (unit) {
            unit.label = label;
        } else {
            if (!system.units) {
                system.units = [];
            }
            system.units.push({ id: unitId, label, order: system.units.length });
        }

        await this.adminService.saveConfig(config);

        return true;
    }

    async deleteUnitLabel(): Promise<boolean> {
        const config = await this.adminService.getConfig();

        const system = config.systems?.find((s) => s.id === this.call?.system);
        if (!system || !system.units) {
            return false;
        }

        const unitId = this.source?.src;
        system.units = system.units.filter((u) => u.id !== unitId);

        await this.adminService.saveConfig(config);

        return true;
    }
}
