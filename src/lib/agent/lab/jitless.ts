/**
 * zod decides when a schema is made whether it will compile a fast parser with `new Function`, and
 * the lab worker takes code generation away (`lockdown.ts`) before its schemas first parse. So the
 * worker imports this module before any other: every schema the lab makes is made without it. This
 * module's one effect is that setting, which is why it exists apart from `worker.ts`.
 */
import { z } from 'zod';

z.config({ jitless: true });
