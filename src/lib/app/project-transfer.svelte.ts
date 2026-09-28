/**
 * The virtual OP-XY's project as the device's own `.xy` file (M6): open one from disk or from a
 * connected OP-XY over USB (MTP, `com → M4`), download the replica's project as one, or add it to
 * the OP-XY's `projects/user` folder.
 *
 * - **Loading** replaces the replica's project (`sim/xy` xyToSim) and can be undone once.
 * - **Saving to the device** only adds a new file, after the owner's click, and never replaces one
 *   (`core/mtp` policy). It is written over the project open on the device, so the device's sounds
 *   and everything the file map has not decoded stay as they are (`sim/xy` simToXy).
 * - **Downloading** writes over the last project file read (disk or device), else over the blank
 *   project a device saved.
 *
 * What a file holds that the other side cannot take is listed in `skipped`, one line each.
 */
import { MtpPolicyError } from '$lib/core/mtp';
import { MtpConnection, type UsbLike } from '$lib/device/mtp';
import { restore, snapshot } from '$lib/sim/areas/system/projects';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import { simToXy, xyToSim } from '$lib/sim/xy';

/** The project the OP-XY has open, as MTP shows it (docs/research/90-device-probe.md). */
export const DEVICE_WORKSPACE = 'projects/workspace.xy';
/** Where the device keeps the user's projects. */
export const DEVICE_PROJECTS = 'projects/user';
/** A project name the device takes: lowercase letters, digits, spaces and `#()-_`, at most 24. */
export const PROJECT_NAME = /^[a-z0-9][a-z0-9 #()_-]{0,23}$/;

export interface ProjectTransferOptions {
	readonly sim: OpxySim;
	/** WebUSB, or null where the browser has none. */
	readonly usb: UsbLike | null;
	/** The blank project a device saved (the writer's template when no other file is at hand). */
	readonly blank: () => Promise<Uint8Array>;
}

export class ProjectTransfer {
	busy = $state(false);
	/** What the last action did, in a line. */
	message = $state<string | null>(null);
	error = $state<string | null>(null);
	/** What the last load, download or save could not carry. */
	skipped = $state<string[]>([]);
	canUndo = $state(false);

	readonly #sim: OpxySim;
	readonly #usb: UsbLike | null;
	readonly #blank: () => Promise<Uint8Array>;
	#undo: { json: string; name: string } | null = null;
	/** The last project file read: what a download is written over, so its sounds stay. */
	#template: Uint8Array | null = null;

	constructor(options: ProjectTransferOptions) {
		this.#sim = options.sim;
		this.#usb = options.usb;
		this.#blank = options.blank;
	}

	get usbAvailable(): boolean {
		return this.#usb !== null;
	}

	/** Puts a project file into the replica, keeping what it replaced for one undo. */
	load(bytes: Uint8Array, name: string): void {
		const state = this.#sim.state;
		const { state: loaded, skipped } = xyToSim(bytes, $state.snapshot(state) as SimState);
		this.#undo = { json: snapshot(state), name: state.project.name };
		restore(state, snapshot(loaded), name);
		this.#template = bytes;
		this.skipped = skipped;
		this.canUndo = true;
		this.message = `loaded ${name}`;
		this.error = null;
	}

	/** Opens a `.xy` file from disk. */
	async openFile(file: File): Promise<void> {
		await this.#run(async () => {
			this.load(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.xy$/i, ''));
		});
	}

	/** The replica's project as a `.xy` file, and the name to save it under. */
	async download(): Promise<{ bytes: Uint8Array; name: string } | null> {
		let out: { bytes: Uint8Array; name: string } | null = null;
		await this.#run(async () => {
			const template = this.#template ?? (await this.#blank());
			const { bytes, skipped } = simToXy($state.snapshot(this.#sim.state) as SimState, template);
			this.skipped = skipped;
			out = { bytes, name: `${this.#sim.state.project.name || 'project'}.xy` };
			this.message = `wrote ${out.name}`;
		});
		return out;
	}

	/** Loads the project the OP-XY has open, over USB. Call from a click: the browser asks first. */
	async loadFromDevice(): Promise<void> {
		const usb = this.#usb;
		if (!usb) return;
		await this.#run(async () => {
			const connection = await MtpConnection.request(usb);
			try {
				const { session } = connection;
				await session.open();
				const [storage] = await session.storageIds();
				const workspace = await session.resolve(storage, DEVICE_WORKSPACE);
				if (!workspace || workspace.folder) throw new Error('the op-xy shows no open project');
				const bytes = await session.read(workspace.handle);
				this.load(bytes, 'op-xy project');
			} finally {
				await connection.close();
			}
		});
	}

	/**
	 * Adds the replica's project to the OP-XY as `projects/user/<name>.xy`, written over the project
	 * the device has open. Call from the owner's confirming click. Returns the path, or null.
	 */
	async saveToDevice(name: string): Promise<string | null> {
		const usb = this.#usb;
		if (!usb) return null;
		if (!PROJECT_NAME.test(name)) {
			this.error = 'a name of lowercase letters, digits and spaces, at most 24';
			return null;
		}
		let path: string | null = null;
		await this.#run(async () => {
			const connection = await MtpConnection.request(usb);
			try {
				const { session } = connection;
				await session.open();
				const [storage] = await session.storageIds();
				const workspace = await session.resolve(storage, DEVICE_WORKSPACE);
				const template =
					workspace && !workspace.folder
						? await session.read(workspace.handle)
						: await this.#blank();
				const { bytes, skipped } = simToXy($state.snapshot(this.#sim.state) as SimState, template);
				const folder = await session.resolve(storage, DEVICE_PROJECTS);
				if (!folder?.folder) throw new MtpPolicyError(`the op-xy has no ${DEVICE_PROJECTS} folder`);
				session.allowWrites();
				await session.write(storage, folder.handle, `${name}.xy`, bytes);
				this.skipped = skipped;
				path = `${DEVICE_PROJECTS}/${name}.xy`;
				this.message = `saved as ${path}`;
			} finally {
				await connection.close();
			}
		});
		return path;
	}

	/** Puts back the project the last load replaced. */
	undo(): void {
		if (!this.#undo) return;
		restore(this.#sim.state, this.#undo.json, this.#undo.name);
		this.#undo = null;
		this.canUndo = false;
		this.skipped = [];
		this.message = 'the replica’s project is back';
	}

	async #run(task: () => Promise<void>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.error = null;
		this.message = null;
		try {
			await task();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.busy = false;
		}
	}
}
