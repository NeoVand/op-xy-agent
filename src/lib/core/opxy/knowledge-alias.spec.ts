import { describe, expect, it } from 'vitest';
import sysex from '$knowledge/firmware/te-sysex.json';

describe('$knowledge alias', () => {
	it('resolves committed knowledge JSON', () => {
		expect(sysex).toBeTypeOf('object');
	});
});
