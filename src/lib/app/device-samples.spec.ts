import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAKE_MTP_STORAGE, FAKE_MTP_TREE, FakeMtpOpxy } from '../../../test/fakes/fake-mtp';
import { testWav, withSamples, type RegionEdit } from '../../../test/fakes/xy-samples';
import { CONTAINER, MtpSession, OP, parseContainer, type MtpPipe } from '$lib/core/mtp';
import { xyToSim } from '$lib/sim/xy';
import { SampleRegistry, type SampleData } from '$lib/sound/samples';
import {
	createMemorySampleCache,
	decodeSample,
	describeSamples,
	heldSamples,
	mtpPathOf,
	readDeviceSamples,
	restoreCachedSamples,
	sampleStatus
} from './device-samples';

const blank = new Uint8Array(
	readFileSync(new URL('../core/xy/fixtures/blank-1.1.4.xy', import.meta.url))
);

const KICK = '/fat32/presets/drum/test.preset/kick.wav';
const TAKE = '/fat32/samples/user/take 1.wav';
const SNARE = 'content/samples/snare/snare boop a.wav';

/**
 * A project whose T1 kit names a preset's kick, one of the owner's recordings and a factory snare
 * (and `more`); the blank project's other kit and pad are emptied, so only these count.
 */
function project(more: Record<number, RegionEdit> = {}): Uint8Array {
	return withSamples(blank, [
		{
			t: 0,
			preset: 'drum/test',
			clear: true,
			regions: {
				0: { path: KICK, key: 53 },
				1: { path: TAKE, key: 54 },
				2: { path: SNARE, key: 55 },
				...more
			}
		},
		{ t: 1, clear: true, regions: {} },
		{ t: 7, clear: true, regions: {} }
	]);
}

/** The sample area a project loads into. */
const areaOf = (file: Uint8Array) => xyToSim(file).state.areas.sample;

/** An OP-XY in MTP mode whose drive holds the kick, the recording and `files`. */
function device(files: Record<string, string | Uint8Array> = {}): FakeMtpOpxy {
	return new FakeMtpOpxy({
		...FAKE_MTP_TREE,
		'presets/drum/test.preset/patch.json': '{"type":"drum"}',
		'presets/drum/test.preset/kick.wav': testWav(4410, 44_100, 60),
		'samples/user/take 1.wav': testWav(2205, 22_050, 880),
		...files
	});
}

/** The fake behind a pipe that refuses one file (as if it vanished) or breaks after some reads. */
class FlakyPipe implements MtpPipe {
	#reads = 0;
	constructor(
		readonly fake: FakeMtpOpxy,
		readonly options: { refuse?: string; breakAfter?: number }
	) {}
	async send(bytes: Uint8Array): Promise<void> {
		const c = parseContainer(bytes);
		if (c.type === CONTAINER.command && c.code === OP.getObject) {
			const { refuse, breakAfter } = this.options;
			if (breakAfter !== undefined && this.#reads++ >= breakAfter) {
				throw new Error('A transfer error has occurred.');
			}
			const refused = refuse ? this.fake.find(refuse) : undefined;
			if (refused?.handle === c.params[0]) this.fake.objects.delete(refused.handle);
		}
		return this.fake.send(bytes);
	}
	receive(): Promise<Uint8Array> {
		return this.fake.receive();
	}
}

async function open(pipe: MtpPipe): Promise<MtpSession> {
	const session = new MtpSession(pipe);
	await session.open();
	return session;
}

