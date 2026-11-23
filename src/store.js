// -----------------------------------------------------------------------------
// Persistence of the virtual battery ledger.
//
// The stock of the virtual battery is the sum of everything ever injected and
// withdrawn: losing it on a restart would be losing the battery. The ledger is
// kept as JSON under /data, the only writable volume of the container (the
// rootfs is read-only), and written atomically (temporary file + rename) so a
// crash mid-write never leaves a truncated file behind.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

const FILE_NAME = 'virtual-battery.json';

/**
 * @param {string} [dir] directory of the ledger (`DATA_DIR` env var, `/data`)
 */
export function createStore(dir = process.env.DATA_DIR ?? '/data') {
  const file = path.join(dir, FILE_NAME);
  return {
    file,

    /** The saved ledger, or `null` on the first start. */
    async load() {
      try {
        return JSON.parse(await readFile(file, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          // A corrupted file must not silently reset the battery to zero
          // without a trace: say it loudly, then start over.
          logger.error(`Cannot read ${file}, starting from an empty ledger`, err);
        }
        return null;
      }
    },

    async save(state) {
      await mkdir(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await rename(tmp, file);
    },
  };
}
