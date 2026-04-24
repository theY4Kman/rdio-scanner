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

import { create } from 'zustand';
import { AudioManager } from '../services/audio';
import { WebSocketCallFlag, WebSocketCommand } from '../services/websocket';
import type {
    AvoidOptions,
    Beep,
    BeepStyle,
    Call,
    CallSource,
    Category,
    CategoryStatus,
    Config,
    KeypadBeeps,
    Livefeed,
    LivefeedMap,
    LivefeedUnitsMap,
    PlaybackList,
    QueuePersistState,
    SearchOptions,
    SearchQueueState,
    System,
    UnitsIndex,
} from '../types/scanner';
import {
    BeepStyle as BeepStyleEnum,
    CategoryStatus as CatStatus,
    CategoryType,
    LivefeedMode,
} from '../types/scanner';
import {
    clearPin,
    clearQueueState,
    getInstanceId,
    readLivefeedMap,
    readLivefeedUnitsMap,
    readPin,
    readQueuePersistEnabled,
    readQueueState,
    saveLivefeedMap,
    saveLivefeedUnitsMap,
    savePin,
    saveQueuePersistEnabled,
    saveQueueState,
} from '../utils/storage';

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

// ---------------------------------------------------------------------------
// Module-level audio state (mirrors the Angular service's private fields)
// ---------------------------------------------------------------------------

let audioContext: AudioContext | undefined;
let audioSource: AudioBufferSourceNode | undefined;
let audioBuffer: AudioBuffer | undefined;
let audioSourceStartTime = NaN;
let beepContext: AudioContext | undefined;
let audioBootstrapped = false;

// ---------------------------------------------------------------------------
// rAF-based audio time source (bypasses Zustand for high-frequency updates)
// ---------------------------------------------------------------------------

let currentAudioTime = 0;
let audioTimeSubscribers = new Set<() => void>();
let audioTimeRafId: number | undefined;

const AUDIO_TIME_NOTIFY_INTERVAL_MS = 66; // ~15fps — CSS transitions smooth the gaps
let lastNotifyTime = 0;

function startAudioTimeLoop(): void {
    stopAudioTimeLoop();
    lastNotifyTime = 0;
    const tick = (now: number) => {
        if (audioContext && !isNaN(audioSourceStartTime)) {
            currentAudioTime = audioContext.currentTime - audioSourceStartTime;
        }
        // Throttle React re-renders — update currentAudioTime every frame
        // (so reads are always fresh) but only notify subscribers periodically
        if (now - lastNotifyTime >= AUDIO_TIME_NOTIFY_INTERVAL_MS) {
            lastNotifyTime = now;
            audioTimeSubscribers.forEach((cb) => cb());
        }
        audioTimeRafId = requestAnimationFrame(tick);
    };
    audioTimeRafId = requestAnimationFrame(tick);
}

function stopAudioTimeLoop(): void {
    if (audioTimeRafId !== undefined) {
        cancelAnimationFrame(audioTimeRafId);
        audioTimeRafId = undefined;
    }
}

/** Subscribe to audio time updates (for useSyncExternalStore) */
export function subscribeAudioTime(callback: () => void): () => void {
    audioTimeSubscribers.add(callback);
    return () => { audioTimeSubscribers.delete(callback); };
}

/** Get current audio time snapshot (for useSyncExternalStore) */
export function getAudioTimeSnapshot(): number {
    return currentAudioTime;
}

// ---------------------------------------------------------------------------
// Module-level connection & timer state
// ---------------------------------------------------------------------------

let ws: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let skipDelayTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * True while we're in the inter-call delay (the 1s pause the onended handler
 * schedules before auto-advancing to the next call). Hotkeys / UI that want
 * to act differently during this window -- e.g. Skip Unit treating the delay
 * as "the next call is imminent, advance now" -- can consult this helper.
 */
export function isSkipDelayActive(): boolean {
    return skipDelayTimer !== undefined;
}

// ---------------------------------------------------------------------------
// Module-level internal state (Angular service private fields not in Zustand)
// ---------------------------------------------------------------------------

let livefeedMapPriorToHoldSystem: LivefeedMap | undefined;
let livefeedMapPriorToHoldTalkgroup: LivefeedMap | undefined;
let playbackRefreshing = false;
let queuePersistPendingBatches: number[][] = [];
let queuePersistRestoring = false;
let queueRestoreOpportunityConsumed = false;
let instanceId = 'default';
let pendingPassword = '';

// AudioManager instance kept for potential future use (e.g. direct playback)
const _audioManager = new AudioManager(); void _audioManager;

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface ScannerState {
    // Connection
    linked: boolean;

    // Config
    config: Config;
    unitsIndex: UnitsIndex;

    // Unit-label save-in-flight state. A unit key here means an admin save
    // (or delete, when label === null) is pending server confirmation. The
    // UI renders these entries in teal to signal "in progress". Entries are
    // cleared when a config emission from the server confirms the change.
    pendingUnitLabels: { [systemId: number]: { [unitId: number]: { label: string | null; ts: number } } };

    // Auth
    authRequired: boolean;
    authExpired: boolean;
    authTooMany: boolean;

    // Livefeed
    livefeedMode: LivefeedMode;
    livefeedMap: LivefeedMap;
    livefeedUnitsMap: LivefeedUnitsMap;
    categories: Category[];

    // Playback
    call: Call | null;
    callPrevious: Call | null;
    callHistory: Call[];  // last N played calls for replay navigation
    callQueue: Call[];

    // Search queue -- orthogonal to livefeed. When active, playing calls come
    // from user-selected search results. Livefeed continues running in the
    // background; arriving calls are buffered into pendingLivefeedCalls until
    // the search queue ends.
    searchQueue: SearchQueueState;
    callTime: number;
    paused: boolean;
    pausedAt: Date | null;

    // Hold
    holdSys: boolean;
    holdTg: boolean;

    // Queue persist
    queuePersistEnabled: boolean;

    // Listeners
    listeners: number;

    // Search/Playback
    playbackList: PlaybackList | null;
    playbackPending: number | null;
}

export interface ScannerActions {
    initialize(): void;
    destroy(): void;
    authenticate(password: string): void;
    avoid(options?: AvoidOptions): void;
    avoidUnit(unitId: number): void;
    isAvoided(call: Call): boolean;
    isAvoidedTimer(call: Call): number;
    isPatched(call: Call): boolean;
    beep(style?: BeepStyle): Promise<void>;
    holdSystem(options?: { resubscribe?: boolean }): void;
    holdTalkgroup(options?: { resubscribe?: boolean }): void;
    livefeed(): void;
    startLivefeed(): void;
    stopLivefeed(): void;
    stopPlaybackMode(): void;
    loadAndDownload(id: number): void;
    loadAndPlay(id: number): boolean;
    pause(status?: boolean): void;
    play(call?: Call, options?: { skipHistory?: boolean; force?: boolean }): boolean;
    queue(call: Call, options?: { priority?: boolean }): void;
    replay(): void;
    seek(seconds: number): boolean;
    skip(options?: { delay?: boolean }): boolean;
    searchCalls(options: SearchOptions): void;
    toggleCategory(category: Category): void;
    enableQueuePersist(enabled: boolean): void;

    // Unit-label pending state actions
    markUnitLabelPending(systemId: number, unitId: number, label: string | null): void;
    clearUnitLabelPending(systemId: number, unitId: number): void;

    // Search-queue actions
    playFromSearch(callId: number, playAll: boolean, laterCallIds: number[]): void;
    skipSearchQueue(): boolean;
    exitSearchQueue(): void;
}

// ---------------------------------------------------------------------------
// Shorthand accessors for the store (used by module-level helpers)
// ---------------------------------------------------------------------------

function $get(): ScannerState & ScannerActions {
    return useScannerStore.getState();
}

