/**
 * What the agent reads after listening: a few short lines in words, the flags worth acting on, and
 * the numbers behind them, rounded. The focus puts what was asked about first and adds its detail
 * (the drum picture, every chord, the third-octave peaks); the rest stays one line each.
 *
 * Flags mark what a producer would fix or check (thresholds in docs/research/61-listening.md):
 * clipping, a peak at full scale, very quiet or very loud, dropouts, a DC offset, mostly silence, an
 * out-of-phase low end, a rhythm that does not fit the set tempo, loose timing, no clear pulse. Tone
 * is left as numbers against pink noise: taste and genre decide what is right there.
 */
import type { ListenAnalysis } from './analyze';
import { DB_FLOOR } from './level';
import type { OnsetBand } from './onsets';
import { BANDS, THIRD_OCTAVES, type BandName } from './spectrum';

/** What to listen for. */
export const LISTEN_FOCUS = ['all', 'mix', 'drums', 'tempo', 'harmony', 'tone'] as const;

/** A focus. */
export type ListenFocus = (typeof LISTEN_FOCUS)[number];

/** Options for {@link summarize}. */
export interface SummaryOptions {
	readonly focus?: ListenFocus;
	/** What was heard, for the first line ("the OP-XY's USB audio", "the virtual OP-XY"). */
	readonly source?: string;
}

/** Flag thresholds. */
export const FLAG_LIMITS = {
	/** A peak this close to full scale, dBFS, without flat tops. */
	hotPeakDbfs: -0.3,
	/** Integrated loudness under this is very quiet, LUFS. */
	quietLufs: -30,
	/** Over this, very loud, LUFS. */
	loudLufs: -8,
	/** A DC offset over this. */
	dcOffset: 0.01,
	/** Silent for more than this share of the take. */
	mostlySilent: 0.5,
	/** The rhythm fits the set tempo less than this (support). */
	offTempoSupport: 0.5,
	/** …when the heard pulse is at least this sure. */
	pulseConfidence: 0.4,
	/** RMS spread around the grid over this, ms. */
	looseMs: 15,
	/** Tightness counts from this many onsets. */
	gridOnsets: 8,
	/**
	 * No steady pulse: the heard tempo is less sure than this, and the rhythm does not fit the set
	 * tempo at least `setSupport` (random hits score up to about 0.3; a busy mix can too, but it fits
	 * its set tempo).
	 */
	noPulse: 0.3,
	setSupport: 0.8
} as const;

/** The numbers behind the words, rounded. */
export interface SummaryData {
	readonly seconds: number;
	readonly sampleRate: number;
	readonly channels: number;
	readonly level: {
		readonly lufs: number | null;
		readonly shortTermMaxLufs: number | null;
		readonly rangeLu: number | null;
		readonly peakDbfs: number;
		readonly rmsDbfs: number;
		readonly crestDb: number;
		readonly clipRuns: number;
	};
	readonly tone: {
		readonly centroidHz: number;
		readonly tiltDbPerOct: number | null;
		/** Each band's share against pink noise's, dB. */
		readonly vsPink: Readonly<Partial<Record<BandName, number | null>>>;
		/** Third-octave shares of the total, dB, by centre (focus tone only). */
		readonly thirdOctaves?: Readonly<Record<string, number>>;
	} | null;
	readonly stereo: {
		readonly correlation: number | null;
		readonly width: number;
		readonly balanceDb: number;
		readonly lowCorrelation: number | null;
		readonly monoLossDb: number;
	} | null;
	readonly rhythm: {
		readonly onsets: number;
		readonly perSecond: number;
		readonly bpm: number | null;
		readonly confidence: number | null;
		readonly alternatives: readonly number[];
		readonly setBpm: number | null;
		readonly relation: string | null;
		readonly support: number | null;
		readonly gridBpm: number | null;
		readonly tightnessMs: number | null;
		readonly swing: number | null;
		readonly swingEighth: number | null;
	} | null;
	/** The pump heard (a duck), dB and where in the beat the level is lowest. */
	readonly pump: { readonly depthDb: number; readonly lowAt: number } | null;
	readonly drums: Readonly<
		Partial<
			Record<
				OnsetBand,
				{
					readonly count: number;
					readonly beat: number;
					readonly e: number;
					readonly and: number;
					readonly a: number;
				}
			>
		>
	> | null;
	readonly harmony: {
		readonly key: string | null;
		readonly clear: boolean;
		readonly runnerUp: string | null;
		/** [start seconds, chord]. */
		readonly chords: readonly (readonly [number, string])[];
	} | null;
	readonly silence: {
		readonly silentSeconds: number;
		readonly leadingSeconds: number;
		readonly trailingSeconds: number;
		readonly longestGapSeconds: number;
		readonly dropouts: number;
		readonly dropoutTimes: readonly number[];
	};
}

