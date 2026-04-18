/**
 * Extension API — exposes scanner state, events, playback controls, and DOM
 * slots on `window.rdioScannerExt` for browser extensions / userscripts.
 *
 * Call `installExtensionApi()` once after first render. The API subscribes to
 * the Zustand store once and fans out semantic events to all registered
 * handlers.
 */

import {
    useScannerStore,
    subscribeAudioTime,
    getAudioTimeSnapshot,
} from '../stores/scanner';
import type { Call } from '../types/scanner';

// ---------------------------------------------------------------------------
// Public event handler interface
// ---------------------------------------------------------------------------

export interface ExtensionEventHandlers {
    /**
     * Fired when a call enters the queue OR becomes active (direct-play).
     * Userscript uses this to kick off transcript prefetch. Fires once per
     * call identity transition — either into callQueue or into state.call.
     *
     * If a call goes queue → active, fires twice (once when queued, once
     * when promoted to active). This matches the Angular userscript's
     * observed behavior.
     */
    onCallLoaded?: (call: Call) => void;

    /**
     * Fired when audio playback of a call begins. Fires once per
     * activation (not on every tick).
     *
     * Gated on `(call as any).transcript != null`. If a call activates
     * before its transcript arrives, onCallStarted waits and fires when
     * the extension signals readiness via `notifyTranscriptReady()`.
     * Callers that want a pre-transcript signal should use onCallLoaded.
     */
    onCallStarted?: (call: Call) => void;

    /**
     * Fired when the active call transitions to null (playback finished,
     * skipped, or stopped).
     */
    onCallEnded?: () => void;

    /**
     * Fired on every playback time advancement while a transcribed call
     * is active. `time` is seconds since audio start (matches
     * state.callTime).
     */
    onCallTick?: (call: Call, time: number) => void;
}

// ---------------------------------------------------------------------------
// Extension API shape exposed on window
// ---------------------------------------------------------------------------

export interface RdioScannerExtensionApi {
    // ===== State =====
    getCurrentCall(): Call | null;
    getCurrentTime(): number;
    isPlaying(): boolean;

    // ===== Events =====
    subscribe(handlers: ExtensionEventHandlers): () => void;

    /**
     * Signal that a transcript has been populated on the given call.
     * If this call is currently active and onCallStarted was deferred
     * (because the transcript wasn't ready when the call activated),
     * this triggers the deferred onCallStarted emission.
     */
    notifyTranscriptReady(callId: number): void;

    // ===== Playback =====
    seek(seconds: number): void;
    pause(): void;
    play(): void;

    // ===== DOM slots (stable React-rendered anchors) =====
    dom: {
        transcriptSlot: HTMLElement | null;
        overlayRoot: HTMLElement;
    };

    // ===== Escape hatch (unstable — your problem if it changes) =====
    _store: typeof useScannerStore;
}

