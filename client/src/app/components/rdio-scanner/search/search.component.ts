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

import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSelect } from '@angular/material/select';
import { BehaviorSubject } from 'rxjs';
import {
    RdioScannerCall,
    RdioScannerConfig,
    RdioScannerEvent,
    RdioScannerLivefeedMode,
    RdioScannerPlaybackList,
    RdioScannerSearchOptions,
    RdioScannerSystem,
    RdioScannerTalkgroup,
    RdioScannerUnit,
} from '../rdio-scanner';
import { RdioScannerService } from '../rdio-scanner.service';
import { ShortcutInput } from "@egoistdeveloper/ng-keyboard-shortcuts";
import { MatSidenav } from "@angular/material/sidenav";
import { LabelerService } from '../labeler/labeler.service';

@Component({
    selector: 'rdio-scanner-search',
    styleUrls: ['./search.component.scss'],
    templateUrl: './search.component.html',
})
export class RdioScannerSearchComponent implements OnDestroy, AfterViewInit {
    call: RdioScannerCall | undefined;
    callPending: number | undefined;

    form = this.ngFormBuilder.group({
        date: [null],
        group: [-1],
        sort: [-1],
        system: [-1],
        tag: [-1],
        talkgroup: [-1],
        units: [[]],
        unitsMode: ['any'],
    });

    livefeedOnline = false;
    livefeedPlayback = false;

    playbackList: RdioScannerPlaybackList | undefined;

    optionsGroup: string[] = [];
    optionsSystem: string[] = [];
    optionsTag: string[] = [];
    optionsTalkgroup: [RdioScannerSystem, string][] = [];
    optionsUnit: [RdioScannerSystem, RdioScannerUnit][] = [];
    optionsUnitFiltered: [RdioScannerSystem, RdioScannerUnit][] = [];
    unitsFilterText = '';

    paused = false;

    results = new BehaviorSubject(new Array<RdioScannerCall | null>(10));
    resultsPending = false;

    shortcuts: ShortcutInput[] = [];

    time12h = false;

    private config: RdioScannerConfig | undefined;

    private eventSubscription = this.rdioScannerService.event.subscribe((event: RdioScannerEvent) => this.eventHandler(event));

    private searchForUnitSubscription = this.labelerService.searchForUnit$.subscribe((event) => this.handleSearchForUnit(event));

    private limit = 200;

    private offset = 0;

    @Input() panel: MatSidenav | undefined;

    @ViewChild(MatPaginator, { read: MatPaginator }) private paginator: MatPaginator | undefined;
    @ViewChild('unitsSelect', { read: MatSelect }) private unitsSelect: MatSelect | undefined;
    @ViewChild('unitsFilterInput', { read: ElementRef }) private unitsFilterInput: ElementRef<HTMLInputElement> | undefined;

    constructor(
        private rdioScannerService: RdioScannerService,
        private ngChangeDetectorRef: ChangeDetectorRef,
        private ngFormBuilder: FormBuilder,
        private labelerService: LabelerService,
    ) { }

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

    download(id: number): void {
        this.rdioScannerService.loadAndDownload(id);
    }

    formChangeHandler(): void {
        if (this.livefeedPlayback) {
            this.rdioScannerService.stopPlaybackMode();
        }

        this.paginator?.firstPage();

        this.refreshFilters();

        this.searchCalls();
    }

    ngOnDestroy(): void {
        this.eventSubscription.unsubscribe();
        this.searchForUnitSubscription.unsubscribe();
    }

    play(id: number): void {
        this.rdioScannerService.loadAndPlay(id);
    }

