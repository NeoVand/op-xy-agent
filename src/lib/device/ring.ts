/**
 * A fixed-capacity ring buffer: pushing past capacity overwrites the oldest item in O(1). The
 * monitor keeps its last few thousand events in one, so a running MIDI clock (48 messages a second
 * at 120 BPM) never grows memory or costs a `splice` per message (a MIDI Lab monitor issue).
 */
export class RingBuffer<T> {
	readonly capacity: number;
	#items: (T | undefined)[];
	/** Index of the next write. */
	#head = 0;
	#size = 0;

	constructor(capacity: number) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new RangeError(`ring buffer capacity must be a positive integer, got ${capacity}`);
		}
		this.capacity = capacity;
		this.#items = new Array<T | undefined>(capacity);
	}

	/** Adds an item, dropping the oldest when full. */
	push(item: T): void {
		this.#items[this.#head] = item;
		this.#head = (this.#head + 1) % this.capacity;
		if (this.#size < this.capacity) this.#size++;
	}

	/** Number of items held. */
	get size(): number {
		return this.#size;
	}

	/** The item `age` places back from the newest (0 = newest), or undefined. */
	fromNewest(age: number): T | undefined {
		if (!Number.isInteger(age) || age < 0 || age >= this.#size) return undefined;
		return this.#items[(this.#head - 1 - age + this.capacity * 2) % this.capacity];
	}

	/** Items from newest to oldest. */
	*newestFirst(): IterableIterator<T> {
		for (let age = 0; age < this.#size; age++) yield this.fromNewest(age) as T;
	}

	/** Items from oldest to newest, as a new array. */
	toArray(): T[] {
		const out: T[] = [];
		for (let age = this.#size - 1; age >= 0; age--) out.push(this.fromNewest(age) as T);
		return out;
	}

	/** Removes everything. */
	clear(): void {
		this.#items = new Array<T | undefined>(this.capacity);
		this.#head = 0;
		this.#size = 0;
	}
}
