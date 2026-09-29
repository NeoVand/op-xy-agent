/**
 * The virtual OP-XY's project as the device's own `.xy` file (M6): open one from disk or from a
 * connected OP-XY over USB (MTP, `com → M4`), download the replica's project as one, or add it to
 * the OP-XY's `projects/user` folder; or start again from a new project.
 *
 * - **Loading** replaces the replica's project (`sim/xy` xyToSim) and can be undone once. From the
 *   device, the samples the project's tracks use are read too, in the same session, so the replica
 *   plays the unit's own sounds (`device-samples`: TE's factory library is not on the drive, so its
 *   sounds stay stand-ins); from disk, samples read from the device before are put back.
 * - **A new project** is the device's hold M1 on the project page: the open project is autosaved to
 *   the projects folder (autosave permitting) and a new one starts with the default sounds; it can
 *   be undone once too.
 * - **Saving to the device** only adds a new file, after the owner's click, and never replaces one
 *   (`core/mtp` policy). It is written over the project open on the device, so the device's sounds
 *   and everything the file map has not decoded stay as they are (`sim/xy` simToXy).
 * - **Downloading** writes over the last project file read (disk or device), else over the blank
 *   project a device saved.
 *
 * What a file holds that the other side cannot take is listed in `skipped`, one line each.
 */
import { MtpPolicyError, type MtpSession } from '$lib/core/mtp';
import { MtpConnection, type UsbLike } from '$lib/device/mtp';
import { newProject, restore, snapshot } from '$lib/sim/areas/system/projects';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import { simToXy, xyToSim } from '$lib/sim/xy';
import { describeSamples, type SampleReport } from './device-samples';

/** The project the OP-XY has open, as MTP shows it (docs/research/90-device-probe.md). */
export const DEVICE_WORKSPACE = 'projects/workspace.xy';
/** Where the device keeps the user's projects. */
export const DEVICE_PROJECTS = 'projects/user';
/** A project name the device takes: lowercase letters, digits, spaces and `#()-_`, at most 24. */
export const PROJECT_NAME = /^[a-z0-9][a-z0-9 #()_-]{0,23}$/;

/** What a transfer needs of the app's samples (`DeviceSamples`). */
export interface ProjectSamples {
	/** Reads the drive samples the replica's project holds over an open session (reads only). */
	read(
		session: Pick<MtpSession, 'list' | 'read'>,
		storage: number,
		progress?: (done: number, total: number) => void
	): Promise<SampleReport>;
	/** Puts back audio kept from earlier loads for the project's samples that have none. */
	restore(): Promise<number>;
	/** Which of the project's samples play the unit's audio. */
	status(): SampleReport;
}

export interface ProjectTransferOptions {
	readonly sim: OpxySim;
	/** WebUSB, or null where the browser has none. */
	readonly usb: UsbLike | null;
	/** The blank project a device saved (the writer's template when no other file is at hand). */
	readonly blank: () => Promise<Uint8Array>;
	/** The replica's project was replaced (loaded, new, undone): the app saves it soon. */
	readonly changed?: () => void;
	/** The samples a project uses: read from the device with it, put back from disk loads (none: stand-ins). */
	readonly samples?: ProjectSamples | null;
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
	readonly #changed: () => void;
	readonly #samples: ProjectSamples | null;
	#undo: { json: string; name: string } | null = null;
	/** The last project file read: what a download is written over, so its sounds stay. */
	#template: Uint8Array | null = null;

	constructor(options: ProjectTransferOptions) {
		this.#sim = options.sim;
		this.#usb = options.usb;
		this.#blank = options.blank;
		this.#changed = options.changed ?? (() => {});
		this.#samples = options.samples ?? null;
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
		this.#changed();
	}

	/** Starts a new project with the default sounds, keeping what it replaced for one undo. */
	newProject(): void {
		const state = this.#sim.state;
		this.#undo = { json: snapshot(state), name: state.project.name };
		newProject(state);
		// a download starts from the blank project again, not from the last file read
		this.#template = null;
		this.skipped = [];
		this.canUndo = true;
		this.message = `new project: ${state.project.name}, the default sounds`;
		this.error = null;
		this.#changed();
	}

	/** Opens a `.xy` file from disk; samples read from the device before play again. */
	async openFile(file: File): Promise<void> {
		await this.#run(async () => {
			this.load(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.xy$/i, ''));
			await this.#keptSamples();
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
				await this.#deviceSamples(session, storage);
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
		this.#changed();
	}

	/**
	 * Reads the loaded project's samples from the device, in the session it came over, saying how
	 * far it got. The project is loaded whatever happens here: a failure is noted, not thrown.
	 */
	async #deviceSamples(session: MtpSession, storage: number): Promise<void> {
		const samples = this.#samples;
		if (!samples) return;
		const loaded = this.message ?? 'loaded';
		try {
			const report = await samples.read(session, storage, (done, total) => {
				if (total > 0 && done < total) {
					this.message = `${loaded} · reading its samples from the op-xy: ${done + 1} of ${total}`;
				}
			});
			this.message = [loaded, describeSamples(report, 'device')].filter(Boolean).join(' · ');
			this.skipped = [...this.skipped, ...report.skipped];
		} catch (e) {
			this.message = `${loaded} · its samples could not be read`;
			this.skipped = [...this.skipped, `samples: ${e instanceof Error ? e.message : String(e)}`];
		}
	}

	/** After a load from disk: puts back the samples kept from the device, and says so. */
	async #keptSamples(): Promise<void> {
		const samples = this.#samples;
		if (!samples) return;
		await samples.restore().catch(() => 0);
		const said = describeSamples(samples.status(), 'file');
		if (said) this.message = `${this.message ?? 'loaded'} · ${said}`;
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
