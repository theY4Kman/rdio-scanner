import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { LabelerService } from './labeler.service';
import { FormBuilder } from '@angular/forms';
import { combineLatest, map, Observable, Subscription } from 'rxjs';

@Component({
    selector: 'rdio-scanner-labeler',
    templateUrl: './labeler.component.html',
    styleUrls: ['./labeler.component.scss']
})
export class LabelerComponent implements OnInit, OnDestroy {
    private readonly subscriptions: Subscription[] = [];

    unitLabelForm = this.ngFormBuilder.group({ label: [] });
    didClickDelete = false;

    isLoading = false;

    constructor(
        public labeler: LabelerService,
        private ngFormBuilder: FormBuilder,
        private ngChangeDetectorRef: ChangeDetectorRef,
    ) {
    }

    ngOnInit(): void {
        this.subscriptions.push(
            this.isConfiguringUnitLabel.subscribe((isConfiguringUnitLabel) => {
                this.ngChangeDetectorRef.detectChanges();

                if (isConfiguringUnitLabel) {
                    this.unitLabelForm.get('label')?.setValue(this.labeler.unitLabelSource?.label ?? '');
                }
            })
        );
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(subscription => subscription.unsubscribe());
    }

    get isConfiguringUnitLabel(): Observable<boolean> {
        return combineLatest([this.labeler.unitLabelCall$, this.labeler.unitLabelSource$])
            .pipe(map(([call, source]) => call != null && source != null));
    }

    get isAdminAuthenticated(): boolean {
        return this.labeler.isAdminAuthenticated;
    }

    get unitLabelPlaceholder$(): Observable<string> {
        return this.labeler.unitLabelSource$.pipe(map(source => `Unit label: ${this.labeler.formatSrcId(source?.src)}`));
    }

    async submitUnitLabelConfiguration(): Promise<void> {
        const label = this.unitLabelForm.get('label')?.value;
        if (label == null || label === '' || label === this.labeler.unitLabelSource?.label) {
            this.labeler.cancelUnitLabelConfiguration();
            return;
        }

        await this.performOperation(async () => {
            return await this.labeler.completeUnitLabelConfiguration(label);
        });
    }

    async onDeleteClick(): Promise<boolean> {
        if (!this.didClickDelete) {
            this.didClickDelete = true;
            return false;
        }

        return await this.performOperation(async () => {
            return await this.labeler.deleteUnitLabel();
        });
    }

    private async performOperation(fn: () => Promise<boolean>): Promise<boolean> {
        this.isLoading = true;
        try {
            return await fn();
        } finally {
            this.isLoading = false;
            this.resetForms();
        }
    }

    private resetForms(): void {
        this.unitLabelForm.reset();
        this.didClickDelete = false;
    }
}