/** What the agent reads. */
export interface ListenSummary {
	/** Short lines in words. */
	readonly text: string;
	/** What is worth fixing or checking ("clipping", "off-tempo", …); empty when nothing stands out. */
	readonly flags: readonly string[];
	readonly data: SummaryData;
}

// `|| 0` turns −0 into 0, which JSON cannot tell apart anyway
const r0 = (v: number) => Math.round(v) || 0;
const r1 = (v: number) => Math.round(v * 10) / 10 || 0;
const r2 = (v: number) => Math.round(v * 100) / 100 || 0;
const orNull = <T>(v: T | null | undefined, f: (x: T) => T) =>
	v === null || v === undefined ? null : f(v);
const signed = (v: number) => (v > 0 ? `+${r1(v)}` : `${r1(v)}`);
const pct = (v: number) => `${r0(v * 100)} %`;
const hz = (v: number) => (v >= 1000 ? `${r1(v / 1000)} kHz` : `${r0(v)} Hz`);
const secs = (v: number) => `${r1(v)} s`;

const BAND_WORDS: Record<OnsetBand, string> = {
	low: 'low (kicks, bass)',
	mid: 'mid (snares, notes)',
	high: 'high (hats, cymbals)'
};

const SLOT_WORDS = { beat: 'on the beat', e: 'on the "e"', and: 'on the "and"', a: 'on the "a"' };

/** The flags an analysis raises. */
export function flagsOf(a: ListenAnalysis): string[] {
	const flags: string[] = [];
	if (a.silence.silent) return ['silent'];
	if (a.level.clipRuns > 0) flags.push('clipping');
	else if (a.level.peakDbfs >= FLAG_LIMITS.hotPeakDbfs) flags.push('hot');
	const lufs = a.level.loudness.integrated;
	if (lufs !== null && lufs < FLAG_LIMITS.quietLufs) flags.push('quiet');
	if (lufs !== null && lufs > FLAG_LIMITS.loudLufs) flags.push('loud');
	if (a.silence.dropoutCount > 0) flags.push('dropouts');
	if (Math.abs(a.level.dcOffset) > FLAG_LIMITS.dcOffset) flags.push('dc-offset');
	if (a.silence.silentSeconds > FLAG_LIMITS.mostlySilent * a.seconds) flags.push('mostly-silent');
	const low = a.stereo?.lowCorrelation;
	if ((low !== null && low !== undefined && low < 0) || (a.stereo?.correlation ?? 1) < 0) {
		flags.push('phase');
	}
	const tempo = a.rhythm?.tempo;
	if (tempo?.expected && tempo.confidence >= FLAG_LIMITS.pulseConfidence) {
		if (
			tempo.expected.relation === 'different' &&
			tempo.expected.support < FLAG_LIMITS.offTempoSupport
		) {
			flags.push('off-tempo');
		}
	}
	const grid = a.rhythm?.grid;
	if (grid && grid.onsets >= FLAG_LIMITS.gridOnsets && grid.tightnessMs > FLAG_LIMITS.looseMs) {
		flags.push('loose');
	}
	const fitsSet = (tempo?.expected?.support ?? 0) >= FLAG_LIMITS.setSupport;
	if (
		a.rhythm &&
		a.rhythm.onsets >= 4 &&
		!fitsSet &&
		(!tempo || tempo.confidence < FLAG_LIMITS.noPulse)
	) {
		flags.push('no-pulse');
	}
	return flags;
}