// Augment the global Window type
declare global {
    interface Window {
        rdioScannerExt?: RdioScannerExtensionApi;
    }
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type Subscription = ExtensionEventHandlers;

const subscriptions = new Set<Subscription>();

// Track call IDs we've already fired onCallLoaded for *per location*.
// Queue-loaded and active-loaded are tracked separately so a call that
// goes queue → active fires onCallLoaded twice (once when queued, once
// when promoted), matching the Angular userscript's observed behavior.
let queueLoadedCallIds = new Set<number>();
let activeLoadedCallIds = new Set<number>();

// Track whether onCallStarted has been deferred for the current active
// call (waiting for transcript to be populated by the extension).
let pendingCallStartedId: number | null = null;

// Audio time tick subscription (only active when there are subscribers with
// onCallTick).
let audioTickUnsub: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Event fan-out helpers
// ---------------------------------------------------------------------------

function emit<K extends keyof ExtensionEventHandlers>(
    event: K,
    ...args: Parameters<NonNullable<ExtensionEventHandlers[K]>>
): void {
    for (const sub of subscriptions) {
        try {
            const handler = sub[event] as ((...a: unknown[]) => void) | undefined;
            handler?.(...args);
        } catch (err) {
            console.error(`[rdioScannerExt] Error in ${event} handler:`, err);
        }
    }
}

function hasTickSubscribers(): boolean {
    for (const sub of subscriptions) {
        if (sub.onCallTick) return true;
    }
    return false;
}

function syncAudioTickSubscription(): void {
    const needsTick = hasTickSubscribers();

    if (needsTick && !audioTickUnsub) {
        audioTickUnsub = subscribeAudioTime(() => {
            const state = useScannerStore.getState();
            if (state.call) {
                emit('onCallTick', state.call, getAudioTimeSnapshot());
            }
        });
    } else if (!needsTick && audioTickUnsub) {
        audioTickUnsub();
        audioTickUnsub = null;
    }
}

// ---------------------------------------------------------------------------
// Store subscription — derives semantic events from state diffs
// ---------------------------------------------------------------------------

let storeUnsub: (() => void) | null = null;

/** Check whether the extension has populated a transcript on the call. */
function hasTranscript(call: Call): boolean {
    // The extension mutates a `transcript` property onto the Call object
    // at runtime — it doesn't exist in our type definitions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (call as any).transcript != null;
}

function installStoreSubscription(): void {
    if (storeUnsub) return;

    storeUnsub = useScannerStore.subscribe((state, prevState) => {
        // --- onCallLoaded: new calls entering the queue ---
        if (state.callQueue !== prevState.callQueue) {
            for (const call of state.callQueue) {
                if (!queueLoadedCallIds.has(call.id)) {
                    queueLoadedCallIds.add(call.id);
                    emit('onCallLoaded', call);
                }
            }
        }

        // --- Active call transitions ---
        const prevCall = prevState.call;
        const currCall = state.call;
        const prevId = prevCall?.id ?? null;
        const currId = currCall?.id ?? null;

        if (currId !== prevId) {
            // Call ended — also cancel any pending deferred onCallStarted
            if (prevId !== null && currId === null) {
                pendingCallStartedId = null;
                emit('onCallEnded');
            }

            // New call became active
            if (currCall && currId !== null) {
                // onCallLoaded fires for active-call entry too (separate
                // from the queue-entry fire — a call that was queued then
                // promoted fires onCallLoaded twice).
                if (!activeLoadedCallIds.has(currId)) {
                    activeLoadedCallIds.add(currId);
                    emit('onCallLoaded', currCall);
                }

                // onCallStarted is gated on transcript presence.
                // If the transcript isn't ready yet, defer — the
                // extension will call notifyTranscriptReady() later.
                if (hasTranscript(currCall)) {
                    pendingCallStartedId = null;
                    emit('onCallStarted', currCall);
                } else {
                    pendingCallStartedId = currId;
                }
            }
        }
    });
}

/**
 * Called by the extension after it populates `call.transcript`.
 * If this call is currently active and onCallStarted was deferred,
 * fires it now.
 */
function handleTranscriptReady(callId: number): void {
    if (pendingCallStartedId === callId) {
        pendingCallStartedId = null;
        const state = useScannerStore.getState();
        if (state.call && state.call.id === callId) {
            emit('onCallStarted', state.call);
        }
    }
}

// ---------------------------------------------------------------------------
// DOM slot registration (called from MainDisplay via ref)
// ---------------------------------------------------------------------------

let _transcriptSlot: HTMLElement | null = null;

export function registerTranscriptSlot(el: HTMLElement | null): void {
    _transcriptSlot = el;
    if (window.rdioScannerExt) {
        window.rdioScannerExt.dom.transcriptSlot = el;
    }
}

// ---------------------------------------------------------------------------
// Public install function
// ---------------------------------------------------------------------------

export function installExtensionApi(): () => void {
    const api: RdioScannerExtensionApi = {
        // --- State ---
        getCurrentCall() {
            return useScannerStore.getState().call;
        },
        getCurrentTime() {
            return getAudioTimeSnapshot();
        },
        isPlaying() {
            const state = useScannerStore.getState();
            return state.call !== null && !state.paused;
        },

        // --- Events ---
        subscribe(handlers: ExtensionEventHandlers): () => void {
            subscriptions.add(handlers);
            syncAudioTickSubscription();

            // Replay current state for late subscribers (deferred so
            // subscribe() returns before handlers fire).
            const state = useScannerStore.getState();
            if (state.call) {
                const call = state.call;
                queueMicrotask(() => {
                    handlers.onCallLoaded?.(call);
                    // Only replay onCallStarted if transcript exists
                    if (hasTranscript(call)) {
                        handlers.onCallStarted?.(call);
                    }
                });
            }

            return () => {
                subscriptions.delete(handlers);
                syncAudioTickSubscription();
            };
        },

        notifyTranscriptReady(callId: number) {
            handleTranscriptReady(callId);
        },

        // --- Playback ---
        seek(seconds: number) {
            useScannerStore.getState().seek(seconds);
        },
        pause() {
            useScannerStore.getState().pause(true);
        },
        play() {
            const state = useScannerStore.getState();
            if (state.paused) {
                state.pause(false); // unpause resumes via the store's pause() toggle
            }
        },

        // --- DOM slots ---
        dom: {
            transcriptSlot: _transcriptSlot,
            overlayRoot: document.body,
        },

        // --- Escape hatch ---
        _store: useScannerStore,
    };

    window.rdioScannerExt = api;
    installStoreSubscription();

    // Dispatch a custom event so userscripts waiting for the API can
    // detect it without polling.
    window.dispatchEvent(new CustomEvent('rdio-scanner-ext-ready'));

    return () => {
        // Teardown
        if (storeUnsub) {
            storeUnsub();
            storeUnsub = null;
        }
        if (audioTickUnsub) {
            audioTickUnsub();
            audioTickUnsub = null;
        }
        subscriptions.clear();
        queueLoadedCallIds.clear();
        activeLoadedCallIds.clear();
        pendingCallStartedId = null;
        delete window.rdioScannerExt;
    };
}