    refreshFilters(): void {
        if (!this.config) {
            return;
        }

        const selectedGroup = this.getSelectedGroup();
        const selectedSystem = this.getSelectedSystem();
        const selectedSystems = selectedSystem ? [selectedSystem] : this.config.systems ?? [];
        const selectedTag = this.getSelectedTag();
        const [selectedTalkgroupSystem, selectedTalkgroup] = this.getSelectedTalkgroup();
        const selectedUnits = this.getSelectedUnits();

        this.optionsSystem = this.config.systems
            .filter((system) => {
                const group = selectedGroup === undefined ||
                    system.talkgroups.some((talkgroup) => talkgroup.group === selectedGroup);
                const tag = selectedTag === undefined ||
                    system.talkgroups.some((talkgroup) => talkgroup.tag === selectedTag);
                return group && tag;
            })
            .map((system) => system.label);

        this.optionsTalkgroup = selectedSystems
            .flatMap((sys) =>
                sys.talkgroups.map((talkgroup) => [sys, talkgroup] as [RdioScannerSystem, RdioScannerTalkgroup])
            )
            .filter(([_system, talkgroup]) => {
                const group = selectedGroup == undefined ||
                    talkgroup.group === selectedGroup;
                const tag = selectedTag == undefined ||
                    talkgroup.tag === selectedTag;
                return group && tag;
            })
            .map(([system, talkgroup]) => [system, talkgroup.label]);

        this.optionsGroup = Object.keys(this.config.groups)
            .filter((group) => {
                const system: boolean = selectedSystem === undefined ||
                    selectedSystem.talkgroups.some((talkgroup) => talkgroup.group === group)
                const talkgroup: boolean = selectedTalkgroup === undefined ||
                    selectedTalkgroup.group === group;
                const tag: boolean = selectedTag === undefined ||
                    (selectedTalkgroup !== undefined && selectedTalkgroup.tag === selectedTag) ||
                    (this.config !== undefined && this.config.systems
                        .flatMap((system) => system.talkgroups)
                        .some((talkgroup) => talkgroup.group === group && talkgroup.tag === selectedTag))
                return system && talkgroup && tag;
            })
            .sort((a, b) => a.localeCompare(b))

        this.optionsTag = Object.keys(this.config.tags)
            .filter((tag) => {
                const system: boolean = selectedSystem === undefined ||
                    selectedSystem.talkgroups.some((talkgroup) => talkgroup.tag === tag)
                const talkgroup: boolean = selectedTalkgroup === undefined ||
                    selectedTalkgroup.tag === tag;
                const group: boolean = selectedGroup === undefined ||
                    (selectedTalkgroup !== undefined && selectedTalkgroup.group === selectedGroup) ||
                    (this.config !== undefined && this.config.systems
                        .flatMap((system) => system.talkgroups)
                        .some((talkgroup) => talkgroup.tag === tag && talkgroup.group === selectedGroup))
                return system && talkgroup && group;
            })
            .sort((a, b) => a.localeCompare(b))

        // Filter units based on selected system and sort by label
        this.optionsUnit = selectedSystems
            .flatMap((sys) =>
                (sys.units || []).map((unit) => [sys, unit] as [RdioScannerSystem, RdioScannerUnit])
            )
            .sort((a, b) => a[1].label.localeCompare(b[1].label));

        // Apply text filter
        this.filterUnits();

        this.form.patchValue({
            group: selectedGroup
                ? this.optionsGroup.findIndex((group) => group === selectedGroup)
                : -1,
            system: selectedSystem
                ? this.optionsSystem.findIndex((system) => system === selectedSystem.label)
                : -1,
            tag: selectedTag
                ? this.optionsTag.findIndex((tag) => tag === selectedTag)
                : -1,
            talkgroup: selectedTalkgroup
                ? this.optionsTalkgroup.findIndex(([system, talkgroup]) => (
                    talkgroup === selectedTalkgroup.label && selectedSystems.find((sys) => sys.id === system.id)
                ))
                : -1,
            units: selectedUnits
                .map((unit) => this.optionsUnit.findIndex(([sys, u]) => u.id === unit.id))
                .filter((index) => index !== -1),
        });
    }

