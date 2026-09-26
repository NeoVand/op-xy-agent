// The app has one replica state: the home page draws it, the device bridge mirrors the OP-XY into it,
// and the agent animates procedures on it ("shift + M1"). The root layout creates it.
import { createContext } from 'svelte';
import type { ReplicaState } from './state.svelte';

/** Typed context for the app-wide {@link ReplicaState}. */
export const [getReplicaState, setReplicaState] = createContext<ReplicaState>();
