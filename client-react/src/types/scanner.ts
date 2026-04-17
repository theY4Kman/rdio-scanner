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
}

export interface PlaybackList {
    count: number;
    dateStart: Date;
    dateStop: Date;
    options: SearchOptions;
    results: Call[];
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
