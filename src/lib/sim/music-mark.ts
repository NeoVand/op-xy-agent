/**
 * What a key press can change that the replica's screen may not show, as one string to compare: a
 * walkthrough step that puts a note on a step key is done when this says so (the screen still
 * reads the same). Pure and DOM-free: the lab's worker builds virtual OP-XYs that use it.
 */
import type { SimState } from './params';

/**
 * The selected track and each drum track's key, every track's playing pattern and its notes,
 * whether the transport runs, and whether it records (armed for the first note, latched or
 * counting in): `record + play` reads the same on the screen, and a walkthrough once took it as
 * done the moment the track key before it was pressed. And which tracks are muted: a lesson's
 * `instrument + T3` left the screen as it was and passed before the user pressed anything; and
 * the open project's last save, for the same reason (`project → M2` passed at `project`).
 */
export function musicMark(s: SimState): string {
	const rec = s.areas.sequencer;
	return JSON.stringify({
		track: s.track,
		keys: s.tracks.map((t) => t.drumKey),
		playing: s.transport.playing,
		muted: [...s.tracks, ...s.aux].map((t) => (t.mix.muted ? 1 : 0)).join(''),
		saved: `${s.project.name}|${
			s.areas.system.projects.user.find((p) => p.name === s.project.name)?.versions.at(-1)?.label ??
			''
		}`,
		recording: rec.armed ? 'armed' : rec.countIn ? 'count-in' : rec.recLatch ? 'on' : 'off',
		// each step's notes and parameter locks: a lock leaves the screen reading the track's value
		notes: s.tracks.map((t) => {
			const p = t.sequence.patterns[t.sequence.current];
			return [
				t.sequence.current,
				...(p?.steps.flatMap((step, i) => {
					const locks = Object.entries(step.locks ?? {});
					if (step.notes.length === 0 && locks.length === 0) return [];
					const locked = locks.map(([id, v]) => `${id}=${Math.round(v * 100) / 100}`).join(',');
					return [`${i}:${step.notes.map((n) => n.note).join('.')}${locked ? `|${locked}` : ''}`];
				}) ?? [])
			];
		})
	});
}
