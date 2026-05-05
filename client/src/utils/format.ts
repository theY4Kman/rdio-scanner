/**
 * Format a frequency number into a human-readable string with spaces.
 * Pads to 9 digits, inserts spaces every 3 digits from the right, and appends " Hz".
 *
 * Example: 851012500 -> "851 012 500 Hz"
 */
export function formatFrequency(frequency: number | undefined): string {
    if (typeof frequency !== 'number') {
        return '';
    }

    return frequency
        .toString()
        .padStart(9, '0')
        .replace(/(\d)(?=(\d{3})+$)/g, '$1 ')
        .concat(' Hz');
}

/**
 * Format an AFS (Automatic Format System) talkgroup ID.
 * Decodes the bit-packed ID into the "XX-XXX" format.
 */
export function formatAfs(n: number): string {
    return `${(n >> 7 & 15).toString().padStart(2, '0')}-${(n >> 3 & 15).toString().padStart(2, '0')}${n & 7}`;
}

/**
 * Format a duration in seconds into a display string.
 * Matches the Angular DurationPipe: shows HH:MM:SS.X or MM:SS.X or SS.X.
 *
 * @param value   Duration in seconds (may include fractional part)
 * @param precision  Number of decimal places for seconds (default 1)
 */
export function formatDuration(value: number | null | undefined, precision = 1): string {
    if (value == null) {
        return '';
    }

    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;

    const sigParts: number[] = [hours, minutes];
    if (hours === 0) {
        sigParts.shift();
    }
    if (sigParts.length > 0 && sigParts[0] === 0) {
        sigParts.shift();
    }

    const formatInt = (n: number): string => n.toLocaleString('en-US', {
        minimumIntegerDigits: 2,
        maximumFractionDigits: 0,
    });

    const formatSeconds = (n: number): string => n.toLocaleString('en-US', {
        minimumIntegerDigits: 2,
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
    });

    const displays = [
        ...sigParts.map(formatInt),
        formatSeconds(seconds),
    ];

    return displays.join(':');
}