    refreshResults(): void {
        if (!this.paginator) {
            return;
        }

        const from = this.paginator.pageIndex * this.paginator.pageSize;

        const to = this.paginator.pageIndex * this.paginator.pageSize + this.paginator.pageSize - 1;

        if (!this.callPending && (from >= this.offset + this.limit || from < this.offset)) {
            this.searchCalls();

        } else if (this.playbackList) {
            const calls: Array<RdioScannerCall | null> = this.playbackList.results.slice(from % this.limit, to % this.limit + 1);

            while (calls.length < this.results.value.length) {
                calls.push(null);
            }

            this.results.next(calls);
        }
    }

    resetForm(): void {
        this.form.reset({
            date: null,
            group: -1,
            sort: -1,
            system: -1,
            tag: -1,
            talkgroup: -1,
            units: [],
            unitsMode: 'any',
        });

        this.paginator?.firstPage();

        this.formChangeHandler();
    }

    searchCalls(): void {
        if (this.livefeedPlayback) {
            return;
        }

        const pageIndex = this.paginator?.pageIndex || 0;

        const pageSize = this.paginator?.pageSize || 0;

        this.offset = Math.floor((pageIndex * pageSize) / this.limit) * this.limit;

        const options: RdioScannerSearchOptions = {
            limit: this.limit,
            offset: this.offset,
            sort: this.form.value.sort,
        };

        if (typeof this.form.value.date === 'string') {
            options.date = new Date(Date.parse(this.form.value.date));
        }

        if (this.form.value.group >= 0) {
            const group = this.getSelectedGroup();

            if (group) {
                options.group = group;
            }
        }

        if (this.form.value.system >= 0) {
            const system = this.getSelectedSystem();

            if (system) {
                options.system = system.id;
            }
        }

        if (this.form.value.tag >= 0) {
            const tag = this.getSelectedTag();

            if (tag) {
                options.tag = tag;
            }
        }

        if (this.form.value.talkgroup >= 0) {
            const [tgSystem, talkgroup] = this.getSelectedTalkgroup();

            if (talkgroup) {
                options.talkgroup = talkgroup.id;

                if (tgSystem && options.system === undefined) {
                    options.system = tgSystem.id;
                }
            }
        }

        // Add units filter if any units are selected
        const selectedUnits = this.getSelectedUnits();
        if (selectedUnits.length > 0) {
            options.units = selectedUnits.map((unit) => unit.id);
            options.unitsMode = this.form.value.unitsMode || 'any';
        }

        this.resultsPending = true;

        this.form.disable();

        this.rdioScannerService.searchCalls(options);
    }

    stop(): void {
        if (this.livefeedPlayback) {
            this.rdioScannerService.stopPlaybackMode();

        } else {
            this.rdioScannerService.stop();
        }
    }

    private eventHandler(event: RdioScannerEvent): void {
        if ('call' in event) {
            this.call = event.call;

            if (this.callPending) {
                const index = this.results.value.findIndex((call) => call?.id === this.callPending);

                if (index === -1) {
                    if (this.form.value.sort === -1) {
                        this.paginator?.previousPage();

                    } else {
                        this.paginator?.nextPage();
                    }
                }

                this.callPending = undefined;
            }
        }

        if ('config' in event) {
            this.config = event.config;

            this.callPending = undefined;

            this.optionsGroup = Object.keys(this.config?.groups || []).sort((a, b) => a.localeCompare(b));
            this.optionsSystem = (this.config?.systems || []).map((system) => system.label);
            this.optionsTag = Object.keys(this.config?.tags || []).sort((a, b) => a.localeCompare(b));
            this.optionsUnit = (this.config?.systems || [])
                .flatMap((system) =>
                    (system.units || []).map((unit) => [system, unit] as [RdioScannerSystem, RdioScannerUnit])
                )
                .sort((a, b) => a[1].label.localeCompare(b[1].label));

            // Apply text filter
            this.filterUnits();

            this.time12h = this.config?.time12hFormat || false;
        }

        if ('livefeedMode' in event) {
            this.livefeedOnline = event.livefeedMode === RdioScannerLivefeedMode.Online;

            this.livefeedPlayback = event.livefeedMode === RdioScannerLivefeedMode.Playback;
        }

        if ('playbackList' in event) {
            this.playbackList = event.playbackList;

            this.refreshResults();

            this.resultsPending = false;

            this.form.enable();
        }

        if ('playbackPending' in event) {
            this.callPending = event.playbackPending;
        }

        if ('pause' in event) {
            this.paused = event.pause || false;
        }

        if ('unitsIndex' in event) {
            this.propagateUnitLabels();
        }

        this.ngChangeDetectorRef.detectChanges();
    }

