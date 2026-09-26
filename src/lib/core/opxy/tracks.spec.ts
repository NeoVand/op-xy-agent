import { describe, expect, it } from 'vitest';
import { getControl } from './controls';
import { ccMapFile } from './data';
import { CcMapError } from './errors';
import {
	AUXILIARY_TRACKS,
	ENGINES,
	ENGINE_IDS,
	FX_ENGINES,
	INSTRUMENT_TRACKS,
	TRACKS,
	getEngine,
	getFxEngine,
	getTrack,
	trackForChannel,
	trackForKey
} from './tracks';

describe('tracks', () => {
	it('lists the 16 tracks in order: 8 instrument, then the 8 auxiliary types', () => {
		expect(TRACKS.map((t) => t.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
		expect(TRACKS.map((t) => t.type)).toEqual([
			...Array(8).fill('instrument'),
			'brain',
			'punchIn',
			'externalMidi',
			'externalCv',
			'externalAudio',
			'tape',
			'fx',
			'fx'
		]);
		expect(INSTRUMENT_TRACKS).toHaveLength(8);
		expect(AUXILIARY_TRACKS).toHaveLength(8);
	});

	it('listens on channel N − 1 (0-based) by default', () => {
		expect(TRACKS.map((t) => t.defaultChannel)).toEqual(Array.from({ length: 16 }, (_, i) => i));
	});

	it('maps both banks onto the same eight track keys', () => {
		expect(TRACKS.map((t) => t.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
		for (const track of TRACKS) expect(getControl(track.keyId).index).toBe(track.slot);
		expect(trackForKey('instrument', 'track.1').number).toBe(1);
		expect(trackForKey('auxiliary', 'track.1').name).toBe('brain');
		expect(trackForKey('auxiliary', 'track.8').number).toBe(16);
	});

	it('names the auxiliary tracks the way the guide does', () => {
		expect(AUXILIARY_TRACKS.map((t) => t.alias)).toEqual([
			'T1 brain',
			'T2 punch-in FX',
			'T3 external MIDI',
			'T4 external CV',
			'T5 external audio',
			'T6 tape',
			'T7 FX I',
			'T8 FX II'
		]);
		expect(INSTRUMENT_TRACKS.map((t) => t.alias)).toEqual(
			Array.from({ length: 8 }, (_, i) => `T${i + 1}`)
		);
		expect(getTrack(3).name).toBe('track 3');
	});

	it('knows the default sounds of a fresh project', () => {
		expect(INSTRUMENT_TRACKS.map((t) => t.defaultEngine)).toEqual([
			'drum',
			'drum',
			'prism',
			'epiano',
			'dissolve',
			'hardsync',
			'axis',
			'multisampler'
		]);
		expect(AUXILIARY_TRACKS.every((t) => t.defaultEngine === null)).toBe(true);
		expect([getTrack(15).defaultEffect, getTrack(16).defaultEffect]).toEqual(['delay', 'reverb']);
		expect(getTrack(15).role).toBe('fx1');
		expect(ccMapFile.channels.defaults[14].description).toMatch(/default delay/);
		expect(ccMapFile.channels.defaults[15].description).toMatch(/default reverb/);
	});

	it('marks which tracks have an M4 LFO page', () => {
		expect(TRACKS.filter((t) => !t.hasLfo).map((t) => t.type)).toEqual([
			'brain',
			'punchIn',
			'externalCv'
		]);
	});

	it('rejects tracks and channels out of range', () => {
		for (const bad of [0, 17, 1.5, NaN]) expect(() => getTrack(bad)).toThrow(CcMapError);
		expect(trackForChannel(10).type).toBe('externalMidi');
		for (const bad of [-1, 16, 0.5]) expect(() => trackForChannel(bad)).toThrow(CcMapError);
	});
});

describe('engines', () => {
	it('matches the engine list of the CC map', () => {
		expect([...ENGINE_IDS].sort()).toEqual(
			[...ccMapFile.trackTypes.instrument.appliesToEngines].sort()
		);
		expect([...ENGINE_IDS].sort()).toEqual(Object.keys(ccMapFile.engines).sort());
		expect(ENGINES.filter((e) => e.kind === 'synth')).toHaveLength(8);
		expect(ENGINES.filter((e) => e.kind === 'sampler').map((e) => e.id)).toEqual([
			'drum',
			'multisampler',
			'sampler'
		]);
	});

	it('names each engine’s M1 parameters', () => {
		expect(getEngine('prism').params).toEqual(['shape', 'ratio', 'detune', 'stereo']);
		expect(getEngine('midi').params[3]).toBeNull();
		expect(getEngine(' Wavetable ').id).toBe('wavetable');
	});

	it('resolves the pre-1.0.15 name "external" to the midi engine', () => {
		expect(getEngine('external').id).toBe('midi');
		expect(() => getEngine('cluster')).toThrow(/unknown engine "cluster"/);
	});

	it('knows the six send effects and their .xy type bytes', () => {
		expect(FX_ENGINES.map((f) => [f.id, f.typeByte])).toEqual([
			['chorus', 12],
			['delay', 0],
			['distortion', 14],
			['lofi', 15],
			['phaser', 13],
			['reverb', 5]
		]);
		expect(getFxEngine('Reverb').params[0]).toBe('size');
		expect(() => getFxEngine('flanger')).toThrow(CcMapError);
	});
});