describe('the samples a project names, from the op-xy’s drive', () => {
	it('maps the firmware’s drive paths to MTP’s, and knows TE’s factory library is not there', () => {
		expect(mtpPathOf('/fat32/presets/drum/nt-aeroplane.preset/a.wav')).toBe(
			'presets/drum/nt-aeroplane.preset/a.wav'
		);
		expect(mtpPathOf('/FAT32/samples/user/x.wav')).toBe('samples/user/x.wav');
		expect(mtpPathOf(SNARE)).toBeNull();
		const area = areaOf(project({ 3: { path: KICK, key: 56 } }));
		area.tracks[2].synth.file = { ...area.tracks[0].keys[0]! };
		expect(heldSamples(area)).toEqual([
			{ path: KICK, ids: [KICK], tracks: [0, 2] },
			{ path: TAKE, ids: [TAKE], tracks: [0] },
			{ path: SNARE, ids: [SNARE], tracks: [0] }
		]);
		expect(decodeSample(testWav(10, 48_000))).toMatchObject({ sampleRate: 48_000 });
		expect(decodeSample(new TextEncoder().encode('RIFF but not a wav'))).toBeNull();
		expect(decodeSample(new Uint8Array(0))).toBeNull();
	});

	it('reads each drive sample once, hands its audio over under its id and keeps it, reading only', async () => {
		const area = areaOf(project());
		const fake = device();
		const sink = new SampleRegistry();
		const cache = createMemorySampleCache();
		const progress: string[] = [];
		const report = await readDeviceSamples({
			session: await open(fake),
			storage: FAKE_MTP_STORAGE,
			area,
			sink,
			cache,
			progress: (done, total) => progress.push(`${done}/${total}`)
		});
		expect(report).toEqual({ device: 2, factory: 1, missing: 0, skipped: [] });
		expect(progress).toEqual(['0/2', '1/2', '2/2']);
		expect(sink.ids.sort()).toEqual([KICK, TAKE].sort());
		const kick = sink.file(KICK) as SampleData;
		expect(kick.sampleRate).toBe(44_100);
		expect(kick.channels[0]).toHaveLength(4410);
		expect((sink.file(TAKE) as SampleData).sampleRate).toBe(22_050);
		// the factory snare is not on the drive: it keeps the stand-in
		expect(sink.file(SNARE)).toBeNull();
		expect(cache.files.get(KICK)).toEqual(fake.find('presets/drum/test.preset/kick.wav')!.bytes);
		expect(cache.files.get(TAKE)).toEqual(fake.find('samples/user/take 1.wav')!.bytes);
		// it listed and read, nothing else
		expect(new Set(fake.operations)).toEqual(
			new Set([OP.openSession, OP.getObjectHandles, OP.getObjectInfo, OP.getObject])
		);
		expect(describeSamples(report, 'device')).toBe(
			'2 samples from your op-xy · 1 factory sound plays the replica’s stand-ins (the op-xy does not share its factory library over usb)'
		);
	});

	it('goes on past a file that is missing, not audio, too big or at a path it cannot reach', async () => {
		const area = areaOf(
			project({
				3: { path: '/fat32/presets/drum/test.preset/gone.wav', key: 56 },
				4: { path: '/fat32/presets/drum/test.preset/notes.wav', key: 57 },
				5: { path: '/fat32/presets/drum/test.preset/huge.wav', key: 58 },
				6: { path: 'samples/odd.wav', key: 59 }
			})
		);
		const fake = device({
			'presets/drum/test.preset/notes.wav': 'just some words',
			'presets/drum/test.preset/huge.wav': new Uint8Array(200_000)
		});
		const sink = new SampleRegistry();
		const report = await readDeviceSamples({
			session: await open(fake),
			storage: FAKE_MTP_STORAGE,
			area,
			sink,
			maxBytes: 100_000
		});
		expect(report).toMatchObject({ device: 2, factory: 1, missing: 4 });
		expect(report.skipped).toEqual([
			"T1: samples/odd.wav is not a path on the op-xy's drive",
			'T1: presets/drum/test.preset/gone.wav is not on the op-xy',
			'T1: presets/drum/test.preset/notes.wav is not a wav or aiff file the replica can play',
			'T1: presets/drum/test.preset/huge.wav is 0.2 MB, more than a 20 s sample: not read'
		]);
		expect(sink.ids.sort()).toEqual([KICK, TAKE].sort());
		// read: the kick, the recording and the words; the big one never
		expect(fake.operations.filter((op) => op === OP.getObject)).toHaveLength(3);
		expect(describeSamples(report, 'device')).toMatch(
			/^2 samples from your op-xy · 4 samples could not be read · /
		);
		// and a project's samples stop at the budget
		const budget = await readDeviceSamples({
			session: await open(device()),
			storage: FAKE_MTP_STORAGE,
			area: areaOf(project()),
			sink: new SampleRegistry(),
			maxTotal: 10_000
		});
		expect(budget).toMatchObject({ device: 1, missing: 1 });
		expect(budget.skipped).toEqual([
			"T1: samples/user/take 1.wav: not read, the project's samples passed 0.0 MB"
		]);
	});

	it('goes on past a file the device refuses, and stops when the connection breaks', async () => {
		const refused = device();
		const sink = new SampleRegistry();
		const report = await readDeviceSamples({
			session: await open(new FlakyPipe(refused, { refuse: 'presets/drum/test.preset/kick.wav' })),
			storage: FAKE_MTP_STORAGE,
			area: areaOf(project()),
			sink
		});
		expect(report).toMatchObject({ device: 1, missing: 1 });
		expect(report.skipped).toEqual([
			'T1: presets/drum/test.preset/kick.wav could not be read (MTP 0x1009 failed: 0x2009 (no such object))'
		]);
		expect(sink.ids).toEqual([TAKE]);

		const broken = device({ 'samples/user/take 2.wav': testWav() });
		const area = areaOf(project({ 3: { path: '/fat32/samples/user/take 2.wav', key: 56 } }));
		const cut = await readDeviceSamples({
			session: await open(new FlakyPipe(broken, { breakAfter: 1 })),
			storage: FAKE_MTP_STORAGE,
			area,
			sink: new SampleRegistry()
		});
		expect(cut).toMatchObject({ device: 1, factory: 1, missing: 2 });
		expect(cut.skipped).toEqual([
			'T1: samples/user/take 1.wav: the op-xy stopped answering (A transfer error has occurred.); 1 more not read'
		]);
	});

	it('puts kept audio back for the files still without it, looking each path up once', async () => {
		const cache = createMemorySampleCache();
		cache.files.set(KICK, testWav(100));
		cache.files.set(TAKE, new TextEncoder().encode('not audio'));
		const area = areaOf(project());
		const sink = new SampleRegistry();
		const tried = new Set<string>();
		expect(await restoreCachedSamples({ area, sink, cache, tried })).toBe(1);
		expect(sink.ids).toEqual([KICK]);
		const status = sampleStatus(area, sink);
		expect(status).toEqual({ device: 1, factory: 1, missing: 1, skipped: [] });
		expect(describeSamples(status, 'file')).toBe(
			'1 sample kept from your op-xy · 1 sample on your op-xy: load the project from it over usb to hear it'
		);
		// audio that is there already (read from the device meanwhile) stays
		const newer: SampleData = { sampleRate: 48_000, channels: [new Float32Array(10).fill(0.1)] };
		sink.setFile(KICK, newer);
		cache.files.set(TAKE, testWav(100));
		expect(await restoreCachedSamples({ area, sink, cache, tried })).toBe(0);
		expect(sink.file(KICK)).toBe(newer);
		// a path is looked up once a visit; a fresh look finds what was kept since
		expect(await restoreCachedSamples({ area, sink, cache })).toBe(1);
		expect(sampleStatus(area, sink)).toMatchObject({ device: 2, missing: 0 });
		expect(describeSamples(sampleStatus(area, sink), 'file')).toBe(
			'2 samples kept from your op-xy'
		);
		// a project of TE's sounds only has nothing to say
		expect(describeSamples(sampleStatus(areaOf(blank), sink), 'file')).toBe('');
	});
});
