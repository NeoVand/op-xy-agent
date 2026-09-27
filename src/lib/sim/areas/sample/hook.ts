/**
 * Where a sound engine attaches to the sampler (it does not exist yet; the simulator is silent).
 * Every sample the simulator holds is a {@link SampleFile} with a stable `id`: copies of one file
 * (a kit loaded twice, the slices of a loop, a take on a key and in the user folder) share it, so
 * an engine keys its decoded buffers by id. Once it has the audio, {@link attachPeaks} replaces the
 * seeded stand-in waveform with measured peaks everywhere that file appears; the pages redraw from
 * them without other changes. What to play and when is in the state too: the drum keys' and
 * regions' points, the slicer's `play`, the record page's `playing` and the library's `previewing`.
 */
import type { SampleFile, SampleState } from './state';
import type { Peaks } from './wave';

/** Every sample file the area holds, one per id (what an engine needs buffers for). */
export function samplesInUse(area: SampleState): SampleFile[] {
	const byId = new Map<string, SampleFile>();
	const add = (file: SampleFile | null) => {
		if (file && !byId.has(file.id)) byId.set(file.id, file);
	};
	for (const track of area.tracks) {
		track.keys.forEach(add);
		add(track.synth.file);
		for (const zone of track.zones) add(zone.file);
	}
	area.user.forEach(add);
	add(area.record.take);
	add(area.clipboard?.file ?? null);
	return [...byId.values()];
}

/**
 * Attaches measured peaks (from `peaksFromChannels`) and, when known, the true length to every
 * copy of sample `id`. Returns how many copies changed.
 */
export function attachPeaks(area: SampleState, id: string, peaks: Peaks, seconds?: number): number {
	let changed = 0;
	const update = (file: SampleFile | null) => {
		if (!file || file.id !== id) return;
		file.peaks = peaks;
		if (seconds !== undefined) file.seconds = seconds;
		changed++;
	};
	for (const track of area.tracks) {
		track.keys.forEach(update);
		update(track.synth.file);
		for (const zone of track.zones) update(zone.file);
	}
	area.user.forEach(update);
	update(area.record.take);
	update(area.clipboard?.file ?? null);
	return changed;
}
