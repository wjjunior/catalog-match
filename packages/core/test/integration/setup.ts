import { fileURLToPath } from 'node:url';

import { createCore } from '../../src/application/createCore';

export const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/** Built once per test file: createCore parses both CSVs and indexes the catalog at
 * construction, which is the cost the p95 measurement must not pay per query. */
export const core = createCore({ dataDir: DATA_DIR });