function $set(partial: Partial<ScannerState>): void {
    useScannerStore.setState(partial);
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const defaultConfig: Config = {
    dimmerDelay: false,
    groups: {},
    keypadBeeps: false,
    playbackGoesLive: false,
    showListenersCount: false,
    systems: [],
    tags: {},
    tagsToggle: false,
    time12hFormat: false,
};

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------

function wsSend(command: string, payload?: unknown, flags?: string): void {
    if (ws?.readyState !== WebSocket.OPEN) {
        return;
    }

    const message: unknown[] = [command];
    if (payload) {
        message.push(payload);
    }
    if (flags !== null && flags !== undefined) {
        message.push(flags);
    }
    ws.send(JSON.stringify(message));
}

function openWebSocket(): void {
    // In dev mode (Vite), connect WS to /ws so the Vite proxy can forward it.
    // In production, the Go server handles WS on the root path.
    const baseUrl = window.location.origin.replace(/^http/, 'ws');
    const websocketUrl = import.meta.env.DEV ? `${baseUrl}/ws` : window.location.href.replace(/^http/, 'ws');

    ws = new WebSocket(websocketUrl);

    ws.onclose = (ev: CloseEvent) => {
        $set({ linked: false });

        if (ev.code !== 1000) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = undefined;
                closeWebSocket();
                openWebSocket();
            }, 2000);
        }
    };

    ws.onopen = () => {
        $set({ linked: true });

        if (ws) {
            ws.onmessage = (ev: MessageEvent) => {
                let message: unknown;
                try {
                    message = JSON.parse(ev.data as string);
                } catch (error) {
                    console.warn(`Invalid control message received, ${error}`);
                    return;
                }

                if (Array.isArray(message)) {
                    const [command, payload, flags] = message;
                    parseMessage(command as string, payload, flags as string | undefined);
                }
            };
        }

        wsSend(WebSocketCommand.Version);
        wsSend(WebSocketCommand.Config);
    };

    ws.onerror = () => {
        // Error handling is done via onclose
    };
}

function closeWebSocket(): void {
    if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
    }

    if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        ws.close();
        ws = undefined;
    }
}

// ---------------------------------------------------------------------------
// Audio bootstrap (mirrors Angular service bootstrapAudio)
// ---------------------------------------------------------------------------

function bootstrapAudio(): void {
    if (audioBootstrapped) {
        return;
    }
    audioBootstrapped = true;

    const events = ['keydown', 'mousedown', 'touchstart'] as const;

    const bootstrap = async () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
        }

        if (!beepContext) {
            beepContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        }

        if (audioContext) {
            const resume = () => {
                if (!$get().paused) {
                    if (audioContext?.state === 'suspended') {
                        audioContext?.resume().then(() => resume());
                    }
                }
            };

            await audioContext.resume();
            audioContext.onstatechange = () => resume();
        }

        if (beepContext) {
            const resume = () => {
                if (beepContext?.state === 'suspended') {
                    beepContext?.resume().then(() => resume());
                }
            };

            await beepContext.resume();
            beepContext.onstatechange = () => resume();
        }

        if (audioContext && beepContext) {
            events.forEach((event) => document.body.removeEventListener(event, bootstrap));
        }
    };

    events.forEach((event) => document.body.addEventListener(event, bootstrap));
}

// ---------------------------------------------------------------------------
// beepDirect — play oscillator beep via the module-level beepContext
// ---------------------------------------------------------------------------

function beepDirect(
    style: string,
    keypadBeeps: Record<string, Beep[]>,
): Promise<void> {
    return new Promise((resolve) => {
        const context = beepContext;
        const seq = keypadBeeps[style];

        if (!context || !seq) {
            resolve();
            return;
        }

        const gn = context.createGain();
        gn.gain.value = 0.1;
        gn.connect(context.destination);

        seq.forEach((beep, index) => {
            const osc = context.createOscillator();
            osc.connect(gn);
            osc.frequency.value = beep.frequency;
            osc.type = beep.type;

            if (index === seq.length - 1) {
                osc.onended = () => resolve();
            }

            osc.start(context.currentTime + beep.begin);
            osc.stop(context.currentTime + beep.end);
        });
    });
}

// ---------------------------------------------------------------------------
// Audio stop (mirrors Angular service stop())
// ---------------------------------------------------------------------------

