/**
 * What the app may ask of the OP-XY in MTP mode. Reading is always allowed. Writing is limited to
 * adding new objects (SendObjectInfo + SendObject), and only once the owner has approved that
 * write. Nothing that deletes, moves, overwrites or reformats is ever sent: deleting data is the
 * owner's to do (AGENTS.md, device safety), and so are device properties, capture and reset.
 */
import { OP } from './codes';

export class MtpPolicyError extends Error {
	override name = 'MtpPolicyError';
}

/** Operations that only read. */
export const MTP_READ_OPERATIONS: ReadonlySet<number> = new Set([
	OP.getDeviceInfo,
	OP.openSession,
	OP.closeSession,
	OP.getStorageIds,
	OP.getStorageInfo,
	OP.getNumObjects,
	OP.getObjectHandles,
	OP.getObjectInfo,
	OP.getObject,
	OP.getPartialObject,
	OP.getObjectPropsSupported,
	OP.getObjectPropDesc,
	OP.getObjectPropValue,
	OP.getObjectPropList,
	OP.getDevicePropDesc,
	OP.getDevicePropValue
]);

/** Operations that add a new file or folder; never replace one. */
export const MTP_WRITE_OPERATIONS: ReadonlySet<number> = new Set([
	OP.sendObjectInfo,
	OP.sendObject
]);

/** Throws unless `code` may be sent: reads always, adding objects only with `writes` on. */
export function checkMtpOperation(code: number, writes: boolean): void {
	if (MTP_READ_OPERATIONS.has(code)) return;
	const hex = `0x${code.toString(16).padStart(4, '0')}`;
	if (MTP_WRITE_OPERATIONS.has(code)) {
		if (writes) return;
		throw new MtpPolicyError(`MTP ${hex} writes to the device: it needs the owner's approval`);
	}
	throw new MtpPolicyError(`MTP ${hex} is never sent (it could delete, move or change data)`);
}
