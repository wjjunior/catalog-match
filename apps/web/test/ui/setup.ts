import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only registers its own cleanup when vitest runs with globals.
afterEach(cleanup);
