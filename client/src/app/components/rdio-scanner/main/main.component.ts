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

import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ViewChild
} from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { ShortcutInput } from "@egoistdeveloper/ng-keyboard-shortcuts";
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject, interval, map, Observable, Subject, Subscription, timer } from 'rxjs';
import packageInfo from '../../../../../package.json';
import {
    RdioScannerAvoidOptions,
    RdioScannerBeepStyle,
    RdioScannerCall, RdioScannerCallSource,
    RdioScannerConfig,
    RdioScannerEvent,
    RdioScannerLivefeedMap,
    RdioScannerLivefeedMode,
    RdioScannerUnitsIndex,
} from '../rdio-scanner';
import { RdioScannerService } from '../rdio-scanner.service';
import { RdioScannerAdminService } from '../admin/admin.service';

type CallSourceDisplayInfo = {
    offsetRem: number;
    widthRem: number;
    scrollRem: number;
};

@Component({
    selector: 'rdio-scanner-main',
    styleUrls: [
        '../common.scss',
        './main.component.scss',
    ],
    templateUrl: './main.component.html',
})
export class RdioScannerMainComponent implements OnDestroy, OnInit, AfterViewInit {
    readonly Math = Math;

    auth = false;
    authForm = this.ngFormBuilder.group({ password: [] });

    avoided = false;

    branding = '';

    call: RdioScannerCall | undefined;
    callDate: Date | undefined;
    callError = '0';
    callFrequency: string = this.formatFrequency(0);
    callHistory: RdioScannerCall[] = new Array<RdioScannerCall>(30);
    callPrevious: RdioScannerCall | undefined;
    callProgress = new Date(0, 0, 0, 0, 0, 0);
    callDuration = 0;
    callQueue = 0;
    callQueueDuration = 0;
    callSource: RdioScannerCallSource | undefined;
    callNumSources = 0;
    callSourceIndex = 0;
    callSourcePos = 0;
    callSourceDuration = 0;
    callSourcesDisplayInfo: CallSourceDisplayInfo[] = [];
    callSourcesTotalRem = 0;
    callSpike = '0';
    callSystem = 'System';
    callTag = 'Tag';
    callTalkgroup = 'Talkgroup';
    callTalkgroupId = '0';
    callTalkgroupName = `Rdio Scanner v${packageInfo.version}`;
    callTime = 0;
    callUnit: string | undefined = undefined;

    clock = new Date();

    dimmer = false;

    holdSys = false;
    holdTg = false;

    ledStyle = '';

    linked = false;

    listeners = 0;

    livefeedOffline = true;
    livefeedOnline = false;
    livefeedPaused = false;

    livefeedOnlineAt: Date | undefined;
    livefeedOnlineSeconds$ = new BehaviorSubject<number>(0);

    livefeedPausedAt: Date | undefined;
    livefeedPausedSeconds$ = new BehaviorSubject<number>(0);

    /**
     * Returns the duration the live feed has been paused, in seconds.
     */
    get livefeedPausedDuration(): number {
        if (this.livefeedPausedAt) {
            return (Date.now() - this.livefeedPausedAt.getTime()) / 1000;
        }

        return 0;
    }

    queuedCalls: RdioScannerCall[] = [];
    queuedCalls$ = new BehaviorSubject<RdioScannerCall[]>(this.queuedCalls);

    map: RdioScannerLivefeedMap = {};

    patched = false;

    playbackMode = false;

    shortcuts: ShortcutInput[] = [];

    replayOffset = 0;
    replayTimer: Subscription | undefined;

    replaySourceTimer: Subscription | undefined;

    tempAvoid = 0;

    timeFormat = 'HH:mm';

    get showListenersCount(): boolean {
        return this.config?.showListenersCount || false;
    }

    @Output() openSearchPanel = new EventEmitter<void>();

    @Output() openSelectPanel = new EventEmitter<void>();

    @Output() toggleFullscreen = new EventEmitter<void>();

    @Input() isOpen = true;

    @ViewChild('password', { read: MatInput }) private authPassword: MatInput | undefined;

    private clockTimer: Subscription | undefined;

    private livefeedOnlineDurationTimer: Subscription | undefined;
    private pausedDurationTimer: Subscription | undefined;

    private config: RdioScannerConfig | undefined;

    private dimmerTimer: Subscription | undefined;

