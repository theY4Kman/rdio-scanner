import type { LivefeedUnitsMap, QueuePersistState } from '../types/scanner';

// localStorage key constants
export const LOCAL_STORAGE_KEY_LEGACY = 'rdio-scanner';
export const LOCAL_STORAGE_KEY_LFM = 'rdio-scanner-lfm';
export const LOCAL_STORAGE_KEY_LFM_UNITS = 'rdio-scanner-lfm-units';
export const LOCAL_STORAGE_KEY_PIN = 'rdio-scanner-pin';
export const LOCAL_STORAGE_KEY_QUEUE_PERSIST = 'rdio-scanner-queue-persist';
export const LOCAL_STORAGE_KEY_QUEUE_PERSIST_ENABLED = 'rdio-scanner-queue-persist-enabled';

/**
 * Reads the scanner instance ID from the URL query param 'id'.
 * Falls back to 'default' if not present.
 */
export function getInstanceId(): string {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || 'default';
    } catch {
        return 'default';
    }
}

/**
 * Reads the livefeed map from localStorage, with fallback to legacy key.
 * Returns a plain object of `{ [sys]: { [tg]: boolean } }`.
 */
export function readLivefeedMap(instanceId: string): { [key: number]: { [key: number]: boolean } } {
    try {
        let store = window.localStorage.getItem(`${LOCAL_STORAGE_KEY_LFM}-${instanceId}`);

        if (store !== null) {
            return JSON.parse(store);
        }

        // Legacy fallback
        store = window.localStorage.getItem(LOCAL_STORAGE_KEY_LEGACY);
        if (store !== null) {
            return JSON.parse(store);
        }
    } catch {
        // ignore parse errors
    }

    return {};
}

/**
 * Serializes the livefeed map to localStorage.
 * Expects a plain object of `{ [sys]: { [tg]: boolean } }`.
 */
export function saveLivefeedMap(instanceId: string, map: { [key: number]: { [key: number]: boolean } }): void {
    try {
        window.localStorage.setItem(`${LOCAL_STORAGE_KEY_LFM}-${instanceId}`, JSON.stringify(map));
    } catch {
        // ignore quota errors
    }
}

/**
 * Reads the livefeed units map from localStorage.
 */
export function readLivefeedUnitsMap(instanceId: string): LivefeedUnitsMap {
    try {
        const store = window.localStorage.getItem(`${LOCAL_STORAGE_KEY_LFM_UNITS}-${instanceId}`);
        if (store !== null) {
            const parsed = JSON.parse(store);
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed;
            }
        }
    } catch {
        // ignore
    }
    return {};
}

/**
 * Saves the livefeed units map to localStorage.
 */
export function saveLivefeedUnitsMap(instanceId: string, map: LivefeedUnitsMap): void {
    try {
        window.localStorage.setItem(`${LOCAL_STORAGE_KEY_LFM_UNITS}-${instanceId}`, JSON.stringify(map));
    } catch {
        // ignore quota errors
    }
}

/**
 * Reads the saved PIN from localStorage (base64-decoded).
 */
export function readPin(): string | undefined {
    const pin = window.localStorage.getItem(LOCAL_STORAGE_KEY_PIN);
    return pin ? window.atob(pin) : undefined;
}

/**
 * Saves a PIN to localStorage (base64-encoded).
 */
export function savePin(pin: string): void {
    window.localStorage.setItem(LOCAL_STORAGE_KEY_PIN, window.btoa(pin));
}

/**
 * Clears the saved PIN from localStorage.
 */
export function clearPin(): void {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY_PIN);
}

/**
 * Reads whether queue persistence is enabled for this instance.
 */
export function readQueuePersistEnabled(instanceId: string): boolean {
    try {
        const saved = window.localStorage.getItem(
            `${LOCAL_STORAGE_KEY_QUEUE_PERSIST_ENABLED}-${instanceId}`,
        );
        if (saved) {
            return JSON.parse(saved);
        }
    } catch {
        // ignore
    }
    return false;
}

/**
 * Saves the queue persistence toggle for this instance.
 */
export function saveQueuePersistEnabled(instanceId: string, enabled: boolean): void {
    try {
        window.localStorage.setItem(
            `${LOCAL_STORAGE_KEY_QUEUE_PERSIST_ENABLED}-${instanceId}`,
            JSON.stringify(enabled),
        );
    } catch {
        // ignore
    }
}

/**
 * Reads the persisted queue state from localStorage.
 */
export function readQueueState(instanceId: string): QueuePersistState | undefined {
    try {
        const saved = window.localStorage.getItem(
            `${LOCAL_STORAGE_KEY_QUEUE_PERSIST}-${instanceId}`,
        );
        if (saved) {
            return JSON.parse(saved);
        }
    } catch {
        // ignore
    }
    return undefined;
}

/**
 * Saves the queue state to localStorage.
 */
export function saveQueueState(instanceId: string, state: QueuePersistState): void {
    try {
        window.localStorage.setItem(
            `${LOCAL_STORAGE_KEY_QUEUE_PERSIST}-${instanceId}`,
            JSON.stringify(state),
        );
    } catch {
        // ignore
    }
}

/**
 * Clears the saved queue state from localStorage.
 */
export function clearQueueState(instanceId: string): void {
    window.localStorage.removeItem(`${LOCAL_STORAGE_KEY_QUEUE_PERSIST}-${instanceId}`);
}
