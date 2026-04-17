import type { Beep } from '../types/scanner';

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

export class AudioManager {
    private playbackContext: AudioContext | undefined;
    private beepContext: AudioContext | undefined;

    private audioSource: AudioBufferSourceNode | undefined;
    private audioBuffer: AudioBuffer | undefined;
    private audioSourceStartTime = NaN;
    private animationFrameId: number | undefined;

    private bootstrapped = false;
    private paused = false;

    get isPlaying(): boolean {
        return this.audioSource !== undefined;
    }

    bootstrapAudio(): void {
        if (this.bootstrapped) {
            return;
        }
        this.bootstrapped = true;

        const events = ['keydown', 'mousedown', 'touchstart'] as const;

        const bootstrap = async () => {
            if (!this.playbackContext) {
                this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
            }

            if (!this.beepContext) {
                this.beepContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            }

            if (this.playbackContext) {
                const resume = () => {
                    if (!this.paused) {
                        if (this.playbackContext?.state === 'suspended') {
                            this.playbackContext?.resume().then(() => resume());
                        }
                    }
                };

                await this.playbackContext.resume();
                this.playbackContext.onstatechange = () => resume();
            }

            if (this.beepContext) {
                const resume = () => {
                    if (this.beepContext?.state === 'suspended') {
                        this.beepContext?.resume().then(() => resume());
                    }
                };

                await this.beepContext.resume();
                this.beepContext.onstatechange = () => resume();
            }

            if (this.playbackContext && this.beepContext) {
                events.forEach((event) => document.body.removeEventListener(event, bootstrap));
            }
        };

        events.forEach((event) => document.body.addEventListener(event, bootstrap));
    }

    playCall(
        audioData: { type: 'Buffer'; data: number[] },
        onTimeUpdate: (time: number) => void,
        onEnded: () => void,
    ): void {
        if (!this.playbackContext) {
            return;
        }

        const arrayBuffer = new ArrayBuffer(audioData.data.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(audioData.data);

        this.playbackContext.decodeAudioData(
            arrayBuffer,
            (buffer) => {
                if (!this.playbackContext || this.audioSource) {
                    return;
                }

                this.audioBuffer = buffer;
                this.audioSource = this.playbackContext.createBufferSource();
                this.audioSource.buffer = buffer;
                this.audioSource.connect(this.playbackContext.destination);
                this.audioSource.onended = () => {
                    onTimeUpdate(buffer.duration);
                    onEnded();
                };
                this.audioSource.start();
                this.audioSourceStartTime = this.playbackContext.currentTime;

                // Start time update loop
                const updateTime = () => {
                    if (!this.audioSource || !this.playbackContext) {
                        return;
                    }

                    if (!this.paused && !isNaN(this.audioSourceStartTime)) {
                        onTimeUpdate(this.playbackContext.currentTime - this.audioSourceStartTime);
                    }

                    this.animationFrameId = requestAnimationFrame(updateTime);
                };

                this.animationFrameId = requestAnimationFrame(updateTime);
            },
            () => {
                // Decode error -- signal ended so the store can skip
                onEnded();
            },
        );
    }

    seek(seconds: number): void {
        if (!this.audioSource || !this.playbackContext || !this.audioBuffer) {
            return;
        }

        const prevOnEnded = this.audioSource.onended;
        this.audioSource.onended = null;
        this.audioSource.stop();

        this.audioSource = this.playbackContext.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        this.audioSource.connect(this.playbackContext.destination);
        this.audioSource.onended = prevOnEnded;
        this.audioSource.start(0, seconds);

        this.audioSourceStartTime = this.playbackContext.currentTime - seconds;
    }

    stop(): void {
        if (this.animationFrameId !== undefined) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = undefined;
        }

        if (this.audioSource) {
            this.audioSource.onended = null;
            this.audioSource.stop();
            this.audioSource.disconnect();
            this.audioSource = undefined;
            this.audioSourceStartTime = NaN;
        }

        this.audioBuffer = undefined;
    }

    suspend(): void {
        this.paused = true;
        void this.playbackContext?.suspend();
    }

    resume(): void {
        this.paused = false;
        void this.playbackContext?.resume();
    }

    beep(
        style: string,
        keypadBeeps: Record<string, Beep[]>,
    ): Promise<void> {
        return new Promise((resolve) => {
            const context = this.beepContext;
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

    getCurrentTime(): number {
        if (!this.playbackContext || isNaN(this.audioSourceStartTime)) {
            return 0;
        }
        return this.playbackContext.currentTime - this.audioSourceStartTime;
    }
}