    private getSelectedGroup(): string | undefined {
        return this.optionsGroup[this.form.value.group];
    }

    private getSelectedSystem(): RdioScannerSystem | undefined {
        return this.config?.systems.find((system) => system.label === this.optionsSystem[this.form.value.system]);
    }

    private getSelectedTag(): string | undefined {
        return this.optionsTag[this.form.value.tag];
    }

    private getSelectedTalkgroup(): [RdioScannerSystem, RdioScannerTalkgroup] | [undefined, undefined] {
        const selectedTgOption = this.optionsTalkgroup[this.form.value.talkgroup];
        if (!selectedTgOption) {
            return [undefined, undefined];
        }

        const [system, talkgroupLabel] = selectedTgOption;

        const selectedSystem = this.getSelectedSystem();
        const selectedSystems = selectedSystem ? [selectedSystem] : this.config?.systems ?? [];

        if (!selectedSystems.find((selectedSys) => selectedSys.id === system.id)) {
            return [undefined, undefined];
        }

        const talkgroup = system.talkgroups.find((talkgroup) => talkgroup.label === talkgroupLabel);
        if (!talkgroup) {
            return [undefined, undefined];
        }

        return [system, talkgroup];
    }

    private getSelectedUnits(): RdioScannerUnit[] {
        const selectedIndices = this.form.value.units || [];
        return selectedIndices
            .map((index: number) => {
                const option = this.optionsUnit[index];
                return option ? option[1] : undefined;
            })
            .filter((unit: RdioScannerUnit | undefined): unit is RdioScannerUnit => unit !== undefined);
    }

    /**
     * Get count of unique systems in optionsUnit
     */
    getUniqueSystemsCount(): number {
        const systemIds = new Set(this.optionsUnit.map(([system]) => system.id));
        return systemIds.size;
    }

    /**
     * Get unique systems that have units
     */
    getSystemsWithUnits(): RdioScannerSystem[] {
        const systemMap = new Map<number, RdioScannerSystem>();
        this.optionsUnit.forEach(([system]) => {
            if (!systemMap.has(system.id)) {
                systemMap.set(system.id, system);
            }
        });
        return Array.from(systemMap.values());
    }

    /**
     * Get units for a specific system (filtered)
     */
    getUnitsForSystem(system: RdioScannerSystem): [RdioScannerSystem, RdioScannerUnit][] {
        return this.optionsUnitFiltered.filter(([sys]) => sys.id === system.id);
    }

    /**
     * Filter units based on search text
     */
    filterUnits(): void {
        const filterText = this.unitsFilterText.toLowerCase().trim();

        if (!filterText) {
            this.optionsUnitFiltered = this.optionsUnit;
        } else {
            this.optionsUnitFiltered = this.optionsUnit.filter(([sys, unit]) => {
                return unit.label.toLowerCase().includes(filterText) ||
                       unit.id.toString().includes(filterText);
            });
        }
    }

    /**
     * Clear units filter
     */
    clearUnitsFilter(): void {
        this.unitsFilterText = '';
        this.filterUnits();
    }