    unitsIndex: RdioScannerUnitsIndex | undefined;

    private eventSubscription = this.rdioScannerService.event.subscribe((event: RdioScannerEvent) => this.eventHandler(event));

    constructor(
        private rdioScannerService: RdioScannerService,
        private matSnackBar: MatSnackBar,
        private ngChangeDetectorRef: ChangeDetectorRef,
        private ngFormBuilder: FormBuilder,
        private adminService: RdioScannerAdminService,
    ) { }

    get isAdminAuthenticated(): boolean {
        return this.adminService.authenticated;
    }

    ngAfterViewInit(): void {
        this.shortcuts.push(
            {
                key: 'space',
                label: 'Pause',
                description: 'Pause/unpause feed',
                command: () => this.pause(),
                preventDefault: true,
            },
            {
                key: 'l',
                label: 'Live Feed',
                description: 'Toggle live feed',
                command: () => this.livefeed(),
            },
            {
                key: ['n', 'right'],
                label: 'Skip/Next',
                description: 'Skip current call',
                command: () => this.skip(),
            },
            {
                key: ['p', 'left'],
                label: 'Replay Last',
                description: 'Replay last call',
                command: () => this.replay(),
            },
            {
                key: ['shift + n', 'shift + right'],
                label: 'Skip/Next Unit',
                description: 'Skip active unit in current call',
                command: () => this.skipSource(),
            },
            {
                key: ['shift + p', 'shift + left'],
                label: 'Replay Last Unit',
                description: 'Replay last unit in current call',
                command: () => this.replaySource(),
            },
            {
                key: 'h s',
                label: 'Hold System',
                description: 'Hear only calls from the currently-playing system',
                command: () => this.holdSystem(),
            },
            {
                key: 'h g',
                label: 'Hold Group',
                description: 'Hear only calls from the currently-playing talkgroup',
                command: () => this.holdTalkgroup(),
            },
            {
                key: 'a',
                label: 'Avoid',
                description: 'Avoid calls from current talkgroup',
                command: () => this.avoid(),
            },
            {
                key: '/',
                label: 'Search Call',
                description: 'Open call search page',
                command: () => this.showSearchPanel(),
            },
            {
                key: 's',
                label: 'Select Talkgroups',
                description: 'Open talkgroup/systems select panel',
                command: () => this.showSelectPanel(),
            },
            {
                key: 'escape',
                label: 'Close prompts/modals',
                description: 'Close any open prompts or modals',
                command: () => {
                    this.auth = false;
                },
            }
        );
    }

    authenticate(password = this.authForm.value.password): void {
        this.authForm.disable();

        this.rdioScannerService.authenticate(password);
    }

    play(id: number): void {
        this.rdioScannerService.loadAndPlay(id);
    }

    authFocus(): boolean {
        if (this.auth) {
            if (this.authPassword instanceof MatInput) {
              this.authPassword.focus();
            }
            return true;
        }

        return false;
    }

