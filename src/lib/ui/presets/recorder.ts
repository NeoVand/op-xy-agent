/**
 * Recording from the microphone onto a key of the preset maker: the browser's MediaRecorder on
 * the raw input (no echo cancelling, noise suppression or gain riding: a sampler wants the sound
 * as it is), stopped at the device's 20 s, and handed back as a file the workbench reads like any
 * dropped one. The microphone is let go as soon as the take ends.
 */

/** The longest take, as the device samples (s). */
export const TAKE_SECONDS = 20;

export class MicRecorder {
	#recorder: MediaRecorder | null = null;
	#stream: MediaStream | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#takes = 0;

	/** Whether a take is running. */
	get recording(): boolean {
		return this.#recorder?.state === 'recording';
	}

	/**
	 * Starts a take (the browser asks for the microphone the first time); `done` gets it as a file
	 * when it stops. Throws when there is no microphone or the page may not use it.
	 */
	async start(done: (file: File) => void): Promise<void> {
		if (this.recording) return;
		const media = globalThis.navigator?.mediaDevices;
		if (!media?.getUserMedia || typeof MediaRecorder === 'undefined') {
			throw new Error('this browser cannot record');
		}
		const stream = await media.getUserMedia({
			audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
		});
		const recorder = new MediaRecorder(stream);
		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = () => {
			this.#release();
			const type = recorder.mimeType || 'audio/webm';
			const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
			done(new File(chunks, `mic ${++this.#takes}.${extension}`, { type }));
		};
		this.#stream = stream;
		this.#recorder = recorder;
		recorder.start();
		this.#timer = setTimeout(() => this.stop(), TAKE_SECONDS * 1000);
	}

	/** Ends the take (its file follows). */
	stop(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		if (this.#recorder?.state === 'recording') this.#recorder.stop();
	}

	#release(): void {
		for (const track of this.#stream?.getTracks() ?? []) track.stop();
		this.#stream = null;
		this.#recorder = null;
	}

	/** Stops everything (the page is leaving). */
	close(): void {
		this.stop();
		this.#release();
	}
}