    /**
     * Get the index of a unit option in optionsUnit array
     */
    getUnitOptionIndex(option: [RdioScannerSystem, RdioScannerUnit]): number {
        return this.optionsUnit.findIndex(([sys, unit]) =>
            sys.id === option[0].id && unit.id === option[1].id
        );
    }

    /**
     * TrackBy function for performance optimization
     */
    trackByUnitOption(index: number, option: [RdioScannerSystem, RdioScannerUnit]): string {
        return `${option[0].id}-${option[1].id}`;
    }

    /**
     * Remove a specific unit from selection
     */
    removeUnit(unitIndex: number): void {
        const currentUnits = this.form.value.units || [];
        const newUnits = currentUnits.filter((index: number) => index !== unitIndex);
        this.form.patchValue({ units: newUnits });
        this.formChangeHandler();
    }

    /**
     * Handle units select dropdown opened event
     */
    onUnitsSelectOpened(): void {
        // Focus the filter input when dropdown opens
        setTimeout(() => {
            this.unitsFilterInput?.nativeElement.focus();
        }, 0);
    }

    /**
     * Select all currently filtered units
     */
    selectAllFilteredUnits(): void {
        const currentUnits = this.form.value.units || [];
        const filteredIndices = this.optionsUnitFiltered.map(option => this.getUnitOptionIndex(option));

        // Merge current selection with filtered units (avoiding duplicates)
        const newUnits = Array.from(new Set([...currentUnits, ...filteredIndices]));

        this.form.patchValue({ units: newUnits });
        this.formChangeHandler();
    }

    /**
     * Deselect all currently filtered units
     */
    deselectAllFilteredUnits(): void {
        const currentUnits = this.form.value.units || [];
        const filteredIndices = new Set(this.optionsUnitFiltered.map(option => this.getUnitOptionIndex(option)));

        // Remove filtered units from current selection
        const newUnits = currentUnits.filter((index: number) => !filteredIndices.has(index));

        this.form.patchValue({ units: newUnits });
        this.formChangeHandler();
    }

    /**
     * Check if all filtered units are selected
     */
    areAllFilteredUnitsSelected(): boolean {
        const currentUnits = new Set(this.form.value.units || []);
        return this.optionsUnitFiltered.every(option =>
            currentUnits.has(this.getUnitOptionIndex(option))
        );
    }

    /**
     * Propagate changes to unit labels to calls in search results
     */
    private propagateUnitLabels(): void {
        this.rdioScannerService.propagateUnitLabels(this.iterManagedCalls());
    }

    private *iterManagedCalls(): Iterable<RdioScannerCall> {
        if (this.playbackList) {
            yield* this.playbackList.results;
        }

        if (this.call) {
            yield this.call;
        }

        if (this.results.value) {
            yield* this.results.value.filter((call) => call !== null) as RdioScannerCall[];
        }
    }

    /**
     * Handle search for unit event from labeler service
     */
    private handleSearchForUnit(event: { systemId: number; unitId: number }): void {
        if (!this.config) {
            return;
        }

        // Find the system index
        const systemIndex = this.config.systems.findIndex((sys) => sys.id === event.systemId);

        // Find the unit in optionsUnit
        const unitOptionIndex = this.optionsUnit.findIndex(([sys, unit]) =>
            sys.id === event.systemId && unit.id === event.unitId
        );

        if (systemIndex === -1 || unitOptionIndex === -1) {
            console.warn('Unable to find system or unit for search:', event);
            return;
        }

        // Reset the form to default values
        this.form.patchValue({
            date: null,
            group: -1,
            sort: -1,
            system: systemIndex,
            tag: -1,
            talkgroup: -1,
            units: [unitOptionIndex],
            unitsMode: 'any',
        });

        // Open the search panel
        this.panel?.open();

        // Trigger search
        this.formChangeHandler();
    }
}