    avoid(options?: RdioScannerAvoidOptions): void {
        const call = this.call || this.callPrevious;

        if (this.authFocus()) return;

        if (!options && !call) {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
            return;
        }

        if (options) {
            this.rdioScannerService.avoid(options);
        } else if (call) {
            const avoided = this.rdioScannerService.isAvoided(call);
            const minutes = this.rdioScannerService.isAvoidedTimer(call);

            if (!avoided) {
                this.rdioScannerService.avoid({status: false});
            } else if (!minutes) {
                this.rdioScannerService.avoid({minutes: 30, status: false});
            } else if (minutes === 30) {
                this.rdioScannerService.avoid({minutes: 60, status: false});
            } else if (minutes === 60) {
                this.rdioScannerService.avoid({minutes: 120, status: false});
            } else {
                this.rdioScannerService.avoid({status: true});
            }
        }

        if (call && this.rdioScannerService.isAvoided(call)) {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);
        } else {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Deactivate);
        }

        this.updateDimmer();
    }

    holdSystem(): void {
        if (this.authFocus()) return;

        if (this.call || this.callPrevious) {
            this.rdioScannerService.beep(this.holdSys ? RdioScannerBeepStyle.Deactivate : RdioScannerBeepStyle.Activate);

            this.rdioScannerService.holdSystem();

        } else {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
        }

        this.updateDimmer();
    }

    holdTalkgroup(): void {
        if (this.authFocus()) return;

        if (this.call || this.callPrevious) {
            this.rdioScannerService.beep(this.holdTg ? RdioScannerBeepStyle.Deactivate : RdioScannerBeepStyle.Activate);

            this.rdioScannerService.holdTalkgroup();

        } else {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
        }

        this.updateDimmer();
    }

    livefeed(): void {
        if (this.authFocus()) return;

        this.rdioScannerService.beep(this.livefeedOffline ? RdioScannerBeepStyle.Activate : RdioScannerBeepStyle.Deactivate);

        this.rdioScannerService.livefeed();

        this.updateDimmer();
    }

    ngOnDestroy(): void {
        this.clockTimer?.unsubscribe();

        this.eventSubscription.unsubscribe();
    }

    ngOnInit(): void {
        this.syncClock();
    }

    pause(): void {
        if (this.authFocus()) return;

        if (this.livefeedPaused) {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Deactivate);

            this.rdioScannerService.pause();

        } else {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

            this.rdioScannerService.pause();
        }

        this.updateDimmer();
    }

    replay(): void {
        if (this.authFocus()) return;

        if (!this.livefeedPaused && (this.call || this.callPrevious)) {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

            if (this.replayTimer instanceof Subscription) {
                this.replayTimer.unsubscribe();
                this.replayOffset = Math.min(this.callHistory.length, this.replayOffset + 1);
            }

            this.replayTimer = timer(1000).subscribe(() => {
                this.replayTimer = undefined;
                this.replayOffset = 0;
            });

            if (this.call && !this.replayOffset) {
                this.rdioScannerService.replay()
            } else if (this.callPrevious !== this.callHistory[0]) {
                if (this.replayOffset) {
                    this.rdioScannerService.play(this.callHistory[this.replayOffset - 1]);
                } else {
                    this.rdioScannerService.replay()
                }
            } else if (this.replayOffset < this.callHistory.length) {
                this.rdioScannerService.play(this.callHistory[this.replayOffset]);
            }

        } else {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
        }

        this.updateDimmer();
    }

    showSearchPanel(): void {
        if (!this.config) {
            return;
        }

        if (this.authFocus()) return;

        this.rdioScannerService.beep();

        this.openSearchPanel.emit();
    }

    showSelectPanel(): void {
        if (!this.config) {
            return;
        }

        if (this.authFocus()) return;

        this.rdioScannerService.beep();

        this.openSelectPanel.emit();
    }

    skip(options?: { delay?: boolean }): boolean {
        if (this.authFocus()) return false;

        this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

        try {
            return this.rdioScannerService.skip(options);
        } finally {
            this.updateDimmer();
        }
    }

    stop(): void {
        this.rdioScannerService.stop();
    }

    private eventHandler(event: RdioScannerEvent): void {
        if ('auth' in event && event.auth) {
            const password = this.rdioScannerService.readPin();

            if (password) {
                this.rdioScannerService.clearPin();

                this.authForm.get('password')?.setValue(password);

                this.rdioScannerService.authenticate(password);

            } else {
                this.auth = event.auth;

                this.authForm.reset();

                if (this.authForm.disabled) {
                    this.authForm.enable();
                }
            }
        }

        if ('call' in event) {
            if (this.call) {
                this.callPrevious = this.call;

                this.call = undefined;
            }

            if (event.call) {
                this.call = event.call;

                if (!this.callHistory.find((call: RdioScannerCall) => call?.id === this.call?.id)) {
                    this.callHistory.pop();
                    this.callHistory.unshift(this.call);
                }

                // this.queuedCalls = this.queuedCalls.filter((call: RdioScannerCall) => call?.id !== this.call?.id);
                // this.queuedCalls$.next(this.queuedCalls);

                this.updateDimmer();
            }
        }

        if ('config' in event) {
            this.config = event.config;

            this.branding = this.config?.branding ?? '';

            this.timeFormat = this.config?.time12hFormat ? 'h:mm a' : 'HH:mm';

            const password = this.authForm.get('password')?.value;

            if (password) {
                this.rdioScannerService.savePin(password);

                this.authForm.reset();
            }

            this.auth = false;

            this.authForm.reset();

            if (this.authForm.enabled) {
                this.authForm.disable();
            }
        }

        if ('unitsIndex' in event) {
            this.unitsIndex = event.unitsIndex;

            this.propagateUnitLabels();
        }

        if ('expired' in event && event.expired === true) {
            this.authForm.get('password')?.setErrors({ expired: true });
        }

        if ('holdSys' in event) {
            this.holdSys = event.holdSys || false;
        }

        if ('holdTg' in event) {
            this.holdTg = event.holdTg || false;
        }

        if ('linked' in event) {
            this.linked = event.linked || false;
        }

        if ('listeners' in event) {
            this.listeners = event.listeners || 0;
        }

        if ('map' in event) {
            this.map = event.map || {};
        }

        if ('pause' in event) {
            this.livefeedPaused = event.pause || false;
        }

        if ('pausedAt' in event) {
            this.livefeedPausedAt = event.pausedAt;

            if (this.livefeedPausedAt) {
                this.startPausedDurationTimer();
            } else {
                this.stopPausedDurationTimer();
            }
        }

        if ('queue' in event) {
            this.callQueue = event.queue || 0;
        }

        if ('queueDuration' in event) {
            this.callQueueDuration = event.queueDuration || 0;
        }

        if (event.queuedCalls) {
            this.queuedCalls$.next(event.queuedCalls);
        }

        if ('time' in event && typeof event.time === 'number') {
            this.callTime = event.time;

            this.updateDimmer();
        }

        if ('tooMany' in event && event.tooMany === true) {
            this.authForm.get('password')?.setErrors({ tooMany: true });
        }

        if ('livefeedMode' in event && event.livefeedMode) {
            this.livefeedOffline = event.livefeedMode === RdioScannerLivefeedMode.Offline;

            this.livefeedOnline = event.livefeedMode === RdioScannerLivefeedMode.Online;

            this.playbackMode = event.livefeedMode === RdioScannerLivefeedMode.Playback;

            if (this.livefeedOnline) {
                this.startLivefeedOnlineDurationTimer();
            } else {
                this.stopLivefeedOnlineDurationTimer();
            }

            return;
        }

        this.updateDisplay();
    }

    private formatAfs(n: number): string {
        return `${(n >> 7 & 15).toString().padStart(2, '0')}-${(n >> 3 & 15).toString().padStart(2, '0')}${n & 7}`;
    }

    private formatFrequency(frequency: number | undefined): string {
        return typeof frequency === 'number' ? frequency
            .toString()
            .padStart(9, '0')
            .replace(/(\d)(?=(\d{3})+$)/g, '$1 ')
            .concat(' Hz') : '';
    }

    calcNumUniqueSources(call: RdioScannerCall): number {
        if (!call) return 0;

        if (Array.isArray(call.sources)) {
            const uniqueUnitIds = new Set(call.sources.map(({ src }) => src ?? -1));
            return uniqueUnitIds.size;
        }

        if (typeof call.source === 'number') {
            return 1;
        }

        return 0;
    }

    private isAfsSystem(talkgroupId: number): boolean {
        if (typeof this.config?.afs !== 'string') {
            return false;
        }

        return this.config.afs.split(',').includes(talkgroupId.toString());
    }

    /**
     * Propagate changes to unit labels to calls in history
     */
    private propagateUnitLabels(): void {
        this.rdioScannerService.propagateUnitLabels(this.iterManagedCalls());
    }

    private *iterManagedCalls(): Generator<RdioScannerCall> {
        if (this.call) yield this.call;
        if (this.callPrevious) yield this.callPrevious;
        for (const call of this.callHistory) {
            if (call) yield call;
        }
    }

    private syncClock(): void {
        this.clockTimer?.unsubscribe();

        this.clock = new Date();

        this.clockTimer = timer(1000 * (60 - this.clock.getSeconds())).subscribe(() => this.syncClock());
    }

    isActiveCall(call?: RdioScannerCall): boolean {
        return this.call?.id != null && this.call.id === call?.id;
    }

    getSourceDuration(call: RdioScannerCall, callSourceIndex?: number): number {
        if (callSourceIndex == null) {
            return call.audioDuration ?? 0;
        }

        const source = call.sources?.[callSourceIndex];
        const sourcePos = source?.pos;
        if (sourcePos == null) {
            return 0;
        }

        const nextSource = call.sources?.[callSourceIndex + 1];
        const nextPos = nextSource?.pos ?? call.audioDuration ?? 0;

        return nextPos - sourcePos;
    }

    private startLivefeedOnlineDurationTimer(): void {
        this.livefeedOnlineAt = new Date();

        this.livefeedOnlineDurationTimer?.unsubscribe();
        this.livefeedOnlineDurationTimer = undefined;

        this.livefeedOnlineDurationTimer = interval(1000).subscribe(() => {
            const livefeedOnlineDuration = this.livefeedOnlineAt ? (Date.now() - this.livefeedOnlineAt.getTime()) / 1000 : 0;
            this.livefeedOnlineSeconds$.next(Math.floor(livefeedOnlineDuration));
        });
    }

    private stopLivefeedOnlineDurationTimer(): void {
        this.livefeedOnlineAt = undefined;
        this.livefeedOnlineDurationTimer?.unsubscribe();
        this.livefeedOnlineDurationTimer = undefined;
        this.livefeedOnlineSeconds$.next(0);
    }

    private startPausedDurationTimer(): void {
        this.pausedDurationTimer?.unsubscribe();
        this.pausedDurationTimer = undefined;

        this.pausedDurationTimer = interval(1000).subscribe(() => {
            this.livefeedPausedSeconds$.next(Math.floor(this.livefeedPausedDuration));
        });
    }

    private stopPausedDurationTimer(): void {
        this.pausedDurationTimer?.unsubscribe();
        this.pausedDurationTimer = undefined;
        this.livefeedPausedSeconds$.next(0);
    }

    seekToSource(call: RdioScannerCall, source?: RdioScannerCallSource): void {
        if (!source) {
            return;
        }

        if (source.pos != null) {
            this.rdioScannerService.seek(source.pos);
        }
    }

    async skipSource(): Promise<void> {
        const nextSource = this.call?.sources?.[this.callSourceIndex + 1];
        if (!nextSource || !this.call) {
            if (!this.skip()) {
                void this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
            }
            return;
        }

        await this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);
        this.seekToSource(this.call, nextSource);
    }

    async replaySource(): Promise<void> {
        let replayDelta = 0;

        if (this.replaySourceTimer instanceof Subscription) {
            this.replaySourceTimer.unsubscribe();
            replayDelta = -1;
        }

        const replaySourceIndex = this.callSourceIndex + replayDelta;

        this.replaySourceTimer = timer(750).subscribe(() => {
            this.replaySourceTimer = undefined;
        });

        // Force replay to switch to previous call (if available)
        if (replaySourceIndex === -1) {
            this.replayOffset = Math.min(this.callHistory.length, this.replayOffset + 1)
            this.replay();
            return;
        }

        // If we're not currently listening to any call, replay the previous call
        if (!this.call) {
            this.replay();
            return;
        }

        const prevSource = this.call?.sources?.[replaySourceIndex];
        if (!prevSource) {
            this.replay();
            return;
        }

        await this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);
        this.seekToSource(this.call, prevSource);
    }

    private updateDimmer(): void {
        if (typeof this.config?.dimmerDelay !== 'number') {
            return;
        }

        this.dimmerTimer?.unsubscribe();
        this.dimmer = true;
        this.dimmerTimer = timer(this.config.dimmerDelay).subscribe(() => {
            this.dimmerTimer?.unsubscribe();

            this.dimmerTimer = undefined;

            this.dimmer = false;

            this.ngChangeDetectorRef.detectChanges();
        });
    }

    private updateDisplay(time = this.callTime): void {
        if (this.call) {
            const isAfs = this.isAfsSystem(this.call.system);

            this.callProgress = new Date(this.call.dateTime);
            this.callProgress.setSeconds(this.callProgress.getSeconds() + time);

            if (Date.now() - this.callProgress.getTime() >= 86400000) {
                this.callDate = this.call.dateTime;
            } else {
                this.callDate = undefined;
            }

            this.callSystem = this.call.systemData?.label || `${this.call.system}`;

            this.callTag = this.call.talkgroupData?.tag || '';

            this.callTalkgroup = this.call.talkgroupData?.label || `${isAfs ? this.formatAfs(this.call.talkgroup) : this.call.talkgroup}`;

            this.callTalkgroupName = this.call.talkgroupData?.name || this.formatFrequency(this.call?.frequency);

            this.callTalkgroupId = isAfs ? this.formatAfs(this.call.talkgroup) : this.call.talkgroup.toString();

            this.callDuration = this.call.audioDuration || 0;

            if (Array.isArray(this.call.frequencies) && this.call.frequencies.length) {
                const frequency = this.call.frequencies.reduce((p, v) => (v.pos || 0) <= time ? v : p, {});

                this.callError = typeof frequency.errorCount === 'number' ? `${frequency.errorCount}` : '';

                this.callFrequency = this.formatFrequency(typeof frequency.freq === 'number' ? frequency.freq : this.call.frequency);

                this.callSpike = typeof frequency.spikeCount === 'number' ? `${frequency.spikeCount}` : '';

            } else {
                this.callError = '';

                this.callFrequency = typeof this.call.frequency === 'number'
                    ? this.formatFrequency(this.call.frequency)
                    : '';

                this.callSpike = '';
            }

            if (time >= this.callDuration) {
                this.callUnit = undefined;

            } else if (Array.isArray(this.call.sources) && this.call.sources.length) {
                this.callNumSources = this.call.sources.length;

                const source = this.call.sources.reduce((p, v) => (v.pos || 0) <= time ? v : p, {});
                this.callSource = source;
                this.callSourceIndex = this.call.sources.indexOf(source);
                this.callSourcePos = time - (source.pos || 0);
                this.callSourceDuration = this.getSourceDuration(this.call, this.callSourceIndex);

                this.callSourcesTotalRem = 0;
                this.callSourcesDisplayInfo = this.call.sources.map((_source, sourceIndex) => {
                    const widthRem = Math.max(8, this.getSourceDuration(this.call!!, sourceIndex) + 5);
                    this.callSourcesTotalRem += widthRem;

                    const scrollRem = Math.max(0, widthRem - 8)

                    return {
                        offsetRem: 0,
                        widthRem,
                        scrollRem,
                    };
                });
                this.callSourcesDisplayInfo.forEach((info, sourceIndex) => {
                    const prevInfo = this.callSourcesDisplayInfo[sourceIndex - 1];
                    if (prevInfo) {
                        info.offsetRem = prevInfo.offsetRem + prevInfo.widthRem;
                    }
                });

                if (typeof source.src === 'number' && this.unitsIndex != null) {
                    this.callUnit = this.unitsIndex[this.call.system]?.[source.src] ?? `${source.src}`;

                } else {
                    this.callUnit = typeof this.call.source === 'number' ? `${this.call.source}` : undefined;
                }

            } else {
                this.callNumSources = 1;
                this.callSourceIndex = 0;

                this.callUnit = this.call.systemData?.units?.find((u) => u.id === this.call?.source)?.label ?? `${this.call.source ?? ''}`;

                if (typeof this.call.source === 'number') {
                    this.callSource = { src: this.call.source };

                    const label = this.unitsIndex?.[this.call.system]?.[this.call.source];
                    if (label) {
                        this.callSource.label = label;
                        this.callUnit = label;
                    } else {
                        this.callUnit = `${this.call.source}`;
                    }
                } else {
                    this.callSource = undefined;
                    this.callUnit = '?';
                }
            }

            if (
                this.callPrevious &&
                this.callPrevious.id !== this.call.id &&
                !this.callHistory.find((call: RdioScannerCall) => call?.id === this.callPrevious?.id)
            ) {
                this.callHistory.pop();

                this.callHistory.unshift(this.callPrevious);
            }
        }

        const call = this.call || this.callPrevious;

        if (call) {
            this.tempAvoid = this.rdioScannerService.isAvoidedTimer(call);

            if (this.rdioScannerService.isPatched(call)) {
                this.avoided = false;
                this.patched = true;
            } else {
                this.avoided = this.rdioScannerService.isAvoided(call);
                this.patched = false;
            }
        }

        const colors = ['blue', 'cyan', 'green', 'magenta', 'orange', 'red', 'white', 'yellow'];

        this.ledStyle = this.call && this.livefeedPaused ? 'on paused' : this.call ? 'on' : 'off';

        if (colors.includes(this.call?.talkgroupData?.led as string)) {
            this.ledStyle = `${this.ledStyle} ${this.call?.talkgroupData?.led}`;

        } else if (colors.includes(this.call?.systemData?.led as string)) {
            this.ledStyle = `${this.ledStyle} ${this.call?.systemData?.led}`;
        }

        this.ngChangeDetectorRef.detectChanges();
    }
}