/** The numbers, rounded. */
function dataOf(a: ListenAnalysis, focus: ListenFocus): SummaryData {
	const tempo = a.rhythm?.tempo ?? null;
	const grid = a.rhythm?.grid ?? null;
	const spectrum = a.spectrum;
	const vsPink = spectrum
		? Object.fromEntries(spectrum.bands.map((b) => [b.name, orNull(b.vsPink, r1)]))
		: {};
	const thirdOctaves =
		spectrum && focus === 'tone'
			? Object.fromEntries(
					THIRD_OCTAVES.flatMap((centre, i) => {
						const v = spectrum.thirdOctaves[i];
						return v === null || v <= DB_FLOOR ? [] : [[String(centre), r0(v)]];
					})
				)
			: undefined;
	return {
		seconds: r2(a.seconds),
		sampleRate: a.sampleRate,
		channels: a.channels,
		level: {
			lufs: orNull(a.level.loudness.integrated, r1),
			shortTermMaxLufs: orNull(a.level.loudness.shortTermMax, r1),
			rangeLu: orNull(a.level.loudness.range, r1),
			peakDbfs: r1(a.level.peakDbfs),
			rmsDbfs: r1(a.level.rmsDbfs),
			crestDb: r1(a.level.crestDb),
			clipRuns: a.level.clipRuns
		},
		tone: spectrum
			? {
					centroidHz: r0(spectrum.centroidHz),
					tiltDbPerOct: orNull(spectrum.tiltDbPerOctave, r1),
					vsPink,
					...(thirdOctaves ? { thirdOctaves } : {})
				}
			: null,
		stereo: a.stereo
			? {
					correlation: orNull(a.stereo.correlation, r2),
					width: r2(a.stereo.width),
					balanceDb: r1(a.stereo.balanceDb),
					lowCorrelation: orNull(a.stereo.lowCorrelation, r2),
					monoLossDb: r1(a.stereo.monoLossDb)
				}
			: null,
		rhythm: a.rhythm
			? {
					onsets: a.rhythm.onsets,
					perSecond: r1(a.rhythm.onsetRate),
					bpm: tempo?.bpm ?? null,
					confidence: orNull(tempo?.confidence, r2),
					alternatives: tempo?.alternatives ?? [],
					setBpm: tempo?.expected?.bpm ?? null,
					relation: tempo?.expected?.relation ?? null,
					support: orNull(tempo?.expected?.support, r2),
					gridBpm: grid?.bpm ?? null,
					tightnessMs: orNull(grid?.tightnessMs, r1),
					swing: grid?.swing ?? null,
					swingEighth: grid?.swingEighth ?? null
				}
			: null,
		pump: a.pump ? { depthDb: a.pump.depthDb, lowAt: r2(a.pump.lowAt) } : null,
		drums: a.rhythm?.drums
			? Object.fromEntries(
					(['low', 'mid', 'high'] as const)
						.filter((band) => a.rhythm!.drums![band].count > 0)
						.map((band) => {
							const d = a.rhythm!.drums![band];
							return [
								band,
								{ count: d.count, beat: r2(d.beat), e: r2(d.e), and: r2(d.and), a: r2(d.a) }
							];
						})
				)
			: null,
		harmony: a.harmony
			? {
					key: a.harmony.key?.key ?? null,
					clear: a.harmony.key?.clear ?? false,
					runnerUp: a.harmony.key?.runnerUp ?? null,
					chords: a.harmony.chords
						.filter((c) => c.chord !== 'N')
						.slice(0, 24)
						.map((c) => [r2(c.start), c.chord] as const)
				}
			: null,
		silence: {
			silentSeconds: r2(a.silence.silentSeconds),
			leadingSeconds: r2(a.silence.leadingSeconds),
			trailingSeconds: r2(a.silence.trailingSeconds),
			longestGapSeconds: r2(a.silence.longestGapSeconds),
			dropouts: a.silence.dropoutCount,
			dropoutTimes: a.silence.dropouts.slice(0, 8).map((d) => r2(d.time))
		}
	};
}

function levelLine(a: ListenAnalysis): string {
	const l = a.level;
	const parts: string[] = [];
	const lufs = l.loudness.integrated;
	parts.push(lufs !== null ? `${r1(lufs)} LUFS integrated` : 'too quiet to measure loudness');
	if (l.loudness.shortTermMax !== null)
		parts.push(`loudest 3 s ${r1(l.loudness.shortTermMax)} LUFS`);
	parts.push(`peak ${r1(l.peakDbfs)} dBFS`, `crest ${r1(l.crestDb)} dB`);
	if (l.loudness.range !== null) parts.push(`range ${r1(l.loudness.range)} LU`);
	parts.push(
		l.clipRuns > 0
			? `clipping: ${l.clipRuns} flat top${l.clipRuns === 1 ? '' : 's'} (${l.clippedSamples} samples at full scale)`
			: 'no clipping'
	);
	return `level: ${parts.join(', ')}`;
}

