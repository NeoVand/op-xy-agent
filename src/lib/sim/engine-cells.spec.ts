import { describe, expect, it } from 'vitest';
import { RATIOS } from '$lib/sound/synth/engines/prism';
import { TABLES } from '$lib/sound/synth/engines/wavetable';
import { PRISM_RATIOS, WAVETABLES, engineCell } from './params';

const cc = (v: number) => (v / 127) * 99;

describe('engine top bars as the device writes them (research 59 §2.5)', () => {
	it('names the same ratios and tables the sound engines play', () => {
		const fraction = (m: number) => (m < 1 ? `${1 / m}:1` : m === 1.5 ? '2:3' : `1:${m}`);
		expect(PRISM_RATIOS).toEqual(RATIOS.map(fraction));
		expect(WAVETABLES).toEqual(TABLES.map((t) => t.name));
	});

	it('writes prism’s ratio as a fraction and wavetable’s table by name, as the captures read', () => {
		// CC 0, 64 and 127 read 2:1, 1:4 and 1:16 on the device
		expect([0, 64, 127].map((v) => engineCell('prism', 1, cc(v)).value)).toEqual([
			'2:1',
			'1:4',
			'1:16'
		]);
		// … and basic, fibonacci and zap, with no number beside the name
		expect([0, 64, 127].map((v) => engineCell('wavetable', 0, cc(v)))).toEqual([
			{ label: 'basic', value: '' },
			{ label: 'fibonacci', value: '' },
			{ label: 'zap', value: '' }
		]);
		expect(engineCell('epiano', 2, 41)).toEqual({ label: 'tine', value: '41' });
	});
});
