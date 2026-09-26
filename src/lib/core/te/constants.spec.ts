import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import teSysex from '$knowledge/firmware/te-sysex.json';
import { decodeStatus, pack7 } from './codec';
import {
	OPXY_DEVICE_ID,
	OPXY_SKU,
	TE_CMD,
	TE_DEBUG_MARKER,
	TE_DEFAULT_TIMEOUT_MS,
	TE_DFU,
	TE_FILE,
	TE_FILE_EVENT,
	TE_FILE_INIT_FLAG_SUBSCRIBE,
	TE_FILE_METADATA,
	TE_FILE_NODE_FLAG,
	TE_FLAG_HAS_REQUEST_ID,
	TE_FLAG_IS_REQUEST,
	TE_MANUFACTURER_ID,
	TE_PROTOCOL_MARKER,
	TE_SETTINGS,
	TE_STATUS
} from './constants';
import { hex } from './fixtures';
import { parseTeIdentityReply } from './identity';

// The parts of knowledge/firmware/te-sysex.json that the TS constants mirror.
const Knowledge = z.object({
	manufacturer_id: z.array(z.number()),
	opxy: z.object({
		sku: z.string(),
		sysex_device_id: z.number(),
		identity_reply_observed: z.string(),
		identity_family: z.number(),
		identity_member: z.number()
	}),
	frame: z.object({
		byte5_protocol_marker: z.number(),
		byte5_debug_log_marker: z.number(),
		flags: z.object({ BIT_IS_REQUEST: z.number(), BIT_REQUEST_ID_AVAILABLE: z.number() }),
		timeouts_ms: z.object({ default: z.number() })
	}),
	packed7: z.object({ example: z.object({ raw: z.string(), encoded: z.string() }) }),
	status: z.record(z.string(), z.string()),
	commands: z.array(
		z.object({
			cmd: z.number(),
			name: z.string(),
			subcommands: z.record(z.string(), z.string()).optional(),
			node_flags: z.record(z.string(), z.number()).optional(),
			events: z.record(z.string(), z.string()).optional()
		})
	)
});

const knowledge = Knowledge.parse(teSysex);

function command(name: string) {
	const found = knowledge.commands.find((c) => c.name === name);
	if (found === undefined) throw new Error(`te-sysex.json has no ${name} command`);
	return found;
}

/** `{"1": "INIT: [01, …]", …}` → `{INIT: 1, …}` (the name is the text before the first colon). */
function subcommandNumbers(name: string): Record<string, number> {
	const subcommands = command(name).subcommands ?? {};
	return Object.fromEntries(
		Object.entries(subcommands).map(([number, text]) => [text.split(':')[0], Number(number)])
	);
}

describe('constants match knowledge/firmware/te-sysex.json', () => {
	it('manufacturer id, markers, flags and default timeout', () => {
		expect([...TE_MANUFACTURER_ID]).toEqual(knowledge.manufacturer_id);
		expect(TE_PROTOCOL_MARKER).toBe(knowledge.frame.byte5_protocol_marker);
		expect(TE_DEBUG_MARKER).toBe(knowledge.frame.byte5_debug_log_marker);
		expect(TE_FLAG_IS_REQUEST).toBe(knowledge.frame.flags.BIT_IS_REQUEST);
		expect(TE_FLAG_HAS_REQUEST_ID).toBe(knowledge.frame.flags.BIT_REQUEST_ID_AVAILABLE);
		expect(TE_DEFAULT_TIMEOUT_MS).toBe(knowledge.frame.timeouts_ms.default);
	});

	it('command numbers, both ways', () => {
		expect(Object.fromEntries(knowledge.commands.map((c) => [c.name, c.cmd]))).toEqual(TE_CMD);
	});

	it('FILE sub-commands, node flags and events', () => {
		expect(subcommandNumbers('FILE')).toEqual(TE_FILE);
		const nodeFlags = Object.fromEntries(
			Object.entries(command('FILE').node_flags ?? {}).map(([name, bit]) => [
				name.toUpperCase(),
				bit
			])
		);
		expect(nodeFlags).toEqual(TE_FILE_NODE_FLAG);
		const events = Object.fromEntries(
			Object.entries(command('FILE').events ?? {}).map(([number, name]) => [name, Number(number)])
		);
		expect(events).toEqual(TE_FILE_EVENT);
	});

	it('FILE METADATA operations and the INIT subscribe flag', () => {
		const text = command('FILE').subcommands?.['7'] ?? '';
		const operations = Object.fromEntries(
			[...text.matchAll(/\[07, 0(\d) (\w+)/g)].map((m) => [m[2], Number(m[1])])
		);
		expect(operations).toEqual(TE_FILE_METADATA);
		const init = command('FILE').subcommands?.['1'] ?? '';
		expect(init).toContain(`${TE_FILE_INIT_FLAG_SUBSCRIBE} = subscribe`);
	});

	it('SETTINGS and DFU sub-commands', () => {
		expect(subcommandNumbers('SETTINGS')).toEqual(TE_SETTINGS);
		expect(subcommandNumbers('DFU')).toEqual(TE_DFU);
	});

	it('status codes and labels', () => {
		const status = knowledge.status;
		expect(status[String(TE_STATUS.OK)]).toBe(decodeStatus(TE_STATUS.OK).label);
		expect(status[String(TE_STATUS.ERROR)]).toBe(decodeStatus(TE_STATUS.ERROR).label);
		expect(status[String(TE_STATUS.COMMAND_NOT_FOUND)]).toBe(
			decodeStatus(TE_STATUS.COMMAND_NOT_FOUND).label
		);
		expect(status[String(TE_STATUS.BAD_REQUEST)]).toBe(decodeStatus(TE_STATUS.BAD_REQUEST).label);
		const range = `${TE_STATUS.SPECIFIC_ERROR_START}-${TE_STATUS.SPECIFIC_ERROR_END}`;
		expect(status[range]).toBe(decodeStatus(TE_STATUS.SPECIFIC_ERROR_START).label);
		const inProgress = status[`>=${TE_STATUS.SPECIFIC_SUCCESS_START}`] ?? '';
		expect(inProgress.startsWith(decodeStatus(TE_STATUS.SPECIFIC_SUCCESS_START).label)).toBe(true);
	});

	it('the packed-7 example', () => {
		expect(pack7(hex(knowledge.packed7.example.raw))).toEqual(
			hex(knowledge.packed7.example.encoded)
		);
	});

	it('the OP-XY identity', () => {
		const identity = parseTeIdentityReply(hex(knowledge.opxy.identity_reply_observed));
		expect(identity).toMatchObject({
			deviceId: knowledge.opxy.sysex_device_id,
			familyCode: knowledge.opxy.identity_family,
			member: knowledge.opxy.identity_member,
			sku: knowledge.opxy.sku
		});
		expect(OPXY_DEVICE_ID).toBe(knowledge.opxy.sysex_device_id);
		expect(OPXY_SKU).toBe(knowledge.opxy.sku);
	});
});