function toneLine(a: ListenAnalysis, detail: boolean): string | null {
	const s = a.spectrum;
	if (!s) return null;
	const bands = s.bands
		.filter((b) => b.vsPink !== null)
		.map((b) => `${b.name} ${signed(b.vsPink!)}`)
		.join(', ');
	const tilt = s.tiltDbPerOctave !== null ? `, tilt ${r1(s.tiltDbPerOctave)} dB/oct (pink −3)` : '';
	let line = `tone: centroid ${hz(s.centroidHz)}${tilt}; each band against pink noise (0 = an equal share per octave), dB: ${bands}`;
	if (detail) {
		const thirds = THIRD_OCTAVES.map((centre, i) => ({ centre, v: s.thirdOctaves[i] })).filter(
			(t): t is { centre: (typeof THIRD_OCTAVES)[number]; v: number } =>
				t.v !== null && t.v > DB_FLOOR
		);
		const loudest = [...thirds].sort((x, y) => y.v - x.v).slice(0, 3);
		if (loudest.length > 0) {
			line += `; strongest third octaves ${loudest.map((t) => `${hz(t.centre)} (${r0(t.v)} dB)`).join(', ')}`;
		}
	}
	return line;
}

function stereoLine(a: ListenAnalysis): string | null {
	const s = a.stereo;
	if (!s) return null;
	if (a.channels === 1) return 'stereo: one channel (mono)';
	const parts: string[] = [];
	if (s.width < 0.02 && (s.correlation ?? 0) > 0.99) parts.push('mono (both channels the same)');
	else parts.push(`correlation ${orNull(s.correlation, r2) ?? 'n/a'}`, `width ${r2(s.width)}`);
	const b = s.balanceDb;
	parts.push(
		Math.abs(b) < 1 ? 'centred' : `${r1(Math.abs(b))} dB louder on the ${b > 0 ? 'left' : 'right'}`
	);
	if (s.lowCorrelation !== null) {
		parts.push(
			s.lowCorrelation < 0
				? `low end out of phase (${r2(s.lowCorrelation)})`
				: s.lowCorrelation > 0.9
					? 'low end mono'
					: `low end correlation ${r2(s.lowCorrelation)}`
		);
	}
	if (s.monoLossDb < -1) parts.push(`${r1(-s.monoLossDb)} dB lost in mono`);
	return `stereo: ${parts.join(', ')}`;
}

function rhythmLine(a: ListenAnalysis, detail: boolean): string | null {
	const r = a.rhythm;
	if (!r) return null;
	const parts = [`${r.onsets} onsets (${r1(r.onsetRate)}/s)`];
	const t = r.tempo;
	if (t) {
		let tempo = `tempo ${t.bpm} bpm (confidence ${r2(t.confidence)})`;
		const e = t.expected;
		if (e) {
			const fits = e.support >= 0.8 ? `; the rhythm fits ${e.bpm} too` : '';
			tempo +=
				e.relation === 'same'
					? `, matches the set ${e.bpm}${e.offBy ? ` (${signed(e.offBy)})` : ''}`
					: e.relation === 'half'
						? `, half the set ${e.bpm}: a half-time feel${fits}`
						: e.relation === 'double'
							? `, twice the set ${e.bpm}: busy at its eighths${fits}`
							: e.relation === 'three-halves' || e.relation === 'two-thirds'
								? `, ${e.relation === 'three-halves' ? '3:2' : '2:3'} against the set ${e.bpm}${fits}`
								: `, does not fit the set ${e.bpm} (support ${r2(e.support)})`;
		}
		if (detail && t.alternatives.length > 0)
			tempo += `; also heard as ${t.alternatives.join(', ')} bpm`;
		parts.push(tempo);
	} else if (r.onsets >= 4) {
		parts.push('no steady pulse');
	}
	const g = r.grid;
	if (g) {
		const tight =
			g.tightnessMs < 3
				? 'tight'
				: g.tightnessMs < FLAG_LIMITS.looseMs
					? 'a little loose'
					: 'loose';
		let grid = `grid ${tight} (${r1(g.tightnessMs)} ms rms at ${g.bpm} bpm)`;
		if (g.swing !== null) {
			grid +=
				Math.abs(g.swing - 50) < 2
					? ', straight sixteenths'
					: g.swing > 50
						? `, swung sixteenths (${r1(g.swing)} %${g.swing > 64 ? ', near a triplet feel' : ''})`
						: `, sixteenths pulled early (${r1(g.swing)} %)`;
		}
		if (g.swingEighth !== null && Math.abs(g.swingEighth - 50) >= 2)
			grid += `, swung eighths (${r1(g.swingEighth)} %)`;
		parts.push(grid);
	}
	return `rhythm: ${parts.join('; ')}`;
}

