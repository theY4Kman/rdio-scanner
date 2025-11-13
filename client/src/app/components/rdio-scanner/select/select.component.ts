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

import { AfterViewInit, Component, Input, OnDestroy } from '@angular/core';
import {
    RdioScannerAvoidOptions,
    RdioScannerBeepStyle,
    RdioScannerCategory,
    RdioScannerCategoryStatus,
    RdioScannerEvent,
    RdioScannerLivefeedMap,
    RdioScannerLivefeedUnitsMap,
    RdioScannerSystem,
    RdioScannerUnit,
} from '../rdio-scanner';
import { RdioScannerService } from '../rdio-scanner.service';
import { ShortcutInput } from "@egoistdeveloper/ng-keyboard-shortcuts";
import { MatSidenav } from "@angular/material/sidenav";

@Component({
    selector: 'rdio-scanner-select',
    styleUrls: [
        '../common.scss',
        './select.component.scss',
    ],
    templateUrl: './select.component.html',
})
export class RdioScannerSelectComponent implements OnDestroy, AfterViewInit {
    categories: RdioScannerCategory[] | undefined;

    map: RdioScannerLivefeedMap = {};

    systems: RdioScannerSystem[] | undefined;

    tagsToggle: boolean | undefined;

    shortcuts: ShortcutInput[] = [];

    // Unit selection properties
    selectedUnitIndices: number[] = [];
    selectedUnitDetails: Array<[RdioScannerSystem, RdioScannerUnit]> = [];
    availableUnits: Array<[RdioScannerSystem, RdioScannerUnit]> = [];
    filteredUnits: Array<[RdioScannerSystem, RdioScannerUnit]> = [];
    unitFilterText: string = '';
    unitsMap: RdioScannerLivefeedUnitsMap = {};

    private eventSubscription = this.rdioScannerService.event.subscribe((event: RdioScannerEvent) => this.eventHandler(event));

    @Input() panel: MatSidenav | undefined;

    constructor(private rdioScannerService: RdioScannerService) { }

    ngAfterViewInit(): void {
      this.shortcuts.push(
        ...['Escape', 'Backspace'].map((key) => ({
          key,
          label: 'Back',
          description: 'Return to main panel',
          command: () => {
            return this.panel?.close();
          },
        })),
      );
    }

    avoid(options?: RdioScannerAvoidOptions): void {
        if (options?.all == true) {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

        } else if (options?.all == false) {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Deactivate);

        } else if (options?.system !== undefined && options?.talkgroup !== undefined) {
            this.rdioScannerService.beep(this.map[options!.system.id][options!.talkgroup.id].active
                ? RdioScannerBeepStyle.Deactivate
                : RdioScannerBeepStyle.Activate
            );

        } else {
            this.rdioScannerService.beep(options?.status ? RdioScannerBeepStyle.Activate : RdioScannerBeepStyle.Deactivate);
        }

        this.rdioScannerService.avoid(options);
    }

    ngOnDestroy(): void {
        this.eventSubscription.unsubscribe();
    }

    toggle(category: RdioScannerCategory): void {
        if (category.status == RdioScannerCategoryStatus.On)
            this.rdioScannerService.beep(RdioScannerBeepStyle.Deactivate);
        else
            this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

        this.rdioScannerService.toggleCategory(category);
    }

    // Unit selection methods
    filterUnits(): void {
        const filterText = this.unitFilterText.toLowerCase().trim();

        if (!filterText) {
            this.filteredUnits = this.availableUnits;
        } else {
            this.filteredUnits = this.availableUnits.filter(([system, unit]) => {
                return unit.label.toLowerCase().includes(filterText) ||
                       unit.id.toString().includes(filterText);
            });
        }
    }

    getUnitOptionIndex(option: [RdioScannerSystem, RdioScannerUnit]): number {
        return this.availableUnits.findIndex(([sys, unit]) =>
            sys.id === option[0].id && unit.id === option[1].id
        );
    }

    trackByUnitOption(index: number, option: [RdioScannerSystem, RdioScannerUnit]): string {
        return `${option[0].id}-${option[1].id}`;
    }

    private updateSelectedUnitDetails(): void {
        this.selectedUnitDetails = this.selectedUnitIndices
            .map(index => this.availableUnits[index])
            .filter(option => option !== undefined);
    }

    selectUnit(): void {
        // Mat-select handles this automatically via binding
        this.updateSelectedUnitDetails();
    }

    removeUnit(unitIndex: number): void {
        this.selectedUnitIndices = this.selectedUnitIndices.filter(idx => idx !== unitIndex);
        this.updateSelectedUnitDetails();
    }

    selectAllUnits(): void {
        const filteredIndices = this.filteredUnits.map(option => this.getUnitOptionIndex(option));
        const newIndices = Array.from(new Set([...this.selectedUnitIndices, ...filteredIndices]));
        this.selectedUnitIndices = newIndices;
        this.updateSelectedUnitDetails();
    }

    deselectAllUnits(): void {
        const filteredIndices = new Set(this.filteredUnits.map(option => this.getUnitOptionIndex(option)));
        this.selectedUnitIndices = this.selectedUnitIndices.filter(idx => !filteredIndices.has(idx));
        this.updateSelectedUnitDetails();
    }

    clearAllUnits(): void {
        this.selectedUnitIndices = [];
        this.selectedUnitDetails = [];
        this.unitFilterText = '';
        this.filterUnits();
    }

    toggleUnit(unitId: number): void {
        const isActive = this.unitsMap[unitId];
        this.rdioScannerService.beep(isActive ? RdioScannerBeepStyle.Deactivate : RdioScannerBeepStyle.Activate);
        this.rdioScannerService.avoidUnit(unitId);
    }

    clearUnitFilter(): void {
        this.unitFilterText = '';
        this.filterUnits();
    }

    getUnitLed(system: RdioScannerSystem, unit: RdioScannerUnit): string {
        return system.led || 'blue';
    }

    private buildAvailableUnits(): void {
        if (!this.systems) {
            this.availableUnits = [];
            this.filteredUnits = [];
            this.selectedUnitIndices = [];
            this.selectedUnitDetails = [];
            return;
        }

        this.availableUnits = this.systems
            .flatMap((system) =>
                (system.units || []).map((unit) => [system, unit] as [RdioScannerSystem, RdioScannerUnit])
            )
            .sort((a, b) => a[1].label.localeCompare(b[1].label));

        this.filterUnits();
        this.updateSelectedUnitDetails();
    }

    private eventHandler(event: RdioScannerEvent): void {
        if (event.config) {
            this.tagsToggle = event.config.tagsToggle;
            this.systems = event.config.systems;
            this.buildAvailableUnits();
        }
        if (event.categories) this.categories = event.categories;
        if (event.map) this.map = event.map;
        if (event.unitsMap) this.unitsMap = event.unitsMap;
    }
}