function stopAudio(options?: { emit?: boolean }): void {
    stopAudioTimeLoop();
    // Preserve currentAudioTime so the sticky LCD shows end-of-call position
    // (e.g. ProgressTimestamp stays at call's end time instead of jumping to start).
    // It's reset to 0 when a new call begins playback.
    // currentAudioTime = 0;  // removed — intentionally preserved

    if (audioSource) {
        audioSource.onended = null;
        audioSource.stop();
        audioSource.disconnect();
        audioSource = undefined;
        audioSourceStartTime = NaN;
    }

    audioBuffer = undefined;

    const state = $get();
    if (state.call) {
        $set({ callPrevious: state.call, call: null });
    }

    if (typeof options?.emit !== 'boolean' || options.emit) {
        $set({ call: null });
    }
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

function cleanQueue(): void {
    const state = $get();

    const isActive = (call: Call): boolean => {
        const lfmCheck = (sys: number, tg: number): boolean =>
            !!state.livefeedMap && !!state.livefeedMap[sys] && !!state.livefeedMap[sys][tg]?.active;

        let active = lfmCheck(call.system, call.talkgroup);
        if (!active && Array.isArray(call.patches)) {
            for (let i = 0; i < call.patches.length; i++) {
                active = lfmCheck(call.system, call.patches[i]!);
                if (active) {
                    break;
                }
            }
        }
        return active;
    };

    const filtered = state.callQueue.filter((call: Call) => isActive(call));
    $set({ callQueue: filtered });

    if (state.call && !isActive(state.call)) {
        $get().skip();
    }
}

function clearQueue(): void {
    $set({ callQueue: [] });
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function download(call: Call): void {
    if (call.audio) {
        const file = call.audio.data.reduce((str, val) => str += String.fromCharCode(val), '');
        const fileName = call.audioName || 'unknown.dat';
        const fileType = call.audioType || 'audio/*';
        const fileUri = `data:${fileType};base64,${window.btoa(file)}`;

        const el = document.createElement('a');
        el.style.display = 'none';
        el.setAttribute('href', fileUri);
        el.setAttribute('download', fileName);

        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
    }
}

// ---------------------------------------------------------------------------
// Call fetching
// ---------------------------------------------------------------------------

function getCall(id: number, flags?: WebSocketCallFlag): void {
    wsSend(WebSocketCommand.Call, `${id}`, flags);
}

// ---------------------------------------------------------------------------
// Queue duration helpers
// ---------------------------------------------------------------------------

export function getCallQueueDuration(): number {
    return $get().callQueue
        .map((call) => call.audioDuration || 0)
        .reduce((sum, duration) => sum + duration, 0);
}

export function getPlaybackQueueCount(id?: number): number {
    const state = $get();
    const resolvedId = id ?? state.call?.id ?? state.callPrevious?.id;
    let queueCount = 0;

    if (resolvedId && state.playbackList) {
        const index = state.playbackList.results.findIndex((call) => call.id === resolvedId);

        if (index !== -1) {
            if (state.playbackList.options.sort === -1) {
                queueCount = state.playbackList.options.offset + index;
            } else {
                queueCount = state.playbackList.count - state.playbackList.options.offset - index - 1;
            }
        }
    }

    return queueCount;
}

export function getPlaybackQueueDuration(id?: number): number {
    const state = $get();
    const resolvedId = id ?? state.call?.id ?? state.callPrevious?.id;
    let queueDuration = 0;

    if (resolvedId && state.playbackList) {
        const index = state.playbackList.results.findIndex((call) => call.id === resolvedId);

        if (index !== -1) {
            if (state.playbackList.options.sort === -1) {
                queueDuration = state.playbackList.results.slice(0, index)
                    .map((call) => call.audioDuration || 0)
                    .reduce((sum, duration) => sum + duration, 0);
            } else {
                queueDuration = state.playbackList.results.slice(index + 1)
                    .map((call) => call.audioDuration || 0)
                    .reduce((sum, duration) => sum + duration, 0);
            }
        }
    }

    return queueDuration;
}

// ---------------------------------------------------------------------------
// Transform call (attach system/talkgroup metadata + unit labels)
// ---------------------------------------------------------------------------

function transformCall(call: Call): Call {
    const state = $get();

    if (call && Array.isArray(state.config?.systems)) {
        call.systemData = state.config.systems.find((system) => system.id === call.system);

        if (Array.isArray(call.systemData?.talkgroups)) {
            call.talkgroupData = call.systemData?.talkgroups.find((talkgroup) => talkgroup.id === call.talkgroup);
        }

        if (call.talkgroupData?.frequency) {
            call.frequency = call.talkgroupData.frequency;
        }

        if (Array.isArray(call.sources)) {
            const sysUnits = state.unitsIndex[call.system] ?? {};
            call.sources = call.sources.map((source: CallSource) => {
                if (source.src != null) {
                    source.label = sysUnits[source.src];
                }
                return source;
            });
        }
    }

    return call;
}

// ---------------------------------------------------------------------------
// Unit label propagation
// ---------------------------------------------------------------------------

function propagateUnitLabels(): void {
    const state = $get();
    const calls: (Call | null)[] = [state.call, state.callPrevious, ...state.callQueue];
    for (const call of calls) {
        if (call) {
            propagateUnitLabelsInCall(call);
        }
    }
}

function propagateUnitLabelsInCall(call: Call): void {
    if (!call || !Array.isArray(call.sources)) return;
    const state = $get();

    call.sources.forEach((source) => {
        if (typeof source.src !== 'number') return;
        source.label = state.unitsIndex?.[call.system]?.[source.src];
    });
}

// ---------------------------------------------------------------------------
// Category rebuilding
// ---------------------------------------------------------------------------

function rebuildCategories(): void {
    const state = $get();
    const config = state.config;
    const lfm = state.livefeedMap;

    let categories: Category[] = Object.keys(config.groups || []).map((label) => {
        const groupEntry = config.groups[label]!;
        const allOff = Object.keys(groupEntry).map((sys) => +sys)
            .every((sys: number) => groupEntry[sys]
                ?.every((tg) => lfm[sys] && !lfm[sys]![tg]!.active) ?? true);

        const allOn = Object.keys(groupEntry).map((sys) => +sys)
            .every((sys: number) => groupEntry[sys]
                ?.every((tg) => lfm[sys] && lfm[sys]![tg]!.active) ?? true);

        const status: CategoryStatus = allOff ? CatStatus.Off : allOn ? CatStatus.On : CatStatus.Partial;

        return { label, status, type: CategoryType.Group };
    });

    if (config.tagsToggle) {
        categories = categories.concat(Object.keys(config.tags || []).map((label) => {
            const tagEntry = config.tags[label]!;
            const allOff = Object.keys(tagEntry).map((sys) => +sys)
                .every((sys: number) => tagEntry[sys]
                    ?.every((tg) => lfm[sys] && !lfm[sys]![tg]!.active) ?? true);

            const allOn = Object.keys(tagEntry).map((sys) => +sys)
                .every((sys: number) => tagEntry[sys]
                    ?.every((tg) => lfm[sys] && lfm[sys]![tg]!.active) ?? true);

            const status: CategoryStatus = allOff ? CatStatus.Off : allOn ? CatStatus.On : CatStatus.Partial;

            return { label, status, type: CategoryType.Tag };
        }));
    }

    categories.sort((a, b) => a.label.localeCompare(b.label));

    $set({ categories });
}

// ---------------------------------------------------------------------------
// Livefeed map rebuilding
// ---------------------------------------------------------------------------

function rebuildLivefeedMap(): void {
    const state = $get();
    const config = state.config;
    const currentLfm = state.livefeedMap;
    const currentCategories = state.categories;

    const lfm = config.systems.reduce((sysMap, sys) => {
        sysMap[sys.id] = sys.talkgroups.reduce((tgMap, tg) => {
            const group = currentCategories.find((cat) => cat.label === tg.group);
            const tag = currentCategories.find((cat) => cat.label === tg.tag);

            tgMap[tg.id] = (currentLfm[sys.id] && currentLfm[sys.id]![tg.id])
                ? currentLfm[sys.id]![tg.id]!
                : {
                    active: !(group?.status === CatStatus.Off || tag?.status === CatStatus.Off),
                } as Livefeed;

            return tgMap;
        }, sysMap[sys.id] || {} as { [key: number]: Livefeed });
        return sysMap;
    }, {} as LivefeedMap);

    if (livefeedMapPriorToHoldSystem != null) {
        livefeedMapPriorToHoldSystem = lfm;
    } else if (livefeedMapPriorToHoldTalkgroup != null) {
        livefeedMapPriorToHoldTalkgroup = lfm;
    } else {
        $set({ livefeedMap: lfm });
    }

    doSaveLivefeedMap();
    rebuildCategories();
}

// ---------------------------------------------------------------------------
// Units index rebuilding
// ---------------------------------------------------------------------------

function rebuildUnitsIndex(): void {
    const state = $get();
    const unitsIndex = state.config.systems.reduce((idx, sys) => {
        if (!idx[sys.id]) idx[sys.id] = {};

        sys.units.forEach((unit) => {
            idx[sys.id]![unit.id] = unit.label;
        });
        return idx;
    }, {} as UnitsIndex);

    $set({ unitsIndex });
}

// Clear pending-unit-label entries that have been confirmed by the server,
// and drop any that have been pending too long (stale / lost ack).
const PENDING_LABEL_STALE_MS = 15000;

function reconcilePendingUnitLabels(): void {
    const state = $get();
    const { pendingUnitLabels, unitsIndex } = state;
    const systemIds = Object.keys(pendingUnitLabels);
    if (systemIds.length === 0) return;

    const now = Date.now();
    const next: typeof pendingUnitLabels = {};
    let changed = false;

    for (const sysKey of systemIds) {
        const sysId = +sysKey;
        const sysPending = pendingUnitLabels[sysId]!;
        const sysIndex = unitsIndex[sysId] ?? {};
        const keptSys: { [unitId: number]: { label: string | null; ts: number } } = {};

        for (const unitKey of Object.keys(sysPending)) {
            const unitId = +unitKey;
            const entry = sysPending[unitId]!;
            const serverLabel = sysIndex[unitId];
            const serverLabelPresent = typeof serverLabel === 'string' && serverLabel.length > 0;

            const confirmed = entry.label === null
                ? !serverLabelPresent  // delete confirmed when server has no label
                : serverLabelPresent && serverLabel === entry.label;

            const stale = now - entry.ts > PENDING_LABEL_STALE_MS;

            if (confirmed || stale) {
                changed = true;
                if (stale && !confirmed) {
                    console.warn(
                        `[rdio-scanner] Pending unit label for system=${sysId} unit=${unitId} went stale after ${PENDING_LABEL_STALE_MS}ms without server confirmation.`,
                    );
                }
                continue;
            }
            keptSys[unitId] = entry;
        }

        if (Object.keys(keptSys).length > 0) {
            next[sysId] = keptSys;
        } else {
            changed = true;
        }
    }

    if (changed) {
        $set({ pendingUnitLabels: next });
    }
}

// ---------------------------------------------------------------------------
// localStorage save helpers
// ---------------------------------------------------------------------------

function doSaveLivefeedMap(): void {
    const state = $get();
    const lfm = Object.keys(state.livefeedMap).reduce((sysMap: { [key: number]: { [key: number]: boolean } }, sys: string) => {
        sysMap[+sys] = Object.keys(state.livefeedMap[+sys]!).reduce((tgMap: { [key: number]: boolean }, tg: string) => {
            tgMap[+tg] = state.livefeedMap[+sys]![+tg]!.active;
            return tgMap;
        }, {});
        return sysMap;
    }, {});

    saveLivefeedMap(instanceId, lfm);
    saveLivefeedUnitsMap(instanceId, state.livefeedUnitsMap);
}

function doSaveQueueState(): void {
    const state = $get();
    if (!state.queuePersistEnabled || state.callQueue.length === 0) {
        return;
    }

    const persistState: QueuePersistState = {
        callIds: state.callQueue.map((call) => call.id),
        timestamp: Date.now(),
        livefeedMode: state.livefeedMode,
        livefeedMap: state.livefeedMap,
        livefeedUnitsMap: state.livefeedUnitsMap,
    };

    saveQueueState(instanceId, persistState);
}

// ---------------------------------------------------------------------------
// Queue persistence restore
// ---------------------------------------------------------------------------

function restoreQueueState(): void {
    const state = $get();
    if (!state.queuePersistEnabled) {
        return;
    }

    const savedState = readQueueState(instanceId);
    if (!savedState) {
        return;
    }

    // Check 4-hour time limit
    const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
    if (savedState.timestamp < fourHoursAgo) {
        clearQueueState(instanceId);
        return;
    }

    if (savedState.callIds && savedState.callIds.length > 0) {
        if (savedState.livefeedMode) {
            $set({ livefeedMode: savedState.livefeedMode });
        }
        if (savedState.livefeedMap) {
            $set({ livefeedMap: savedState.livefeedMap });
        }
        if (savedState.livefeedUnitsMap) {
            $set({ livefeedUnitsMap: savedState.livefeedUnitsMap });
        }

        if (savedState.livefeedMode === LivefeedMode.Online) {
            $get().startLivefeed();
        }

        queuePersistRestoring = true;

        fetchCallsBulk(savedState.callIds);
    }
}

function fetchCallsBulk(ids: number[]): void {
    if (ids.length === 0) {
        return;
    }

    const batchSize = 25;
    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
        batches.push(ids.slice(i, i + batchSize));
    }

    queuePersistPendingBatches = batches.slice(1);

    if (batches.length > 0) {
        wsSend(WebSocketCommand.BulkCall, batches[0], WebSocketCallFlag.Play);
    }
}

// ---------------------------------------------------------------------------
// Playback navigation
// ---------------------------------------------------------------------------

function playbackNextCall(): boolean {
    const state = $get();

    if (state.call || state.livefeedMode !== LivefeedMode.Playback || !state.playbackList || state.playbackPending) {
        return false;
    }

    const index = state.playbackList.results.findIndex((call) => call.id === state.callPrevious?.id);

    if (state.playbackList.options.sort === -1) {
        if (index === -1) {
            return $get().loadAndPlay(state.playbackList.results[state.playbackList.results.length - 1]!.id);
        }

        if (index === 0) {
            if (state.playbackList.options.offset < state.playbackList.options.limit) {
                if (playbackRefreshing) {
                    $get().stopPlaybackMode();

                    if (state.config.playbackGoesLive) {
                        $get().startLivefeed();
                    }
                } else {
                    playbackRefreshing = true;
                    $get().searchCalls(state.playbackList.options);
                }

                return false;
            }

            $get().searchCalls({
                ...state.playbackList.options,
                offset: state.playbackList.options.offset - state.playbackList.options.limit,
            });
            return false;
        }

        return $get().loadAndPlay(state.playbackList.results[index - 1]!.id);
    }

    if (index === -1) {
        return $get().loadAndPlay(state.playbackList.results[0]!.id);

    } else if (index === state.playbackList.results.length - 1) {
        if (state.playbackList.options.offset < (state.playbackList.count - state.playbackList.options.limit)) {
            $get().searchCalls({
                ...state.playbackList.options,
                offset: state.playbackList.options.offset + state.playbackList.options.limit,
            });
        } else if (playbackRefreshing) {
            $get().stopPlaybackMode();

            if (state.config.playbackGoesLive) {
                $get().startLivefeed();
            }
        } else {
            playbackRefreshing = true;
            $get().searchCalls(state.playbackList.options);
        }

        return false;
    }

    return $get().loadAndPlay(state.playbackList.results[index + 1]!.id);
}

// ---------------------------------------------------------------------------
// parseMessage — the big switch statement from parseWebsocketMessage
// ---------------------------------------------------------------------------

function parseMessage(command: string, payload: unknown, flags?: string): void {
    switch (command) {
        case WebSocketCommand.Call: {
            if (payload !== null) {
                const call = payload as Call;
                const flag = flags;

                if (flag === WebSocketCallFlag.Download) {
                    download(payload as Call);
                } else if (flag === WebSocketCallFlag.Play && call.id === $get().playbackPending) {
                    // User-initiated playback (typically from search).
                    $set({ playbackPending: null });
                    const transformed = transformCall(call);
                    const sq = $get().searchQueue;
                    if (sq.active && sq.currentCallId === call.id) {
                        // Search-queue playback -- bypass the normal queue and
                        // play immediately, ignoring any paused state.
                        stopAudio();
                        $get().play(transformed, { skipHistory: false, force: true });
                    } else {
                        $get().queue(transformed, { priority: true });
                    }
                } else {
                    // Livefeed call arriving. If a search queue is active, buffer
                    // it instead of enqueuing so it doesn't interrupt the user.
                    const sq = $get().searchQueue;
                    if (sq.active) {
                        $set({
                            searchQueue: {
                                ...sq,
                                pendingLivefeedCalls: [...sq.pendingLivefeedCalls, transformCall(call)],
                            },
                        });
                    } else {
                        $get().queue(transformCall(call));
                    }
                }
            }
            break;
        }

        case WebSocketCommand.BulkCall: {
            if (Array.isArray(payload)) {
                const calls = payload as Call[];

                // If we're restoring persisted calls after a page reload,
                // pause BEFORE enqueueing. queue() auto-plays when the
                // scanner isn't already occupied, and at restore time the
                // scanner is idle (no audioSource, no call, no pause), so
                // the first call would get auto-pulled out of the queue.
                // Worse, on a fresh page load the audio context hasn't been
                // created yet (it's bootstrapped on the first user gesture),
                // so the play() path sets state.call and then silently fails
                // to decode audio -- leaving the UI showing the call while
                // unpause is a no-op because state.call is already set.
                // Pausing first makes queue() buffer everything and leaves
                // the full queue intact for when the user hits play.
                const restoring = queuePersistRestoring && calls.length > 0;
                if (restoring) {
                    $get().pause(true);
                }

                calls.forEach((call) => {
                    $get().queue(transformCall(call));
                });

                if (queuePersistRestoring) {
                    queuePersistRestoring = false;
                    clearQueueState(instanceId);
                }

                if (queuePersistPendingBatches.length > 0) {
                    const nextBatch = queuePersistPendingBatches.shift();
                    if (nextBatch) {
                        wsSend(WebSocketCommand.BulkCall, nextBatch, flags);
                    }
                }
            }
            break;
        }

        case WebSocketCommand.Config: {
            const rawConfig = payload as Record<string, unknown>;

            const config: Config = {
                branding: typeof rawConfig.branding === 'string' ? rawConfig.branding : '',
                dimmerDelay: typeof rawConfig.dimmerDelay === 'number' ? rawConfig.dimmerDelay : 5000,
                groups: rawConfig.groups !== null && typeof rawConfig.groups === 'object'
                    ? rawConfig.groups as Config['groups'] : {},
                keypadBeeps: rawConfig.keypadBeeps !== null && typeof rawConfig.keypadBeeps === 'object'
                    ? rawConfig.keypadBeeps as KeypadBeeps : false,
                playbackGoesLive: typeof rawConfig.playbackGoesLive === 'boolean'
                    ? rawConfig.playbackGoesLive : false,
                showListenersCount: typeof rawConfig.showListenersCount === 'boolean'
                    ? rawConfig.showListenersCount : false,
                systems: Array.isArray(rawConfig.systems) ? (rawConfig.systems as System[]).slice() : [],
                tags: rawConfig.tags !== null && typeof rawConfig.tags === 'object'
                    ? rawConfig.tags as Config['tags'] : {},
                tagsToggle: typeof rawConfig.tagsToggle === 'boolean' ? rawConfig.tagsToggle : false,
                time12hFormat: typeof rawConfig.time12hFormat === 'boolean' ? rawConfig.time12hFormat : false,
            };

            if (typeof rawConfig.afs === 'string' && (rawConfig.afs as string).length) {
                config.afs = rawConfig.afs as string;
            }

            $set({ config });

            rebuildLivefeedMap();
            rebuildUnitsIndex();
            propagateUnitLabels();
            reconcilePendingUnitLabels();

            const state = $get();

            if (state.livefeedMode === LivefeedMode.Online) {
                state.startLivefeed();
            }

            // Consume the one-time restoration opportunity on first CFG
            if (!queueRestoreOpportunityConsumed) {
                queueRestoreOpportunityConsumed = true;
                if ($get().queuePersistEnabled) {
                    restoreQueueState();
                }
            }

            // Save the password that got us authenticated
            if (pendingPassword) {
                savePin(pendingPassword);
                pendingPassword = '';
            }

            $set({
                authRequired: false,
                holdSys: !!livefeedMapPriorToHoldSystem,
                holdTg: !!livefeedMapPriorToHoldTalkgroup,
            });

            break;
        }

        case WebSocketCommand.Expired:
            $set({ authRequired: true, authExpired: true });
            break;

        case WebSocketCommand.ListCall: {
            const list = payload as PlaybackList | null;

            if (list) {
                list.results = list.results.map((call) => transformCall(call));
                $set({ playbackList: list });

                if ($get().livefeedMode === LivefeedMode.Playback) {
                    playbackNextCall();
                }
            }

            break;
        }

        case WebSocketCommand.ListenersCount:
            $set({ listeners: payload as number });
            break;

        case WebSocketCommand.Max:
            $set({ authRequired: true, authTooMany: true });
            break;

        case WebSocketCommand.Pin: {
            // Try auto-authenticating from saved PIN
            const savedPin = readPin();
            if (savedPin) {
                clearPin();
                pendingPassword = savedPin;
                wsSend(WebSocketCommand.Pin, window.btoa(savedPin));
            } else {
                $set({ authRequired: true });
            }
            break;
        }

        case WebSocketCommand.Version: {
            const data = payload as Record<string, unknown> | null;

            if (data !== null && typeof data === 'object') {
                const branding = data['branding'];

                if (typeof branding === 'string') {
                    const state = $get();
                    $set({ config: { ...state.config, branding } });
                }
            }

            break;
        }
    }
}

// ---------------------------------------------------------------------------
// Initial livefeed map hydration from localStorage
// ---------------------------------------------------------------------------

function readAndHydrateLivefeedMap(): LivefeedMap {
    const stored = readLivefeedMap(instanceId);
    const lfm: LivefeedMap = {};

    Object.keys(stored).forEach((sys: string) => {
        const sysEntry = stored[+sys];
        if (!sysEntry) return;
        Object.keys(sysEntry).forEach((tg: string) => {
            if (!lfm[+sys]) lfm[+sys] = {};
            if (!lfm[+sys]![+tg]) lfm[+sys]![+tg] = {} as Livefeed;
            lfm[+sys]![+tg]!.active = sysEntry[+tg] ?? false;
        });
    });

    return lfm;
}

// ---------------------------------------------------------------------------
// Compute initial state from localStorage
// ---------------------------------------------------------------------------

instanceId = getInstanceId();
const initialLfm = readAndHydrateLivefeedMap();
const initialUnitsMap = readLivefeedUnitsMap(instanceId);
const initialQueuePersistEnabled = readQueuePersistEnabled(instanceId);

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export const useScannerStore = create<ScannerState & ScannerActions>()((set, get) => ({
    // -- State ---------------------------------------------------------------
    linked: false,
    config: defaultConfig,
    unitsIndex: {},
    pendingUnitLabels: {},
    authRequired: false,
    authExpired: false,
    authTooMany: false,
    livefeedMode: LivefeedMode.Offline,
    livefeedMap: initialLfm,
    livefeedUnitsMap: initialUnitsMap,
    categories: [],
    call: null,
    callPrevious: null,
    callHistory: [],
    callQueue: [],
    searchQueue: {
        active: false,
        currentCallId: null,
        queuedCallIds: [],
        playAll: false,
        pendingLivefeedCalls: [],
        preState: null,
    } as SearchQueueState,
    callTime: 0,
    paused: false,
    pausedAt: null,
    holdSys: false,
    holdTg: false,
    queuePersistEnabled: initialQueuePersistEnabled,
    listeners: 0,
    playbackList: null,
    playbackPending: null,

    // -- Actions -------------------------------------------------------------

    initialize(): void {
        bootstrapAudio();
        openWebSocket();
    },

    destroy(): void {
        closeWebSocket();
        stopAudio();

        if (skipDelayTimer !== undefined) {
            clearTimeout(skipDelayTimer);
            skipDelayTimer = undefined;
        }

        livefeedMapPriorToHoldSystem = undefined;
        livefeedMapPriorToHoldTalkgroup = undefined;
        playbackRefreshing = false;
        queuePersistPendingBatches = [];
        queuePersistRestoring = false;
        queueRestoreOpportunityConsumed = false;
    },

    authenticate(password: string): void {
        pendingPassword = password;
        wsSend(WebSocketCommand.Pin, window.btoa(password));
    },

    avoid(options: AvoidOptions = {}): void {
        const state = get();
        const lfm = state.livefeedMap;

        const clearTimer = (livefeed: Livefeed): void => {
            livefeed.minutes = undefined;
            if (livefeed.timer !== undefined) {
                clearTimeout(livefeed.timer);
                livefeed.timer = undefined;
            }
        };

        const setTimer = (livefeed: Livefeed, minutes: number): void => {
            livefeed.minutes = minutes;
            livefeed.timer = setTimeout(() => {
                livefeed.active = true;
                livefeed.minutes = undefined;
                livefeed.timer = undefined;

                rebuildCategories();
                doSaveLivefeedMap();

                // Force re-render by updating the map reference
                set({ livefeedMap: { ...$get().livefeedMap } });
            }, minutes * 60 * 1000);
        };

        if (livefeedMapPriorToHoldSystem) {
            livefeedMapPriorToHoldSystem = undefined;
        }

        if (livefeedMapPriorToHoldTalkgroup) {
            livefeedMapPriorToHoldTalkgroup = undefined;
        }

        if (typeof options.all === 'boolean') {
            Object.keys(lfm).map((sys: string) => +sys).forEach((sys: number) => {
                Object.keys(lfm[sys]!).map((tg: string) => +tg).forEach((tg: number) => {
                    const livefeed = lfm[sys]![tg]!;
                    clearTimer(livefeed);
                    livefeed.active = typeof options.status === 'boolean' ? options.status : !!options.all;
                });
            });

        } else if (options.call) {
            const livefeed = lfm[options.call.system]![options.call.talkgroup]!;
            clearTimer(livefeed);
            livefeed.active = typeof options.status === 'boolean' ? options.status : !livefeed.active;
            if (typeof options.minutes === 'number') setTimer(livefeed, options.minutes);

        } else if (options.system && options.talkgroup) {
            const livefeed = lfm[options.system.id]![options.talkgroup.id]!;
            clearTimer(livefeed);
            livefeed.active = typeof options.status === 'boolean' ? options.status : !livefeed.active;
            if (typeof options.minutes === 'number') setTimer(livefeed, options.minutes);

        } else if (options.system && !options.talkgroup) {
            const sys = options.system.id;
            Object.keys(lfm[sys]!).map((tg: string) => +tg).forEach((tg: number) => {
                const livefeed = lfm[sys]![tg]!;
                clearTimer(livefeed);
                livefeed.active = typeof options.status === 'boolean' ? options.status : !livefeed.active;
            });

        } else {
            const call = state.call || state.callPrevious;
            if (call) {
                const livefeed = lfm[call.system]![call.talkgroup]!;
                clearTimer(livefeed);
                livefeed.active = typeof options.status === 'boolean' ? options.status : !livefeed.active;
                if (typeof options.minutes === 'number') setTimer(livefeed, options.minutes);
            }
        }

        set({ livefeedMap: { ...lfm } });

        if (get().livefeedMode !== LivefeedMode.Playback) {
            cleanQueue();
        }

        rebuildCategories();
        doSaveLivefeedMap();

        if (get().livefeedMode === LivefeedMode.Online) {
            get().startLivefeed();
        }

        set({
            holdSys: false,
            holdTg: false,
        });
    },

    avoidUnit(unitId: number): void {
        const state = get();
        const newUnitsMap = { ...state.livefeedUnitsMap };

        if (newUnitsMap[unitId]) {
            delete newUnitsMap[unitId];
        } else {
            newUnitsMap[unitId] = true;
        }

        set({ livefeedUnitsMap: newUnitsMap });

        doSaveLivefeedMap();

        if (get().livefeedMode === LivefeedMode.Online) {
            get().startLivefeed();
        }
    },

    isAvoided(call: Call): boolean {
        const state = get();
        return !!state.livefeedMap[call.system] && state.livefeedMap[call.system]![call.talkgroup]?.active !== true;
    },

    isAvoidedTimer(call: Call): number {
        const state = get();
        if (!!state.livefeedMap[call.system] && state.livefeedMap[call.system]![call.talkgroup]?.minutes !== undefined) {
            return state.livefeedMap[call.system]![call.talkgroup]?.minutes || 0;
        }
        return 0;
    },

    isPatched(call: Call): boolean {
        const state = get();
        return get().isAvoided(call) && call.patches.some((tg) => {
            return !!state.livefeedMap[call.system] && (state.livefeedMap[call.system]![tg]?.active || false);
        });
    },

    beep(style: BeepStyle = BeepStyleEnum.Activate): Promise<void> {
        const state = get();
        if (!state.config.keypadBeeps) {
            return Promise.resolve();
        }

        // Use the module-level beepContext directly (audioManager has its
        // own context that was never bootstrapped).
        return beepDirect(style, state.config.keypadBeeps as unknown as Record<string, Beep[]>);
    },

    holdSystem(options?: { resubscribe?: boolean }): void {
        const state = get();
        const call = state.call || state.callPrevious;

        if (call && state.livefeedMap) {
            if (livefeedMapPriorToHoldSystem) {
                set({ livefeedMap: livefeedMapPriorToHoldSystem });
                livefeedMapPriorToHoldSystem = undefined;

            } else {
                if (livefeedMapPriorToHoldTalkgroup) {
                    get().holdTalkgroup({ resubscribe: false });
                }

                livefeedMapPriorToHoldSystem = state.livefeedMap;

                const currentLfm = get().livefeedMap;

                const newLfm = Object.keys(currentLfm).map((sys) => +sys).reduce((sysMap, sys) => {
                    const sysLfm = currentLfm[sys]!;
                    const allOn = Object.keys(sysLfm).map((tg) => +tg)
                        .every((tg) => !sysLfm[tg]);

                    sysMap[sys] = Object.keys(sysLfm).map((tg) => +tg).reduce((tgMap, tg) => {
                        if (sysLfm[tg]!.timer !== undefined) {
                            clearTimeout(sysLfm[tg]!.timer);
                        }

                        tgMap[tg] = {
                            active: sys === call.system ? allOn || sysLfm[tg]!.active : false,
                        } as Livefeed;

                        return tgMap;
                    }, {} as { [key: number]: Livefeed });

                    return sysMap;
                }, {} as LivefeedMap);

                set({ livefeedMap: newLfm });

                cleanQueue();
            }

            rebuildCategories();

            if (typeof options?.resubscribe !== 'boolean' || options.resubscribe) {
                if (get().livefeedMode === LivefeedMode.Online) {
                    get().startLivefeed();
                }
            }

            set({
                holdSys: !!livefeedMapPriorToHoldSystem,
                holdTg: false,
            });
        }
    },

    holdTalkgroup(options?: { resubscribe?: boolean }): void {
        const state = get();
        const call = state.call || state.callPrevious;

        if (call && state.livefeedMap) {
            if (livefeedMapPriorToHoldTalkgroup) {
                set({ livefeedMap: livefeedMapPriorToHoldTalkgroup });
                livefeedMapPriorToHoldTalkgroup = undefined;

            } else {
                if (livefeedMapPriorToHoldSystem) {
                    get().holdSystem({ resubscribe: false });
                }

                livefeedMapPriorToHoldTalkgroup = state.livefeedMap;

                const currentLfm = get().livefeedMap;

                const newLfm = Object.keys(currentLfm).map((sys) => +sys).reduce((sysMap, sys) => {
                    const sysLfm = currentLfm[sys]!;
                    sysMap[sys] = Object.keys(sysLfm).map((tg) => +tg).reduce((tgMap, tg) => {
                        if (sysLfm[tg]!.timer !== undefined) {
                            clearTimeout(sysLfm[tg]!.timer);
                        }

                        tgMap[tg] = {
                            active: sys === call.system ? tg === call.talkgroup : false,
                        } as Livefeed;

                        return tgMap;
                    }, {} as { [key: number]: Livefeed });

                    return sysMap;
                }, {} as LivefeedMap);

                set({ livefeedMap: newLfm });

                cleanQueue();
            }

            rebuildCategories();

            if (typeof options?.resubscribe !== 'boolean' || options.resubscribe) {
                if (get().livefeedMode === LivefeedMode.Online) {
                    get().startLivefeed();
                }
            }

            set({
                holdSys: false,
                holdTg: !!livefeedMapPriorToHoldTalkgroup,
            });
        }
    },

    livefeed(): void {
        const state = get();
        if (state.livefeedMode === LivefeedMode.Offline) {
            get().startLivefeed();
        } else if (state.livefeedMode === LivefeedMode.Online) {
            get().stopLivefeed();
        } else if (state.livefeedMode === LivefeedMode.Playback) {
            get().stopPlaybackMode();
        }
    },

    loadAndDownload(id: number): void {
        if (!id) {
            return;
        }
        getCall(id, WebSocketCallFlag.Download);
    },

    loadAndPlay(id: number): boolean {
        if (!id) {
            return false;
        }

        if (skipDelayTimer !== undefined) {
            clearTimeout(skipDelayTimer);
            skipDelayTimer = undefined;
        }

        set({ playbackPending: id });

        stopAudio();

        const state = get();

        if (state.livefeedMode === LivefeedMode.Offline) {
            set({ livefeedMode: LivefeedMode.Playback });

            if (livefeedMapPriorToHoldSystem) {
                get().holdSystem({ resubscribe: false });
            }

            if (livefeedMapPriorToHoldTalkgroup) {
                get().holdTalkgroup({ resubscribe: false });
            }
        }

        getCall(id, WebSocketCallFlag.Play);
        return true;
    },

    pause(status?: boolean): void {
        const state = get();
        const newPaused = status !== undefined ? status : !state.paused;

        if (newPaused) {
            stopAudioTimeLoop();
            // Write current time to Zustand for pause display
            set({
                paused: true,
                pausedAt: new Date(),
                callTime: currentAudioTime,
            });

            void audioContext?.suspend();
        } else {
            set({
                paused: false,
                pausedAt: null,
            });

            void audioContext?.resume();
            startAudioTimeLoop();

            get().play();
        }
    },

    play(call?: Call, options?: { skipHistory?: boolean; force?: boolean }): boolean {
        const state = get();

        // Allow `force: true` to override the paused guard. This is used by the
        // search queue so calls can be played while the scanner is nominally
        // paused (e.g. the user paused livefeed, then clicked ▶ in search).
        if ((state.paused && !options?.force) || skipDelayTimer !== undefined) {
            return false;
        }

        // If we're forcing playback while the audio context is suspended
        // (because the scanner is paused), resume it so audio actually plays.
        if (options?.force && audioContext?.state === 'suspended') {
            void audioContext.resume();
        }

        let currentCall: Call | null = null;

        if (call?.audio) {
            if (state.call) {
                stopAudio({ emit: false });
            }
            currentCall = call;

        } else if (state.call) {
            return false;

        } else {
            const queue = [...state.callQueue];
            currentCall = queue.shift() || null;
            set({ callQueue: queue });
        }

        if (!currentCall?.audio) {
            return false;
        }

        // Push to call history (most recent first, dedup, cap at 30)
        // Skip when replaying from history to avoid rotating the array.
        if (options?.skipHistory) {
            set({ call: currentCall });
        } else {
            const prevHistory = get().callHistory;
            const deduped = prevHistory.filter((c) => c.id !== currentCall!.id);
            const newHistory = [currentCall!, ...deduped].slice(0, 30);
            set({ call: currentCall, callHistory: newHistory });
        }

        // In the Angular service, queueCount and queueDuration are emitted.
        // In Zustand, consumers derive these from state directly.

        const audioData = currentCall.audio.data;
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const arrayBufferView = new Uint8Array(arrayBuffer);

        for (let i = 0; i < audioData.length; i++) {
            arrayBufferView[i] = audioData[i]!;
        }

        audioContext?.decodeAudioData(arrayBuffer, (buffer) => {
            if (!audioContext || audioSource || !get().call) {
                return;
            }

            audioBuffer = buffer;
            audioSource = audioContext.createBufferSource();
            audioSource.buffer = buffer;
            audioSource.connect(audioContext.destination);
            audioSource.onended = () => {
                stopAudioTimeLoop();
                currentAudioTime = buffer.duration;
                set({ callTime: buffer.duration });

                const sq = get().searchQueue;
                if (sq.active) {
                    // Auto-advance within the search queue when playAll is on.
                    // When playAll is off, a single-call play ended, so exit.
                    if (sq.playAll && sq.queuedCallIds.length > 0) {
                        // Small delay so the LCD briefly shows the final state
                        // of the ended call before the next begins.
                        stopAudio();
                        skipDelayTimer = setTimeout(() => {
                            skipDelayTimer = undefined;
                            get().skipSearchQueue();
                        }, 1000);
                    } else {
                        // Queue exhausted (or single-play) -- exit the queue.
                        stopAudio();
                        skipDelayTimer = setTimeout(() => {
                            skipDelayTimer = undefined;
                            get().exitSearchQueue();
                        }, 1000);
                    }
                } else {
                    get().skip({ delay: true });
                }
            };
            audioSource.start();
            audioSourceStartTime = audioContext.currentTime;

            set({ callTime: 0 });
            currentAudioTime = 0;

            // Start rAF-based time updates (bypasses Zustand for smooth 60fps)
            startAudioTimeLoop();
        }, () => {
            // Decode error -- skip
            get().skip({ delay: false });
        });

        return true;
    },

    queue(call: Call, options?: { priority?: boolean }): void {
        const state = get();

        if (!call?.audio || state.livefeedMode === LivefeedMode.Offline) {
            return;
        }

        let newQueue: Call[];
        if (options?.priority) {
            newQueue = [call, ...state.callQueue];
        } else {
            newQueue = [...state.callQueue, call];
        }

        set({ callQueue: newQueue });

        if (audioSource || state.call || state.paused || skipDelayTimer !== undefined) {
            // Don't auto-play; queue update is reflected in state
        } else {
            get().play();
        }

        doSaveQueueState();
    },

    replay(): void {
        const state = get();
        get().play(state.call || state.callPrevious || undefined);
    },

    searchCalls(options: SearchOptions): void {
        wsSend(WebSocketCommand.ListCall, options);
    },

    seek(seconds: number): boolean {
        const state = get();

        if (!state.call || !audioSource || !audioContext || !audioBuffer) {
            return false;
        }

        const prevOnEnded = audioSource.onended;
        audioSource.onended = null;
        audioSource.stop();

        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioContext.destination);
        audioSource.onended = prevOnEnded;
        audioSource.start(0, seconds);

        audioSourceStartTime = audioContext.currentTime - seconds;
        currentAudioTime = seconds;
        set({ callTime: seconds });
        // Notify subscribers immediately so UI updates without waiting for next rAF
        audioTimeSubscribers.forEach((cb) => cb());

        return true;
    },

    skip(options?: { delay?: boolean }): boolean {
        // If we're already sitting in the inter-call delay (the 1s pause
        // between calls), a second skip press means "now, not later" --
        // cancel the pending delay and advance immediately, regardless of
        // what the caller asked for.
        const inDelay = skipDelayTimer !== undefined;
        const wantDelay = !inDelay && !!options?.delay;
        if (inDelay) {
            clearTimeout(skipDelayTimer);
            skipDelayTimer = undefined;
        }

        // When a search queue is active, skip jumps to the next queued search
        // result (or exits the queue if none remain).
        if (get().searchQueue.active) {
            stopAudio();
            if (wantDelay) {
                skipDelayTimer = setTimeout(() => {
                    skipDelayTimer = undefined;
                    get().skipSearchQueue();
                }, 1000);
            } else {
                get().skipSearchQueue();
            }
            return true;
        }

        const playNext = (): boolean => {
            if (get().livefeedMode === LivefeedMode.Playback) {
                return playbackNextCall();
            } else {
                return get().play();
            }
        };

        stopAudio();

        if (wantDelay) {
            skipDelayTimer = setTimeout(() => {
                skipDelayTimer = undefined;
                playNext();
            }, 1000);
            return true;
        }

        return playNext();
    },

    startLivefeed(): void {
        const state = get();

        const lfm = Object.keys(state.livefeedMap).reduce(
            (sysMap: { [key: number]: { [key: number]: boolean } }, sys) => {
                sysMap[+sys] = Object.keys(state.livefeedMap[+sys]!).reduce(
                    (tgMap: { [key: number]: boolean }, tg: string) => {
                        tgMap[+tg] = state.livefeedMap[+sys]![+tg]!.active;
                        return tgMap;
                    }, {},
                );
                return sysMap;
            }, {},
        );

        const payload = { ...lfm, units: state.livefeedUnitsMap };

        set({ livefeedMode: LivefeedMode.Online });

        wsSend(WebSocketCommand.LivefeedMap, payload);
    },

    stopLivefeed(): void {
        set({ livefeedMode: LivefeedMode.Offline });

        clearQueue();

        stopAudio();

        wsSend(WebSocketCommand.LivefeedMap, null);
    },

    stopPlaybackMode(): void {
        set({ livefeedMode: LivefeedMode.Offline, playbackList: null });

        playbackRefreshing = false;

        clearQueue();

        stopAudio();
    },

    toggleCategory(category: Category): void {
        if (!category) {
            return;
        }

        const state = get();
        const lfm = state.livefeedMap;

        const clearTimer = (livefeed: Livefeed): void => {
            livefeed.minutes = 0;
            if (livefeed.timer !== undefined) {
                clearTimeout(livefeed.timer);
                livefeed.timer = undefined;
            }
        };

        if (livefeedMapPriorToHoldSystem) {
            livefeedMapPriorToHoldSystem = undefined;
        }

        if (livefeedMapPriorToHoldTalkgroup) {
            livefeedMapPriorToHoldTalkgroup = undefined;
        }

        const status = category.status !== CatStatus.On;

        state.config?.systems.forEach((sys) => {
            sys.talkgroups?.forEach((tg) => {
                const livefeed = lfm[sys.id]?.[tg.id];
                if (!livefeed) return;

                if (category.type === CategoryType.Group && tg.group === category.label) {
                    clearTimer(livefeed);
                    livefeed.active = status;
                } else if (category.type === CategoryType.Tag && tg.tag === category.label) {
                    clearTimer(livefeed);
                    livefeed.active = status;
                }
            });
        });

        set({ livefeedMap: { ...lfm } });

        rebuildCategories();

        if (state.call && !lfm[state.call.system] && lfm[state.call.system]?.[state.call.talkgroup]) {
            clearTimer(lfm[state.call.system]![state.call.talkgroup]!);
            get().skip();
        }

        if (get().livefeedMode === LivefeedMode.Online) {
            get().startLivefeed();
        }

        doSaveLivefeedMap();

        cleanQueue();

        set({
            holdSys: false,
            holdTg: false,
        });
    },

    enableQueuePersist(enabled: boolean): void {
        set({ queuePersistEnabled: enabled });

        saveQueuePersistEnabled(instanceId, enabled);

        if (enabled) {
            doSaveQueueState();
        } else {
            clearQueueState(instanceId);
        }
    },

    // Mark a unit label save as in-flight. Rendered teal in the UI until
    // cleared (either by explicit clearUnitLabelPending() on failure, or by
    // reconcilePendingUnitLabels() when the server confirms via config emission).
    markUnitLabelPending(systemId: number, unitId: number, label: string | null): void {
        const state = get();
        const next = { ...state.pendingUnitLabels };
        next[systemId] = { ...(next[systemId] ?? {}) };
        next[systemId]![unitId] = { label, ts: Date.now() };
        set({ pendingUnitLabels: next });
    },

    clearUnitLabelPending(systemId: number, unitId: number): void {
        const state = get();
        if (!state.pendingUnitLabels[systemId]?.[unitId]) return;
        const next = { ...state.pendingUnitLabels };
        const sysMap = { ...(next[systemId] ?? {}) };
        delete sysMap[unitId];
        if (Object.keys(sysMap).length === 0) {
            delete next[systemId];
        } else {
            next[systemId] = sysMap;
        }
        set({ pendingUnitLabels: next });
    },

    // -----------------------------------------------------------------------
    // Search queue -- playing calls from the Search panel. See
    // SearchQueueState for architectural notes. The queue coexists with
    // livefeed: livefeed stays subscribed, but incoming calls are buffered
    // into pendingLivefeedCalls until the queue ends.
    // -----------------------------------------------------------------------

    playFromSearch(callId: number, playAll: boolean, laterCallIds: number[]): void {
        if (!callId) return;

        const state = get();

        // Capture pre-queue snapshot the FIRST time we enter the queue, not
        // on every subsequent click from the search page. pausedAt is
        // captured verbatim so the pause/livefeed-button elapsed timers
        // resume from their pre-queue values when the search queue exits --
        // the user experience is "this search queue never happened" w.r.t.
        // the live-feed timer readouts.
        const preState = state.searchQueue.active
            ? state.searchQueue.preState
            : {
                livefeedMode: state.livefeedMode,
                paused: state.paused,
                pausedAt: state.pausedAt,
            };

        // NOTE: we deliberately DO NOT clear callQueue here. The livefeed
        // queue stays intact behind the search queue; the QueueTicker shows
        // search calls first, then live calls, giving the user the sense of
        // one unified queue. When the search queue ends, exitSearchQueue
        // merges any calls buffered into pendingLivefeedCalls back onto the
        // (still-present) callQueue and restores preState.paused.

        if (skipDelayTimer !== undefined) {
            clearTimeout(skipDelayTimer);
            skipDelayTimer = undefined;
        }

        // Stop whatever is currently playing. stopAudio() sets call = null and
        // moves it into callPrevious, which is fine; the sticky LCD keeps the
        // display populated briefly.
        stopAudio();

        // If the scanner was paused, effectively "un-pause" for the duration
        // of the search queue. We'll restore preState.paused when the queue
        // ends. This also resumes the suspended audio context so force-play
        // actually produces sound.
        const wasPaused = state.paused;
        if (wasPaused) {
            set({ paused: false, pausedAt: null });
            if (audioContext?.state === 'suspended') {
                void audioContext.resume();
            }
            startAudioTimeLoop();
        }

        set({
            playbackPending: callId,
            searchQueue: {
                active: true,
                currentCallId: callId,
                queuedCallIds: playAll ? [...laterCallIds] : [],
                playAll,
                pendingLivefeedCalls: state.searchQueue.pendingLivefeedCalls,
                preState,
            },
        });

        // Ask the server for the call audio. When it arrives, the Call-handler
        // sees searchQueue.active and bypasses the normal queue, priority-
        // forcing the call into play (see parseMessage Call handler).
        getCall(callId, WebSocketCallFlag.Play);
    },

    skipSearchQueue(): boolean {
        const state = get();
        if (!state.searchQueue.active) return false;

        const queue = state.searchQueue.queuedCallIds;

        if (queue.length === 0) {
            // Nothing left to play -- exit queue mode.
            get().exitSearchQueue();
            return false;
        }

        const [nextId, ...rest] = queue;

        if (skipDelayTimer !== undefined) {
            clearTimeout(skipDelayTimer);
            skipDelayTimer = undefined;
        }

        stopAudio();

        set({
            playbackPending: nextId!,
            searchQueue: {
                ...state.searchQueue,
                currentCallId: nextId!,
                queuedCallIds: rest,
            },
        });

        getCall(nextId!, WebSocketCallFlag.Play);
        return true;
    },

    exitSearchQueue(): void {
        const state = get();
        if (!state.searchQueue.active) return;

        const preState = state.searchQueue.preState;
        const pendingLive = state.searchQueue.pendingLivefeedCalls;

        // Flush buffered livefeed calls back into callQueue in arrival order.
        // They'll play normally now that the search queue is inactive.
        const mergedQueue = [...state.callQueue, ...pendingLive];

        set({
            callQueue: mergedQueue,
            searchQueue: {
                active: false,
                currentCallId: null,
                queuedCallIds: [],
                playAll: state.searchQueue.playAll,  // preserve user's switch setting
                pendingLivefeedCalls: [],
                preState: null,
            },
        });

        // Restore pre-queue pause state if needed. We don't un-pause if the
        // user was paused before they hit ▶ from search -- that was their
        // deliberate state. We bypass pause() for the true case so we can
        // restore the ORIGINAL pausedAt (not "now"), which keeps the pause
        // and live-feed elapsed timers continuous across the search queue.
        if (preState) {
            if (preState.paused && !get().paused) {
                stopAudioTimeLoop();
                set({
                    paused: true,
                    pausedAt: preState.pausedAt ?? new Date(),
                    callTime: currentAudioTime,
                });
                void audioContext?.suspend();
            } else if (!preState.paused && get().paused) {
                // We shouldn't be paused right now, but just in case.
                get().pause(false);
            }
        }

        // If not paused, kick off playback of whatever's next (either a
        // buffered livefeed call or nothing, which is fine).
        if (!get().paused) {
            get().play();
        }
    },
}));