function pumpLine(a: ListenAnalysis): string | null {
	if (!a.pump) return null;
	return `pump: after each beat the level falls ${r1(a.pump.depthDb)} dB and swells back before the next, as a duck makes it`;
}

function drumsLine(a: ListenAnalysis): string | null {
	const d = a.rhythm?.drums;
	if (!d) return null;
	const parts = (['low', 'mid', 'high'] as const)
		.filter((band) => d[band].count > 0)
		.map((band) => {
			const hits = d[band];
			const slots = (['beat', 'e', 'and', 'a'] as const)
				.filter((s) => hits[s] >= 0.15)
				.sort((x, y) => hits[y] - hits[x])
				.map((s) => `${SLOT_WORDS[s]} ${pct(hits[s])}`);
			return `${BAND_WORDS[band]} ${hits.count} hits, ${slots.join(', ') || 'spread out'}`;
		});
	return parts.length > 0 ? `drums: ${parts.join('; ')}` : null;
}

function harmonyLine(a: ListenAnalysis, detail: boolean): string | null {
	const h = a.harmony;
	if (!h) return null;
	const key = h.key
		? `key ${h.key.key} (${h.key.clear ? 'clear' : 'tentative'}; runner-up ${h.key.runnerUp})`
		: 'no clear key';
	const chords = h.chords.filter((c) => c.chord !== 'N');
	if (chords.length === 0) return `harmony: ${key}; no chords to name`;
	const shown = chords.slice(0, detail ? 24 : 8).map((c) => `${c.chord} (${secs(c.start)})`);
	const more = chords.length > shown.length ? ` … ${chords.length - shown.length} more` : '';
	return `harmony: ${key}; chords (rough) ${shown.join(' ')}${more}`;
}

function silenceLine(a: ListenAnalysis): string | null {
	const s = a.silence;
	const parts: string[] = [];
	if (s.leadingSeconds >= 0.25) parts.push(`${secs(s.leadingSeconds)} silent at the start`);
	if (s.trailingSeconds >= 0.25) parts.push(`${secs(s.trailingSeconds)} silent at the end`);
	if (s.longestGapSeconds >= 0.5) parts.push(`a ${secs(s.longestGapSeconds)} gap`);
	if (s.dropoutCount > 0) {
		parts.push(
			`${s.dropoutCount} possible dropout${s.dropoutCount === 1 ? '' : 's'} (digital silence cut into the sound) at ${s.dropouts
				.slice(0, 5)
				.map((d) => secs(d.time))
				.join(', ')}`
		);
	}
	return parts.length > 0 ? `silence: ${parts.join('; ')}` : null;
}

/** The short text, flags and numbers for an analysis. */
export function summarize(analysis: ListenAnalysis, options: SummaryOptions = {}): ListenSummary {
	const focus = options.focus ?? 'all';
	const flags = flagsOf(analysis);
	const data = dataOf(analysis, focus);
	const rate = `${r1(analysis.sampleRate / 1000)} kHz ${analysis.channels === 2 ? 'stereo' : 'mono'}`;
	const head = `heard ${secs(analysis.seconds)} of ${options.source ?? 'audio'} (${rate})`;
	if (analysis.silence.silent) {
		return {
			text: `${head}\nsilence: nothing above ${-60} dBFS the whole time\nworth a look: silent`,
			flags,
			data
		};
	}
	const lines: Record<string, string | null> = {
		level: levelLine(analysis),
		tone: toneLine(analysis, focus === 'tone'),
		stereo: stereoLine(analysis),
		rhythm: rhythmLine(analysis, focus === 'tempo' || focus === 'drums'),
		pump: pumpLine(analysis),
		drums: drumsLine(analysis),
		harmony: harmonyLine(analysis, focus === 'harmony'),
		silence: silenceLine(analysis)
	};
	const order: Record<ListenFocus, readonly string[]> = {
		all: ['level', 'tone', 'stereo', 'rhythm', 'pump', 'drums', 'harmony', 'silence'],
		mix: ['level', 'pump', 'tone', 'stereo', 'silence', 'rhythm'],
		drums: ['rhythm', 'pump', 'drums', 'level', 'tone', 'silence'],
		tempo: ['rhythm', 'pump', 'drums', 'silence'],
		harmony: ['harmony', 'level', 'silence'],
		tone: ['tone', 'level', 'stereo', 'silence']
	};
	const body = order[focus].map((k) => lines[k]).filter((l): l is string => l !== null);
	const worth = flags.length > 0 ? `worth a look: ${flags.join(', ')}` : 'nothing stands out';
	return { text: [head, ...body, worth].join('\n'), flags, data };
}

