/** Invalid input to the sound engine (a track, key or note out of range, an empty sample). */
export class SoundError extends Error {
	override name = 'SoundError';
}
