export interface AvoidOptions {
    all?: boolean;
    call?: Call;
    minutes?: number;
    status?: boolean;
    system?: System;
    talkgroup?: Talkgroup;
}

export interface Beep {
    begin: number;
    end: number;
    frequency: number;
    type: OscillatorType;
}

export enum BeepStyle {
    Activate = 'activate',
    Deactivate = 'deactivate',
    Denied = 'denied',
}

export interface Call {
    audio?: {
        type: 'Buffer';
        data: number[];
    };
    audioName?: string;
    audioType?: string;
    audioDuration?: number;
    dateTime: Date;
    frequencies?: CallFrequency[];
    frequency?: number;
    id: number;
    patches: number[];
    source?: number;
    sources?: CallSource[];
    system: number;
    talkgroup: number;
    talkgroupData?: Talkgroup;
    systemData?: System;
}

export interface CallFrequency {
    errorCount?: number;
    freq?: number;
    len?: number;
    pos?: number;
    spikeCount?: number;
}

export interface CallSource {
    pos?: number;
    src?: number;
    label?: string;
}

export interface Category {
    label: string;
    status: CategoryStatus;
    type: CategoryType;
}

export enum CategoryStatus {
    Off = 'off',
    On = 'on',
    Partial = 'partial',
}

export enum CategoryType {
    Group = 'group',
    Tag = 'tag',
}

export interface Config {
    afs?: string;
    branding?: string;
    dimmerDelay: number | false;
    groups: { [key: string]: { [key: number]: number[] } };
    keypadBeeps: KeypadBeeps | false;
    playbackGoesLive: boolean;
    showListenersCount: boolean;
    systems: System[];
    tags: { [key: string]: { [key: number]: number[] } };
    tagsToggle: boolean;
    time12hFormat: boolean;
}

export interface Event {
    auth?: boolean;
    categories?: Category[];
    call?: Call;
    config?: Config;
    expired?: boolean;
    holdSys?: boolean;
    holdTg?: boolean;
    linked?: boolean;
    listeners?: number;
    livefeedMode?: LivefeedMode;
    map?: LivefeedMap;
    unitsMap?: LivefeedUnitsMap;
    pause?: boolean;
    pausedAt?: Date;
    persistQ?: boolean;
    playbackList?: PlaybackList;
    playbackPending?: number;
    queue?: number;
    queueDuration?: number;
    queuedCall?: Call;
    queuedCalls?: Call[];
    time?: number;
    tooMany?: boolean;
    unitsIndex?: UnitsIndex;
}

export interface KeypadBeeps {
    [BeepStyle.Activate]: Beep[];
    [BeepStyle.Deactivate]: Beep[];
    [BeepStyle.Denied]: Beep[];
}

export interface Livefeed {
    active: boolean;
    minutes: number | undefined;
    timer: ReturnType<typeof setTimeout> | undefined;
}

export interface LivefeedMap {
    [key: number]: {
        [key: number]: Livefeed;
    };
}

export interface LivefeedUnitsMap {
    [unitId: number]: boolean;
}

export enum LivefeedMode {
    Offline = 'offline',
    Online = 'online',
    Playback = 'playback',
}

export interface QueuePersistState {
    callIds: number[];
    timestamp: number;
    livefeedMode: LivefeedMode;
    livefeedMap: LivefeedMap;
    livefeedUnitsMap?: LivefeedUnitsMap;
    /**
     * Currently-active call (state.call) at the time of save, including its
     * current seek position in seconds. On restore this call is prepended
     * into the fetched queue and the seek offset is applied to its first
     * playback, so the user resumes mid-call from exactly where they left
     * off. Omitted when no call was active (e.g. scanner was idle).
     */
    activeCall?: {
        id: number;
        seek: number;
    };
}

export interface PlaybackList {
    count: number;
    dateStart: Date;
    dateStop: Date;
    options: SearchOptions;
    results: Call[];
}

/**
 * Runtime state for the "play from search" queue. This coexists with the
 * livefeed: incoming livefeed calls are buffered separately while a search
 * queue is active, and once the queue ends the buffered calls (plus any
 * pre-queue pause/livefeed state) are restored.
 */
export interface SearchQueueState {
    /** True while at least one call from the search queue is playing or queued. */
    active: boolean;
    /** The call id currently playing from the search queue. */
    currentCallId: number | null;
    /** Remaining call ids to play (not including the currently playing one). */
    queuedCallIds: number[];
    /** Whether to auto-advance through `queuedCallIds` when each call ends. */
    playAll: boolean;
    /**
     * Livefeed calls that arrived during search-queue playback. These are not
     * added to callQueue / callHistory until the search queue ends.
     */
    pendingLivefeedCalls: Call[];
    /**
     * Snapshot of scanner state captured when the search queue started, so we
     * can restore it when the queue finishes. `pausedAt` is captured verbatim
     * so the pause/livefeed-button elapsed timer resumes from where it was,
     * rather than resetting to 0 the moment the search queue exits.
     */
    preState: {
        livefeedMode: LivefeedMode;
        paused: boolean;
        pausedAt: Date | null;
    } | null;
}

export interface UnitsIndex {
    [systemId: number]: {
        [unitId: number]: string;
    };
}

export interface SearchOptions {
    date?: Date;
    group?: string;
    limit: number;
    offset: number;
    sort: number;
    system?: number;
    tag?: string;
    talkgroup?: number;
    units?: number[];
    unitsMode?: 'all' | 'any';
}

export interface System {
    id: number;
    label: string;
    led?: 'blue' | 'cyan' | 'green' | 'magenta' | 'orange' | 'red' | 'white' | 'yellow';
    order?: number;
    talkgroups: Talkgroup[];
    units: Unit[];
}

export interface Talkgroup {
    frequency?: number;
    group: string;
    id: number;
    label: string;
    led?: 'blue' | 'cyan' | 'green' | 'magenta' | 'orange' | 'red' | 'white' | 'yellow';
    name: string;
    tag: string;
}

export interface Unit {
    id: number;
    label: string;
}