/** One instrument track heard alone. */
export interface TrackTake {
	readonly track: number;
	/** The track's engine or name ("drum", "prism"). */
	readonly name: string;
	/** A drum track: no key or chords for it (what it "plays" is noise to the chord finder). */
	readonly percussive?: boolean;
	readonly analysis: ListenAnalysis;
}

/** The two bands holding most of a take's energy. */
function mainBands(a: ListenAnalysis): BandName[] {
	if (!a.spectrum) return [];
	return [...a.spectrum.bands]
		.filter((b) => b.share > DB_FLOOR)
		.sort((x, y) => y.share - x.share)
		.slice(0, 2)
		.map((b) => b.name);
}

/**
 * Tracks heard one at a time: a line per track (loudness, where its energy sits, its hits and
 * harmony), then how they compare (the loudest and quietest, tracks crowding the same band).
 */
export function summarizeTracks(
	takes: readonly TrackTake[],
	options: SummaryOptions = {}
): {
	readonly text: string;
	readonly tracks: readonly {
		readonly track: number;
		readonly name: string;
		readonly flags: readonly string[];
		readonly data: SummaryData;
	}[];
} {
	const lines: string[] = [];
	const tracks = takes.map((take) => {
		const a = take.analysis;
		const flags = flagsOf(a);
		const label = `T${take.track} (${take.name})`;
		if (a.silence.silent) {
			lines.push(`${label}: silent (nothing plays on it here, or its level is down)`);
		} else {
			const parts: string[] = [];
			const lufs = a.level.loudness.integrated;
			parts.push(
				`${lufs !== null ? `${r1(lufs)} LUFS` : 'very quiet'}, peak ${r1(a.level.peakDbfs)} dBFS`
			);
			const bands = mainBands(a);
			if (bands.length > 0 && a.spectrum)
				parts.push(`mostly ${bands.join(' and ')}, centroid ${hz(a.spectrum.centroidHz)}`);
			if (a.rhythm) {
				const g = a.rhythm.grid;
				parts.push(
					`${a.rhythm.onsets} onsets${g ? `, grid ${r1(g.tightnessMs)} ms rms` : ''}${g?.swing !== null && g?.swing !== undefined && Math.abs(g.swing - 50) >= 2 ? `, swing ${r1(g.swing)} %` : ''}`
				);
			}
			if (a.pump) parts.push(`pumps with the beat, ${r1(a.pump.depthDb)} dB`);
			const harmony = take.percussive ? null : a.harmony;
			const chords = harmony?.chords.filter((c) => c.chord !== 'N') ?? [];
			if (harmony?.key?.clear) parts.push(`key ${harmony.key.key}`);
			if (chords.length > 0)
				parts.push(
					`chords ${chords
						.slice(0, 6)
						.map((c) => c.chord)
						.join(' ')}`
				);
			if (flags.length > 0) parts.push(`worth a look: ${flags.join(', ')}`);
			lines.push(`${label}: ${parts.join('; ')}`);
		}
		return { track: take.track, name: take.name, flags, data: dataOf(a, options.focus ?? 'all') };
	});

	const audible = takes.filter((t) => t.analysis.level.loudness.integrated !== null);
	if (audible.length >= 2) {
		const byLoudness = [...audible].sort(
			(x, y) => y.analysis.level.loudness.integrated! - x.analysis.level.loudness.integrated!
		);
		const [loudest, quietest] = [byLoudness[0], byLoudness[byLoudness.length - 1]];
		const spread =
			loudest.analysis.level.loudness.integrated! - quietest.analysis.level.loudness.integrated!;
		lines.push(
			`compared: loudest T${loudest.track}, quietest T${quietest.track}, ${r1(spread)} LU apart`
		);
		for (const { name } of BANDS) {
			const crowd = audible.filter((t) => mainBands(t.analysis)[0] === name);
			if (crowd.length >= 2) {
				lines.push(
					`${crowd.map((t) => `T${t.track}`).join(' and ')} put most of their energy in the ${name} band: they compete there`
				);
			}
		}
	}
	const head = `heard ${takes.length} track${takes.length === 1 ? '' : 's'} alone, one at a time${options.source ? `, from ${options.source}` : ''}`;
	return { text: [head, ...lines].join('\n'), tracks };
}
