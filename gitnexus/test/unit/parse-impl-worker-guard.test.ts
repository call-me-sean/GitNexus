import { describe, expect, it } from 'vitest';

import { hasWorkerUnsafeLanguageMix } from '../../src/core/ingestion/workers/worker-language-guard.js';

describe('hasWorkerUnsafeLanguageMix', () => {
  it('returns false for non-C/C++ inputs', () => {
    expect(
      hasWorkerUnsafeLanguageMix([
        { path: 'src/app.ts', size: 123 },
        { path: 'src/main.py', size: 456 },
      ]),
    ).toBe(false);
  });

  it('returns true when C/C++ files are present', () => {
    expect(
      hasWorkerUnsafeLanguageMix([
        { path: 'src/main.ts', size: 123 },
        { path: 'native/runtime.cpp', size: 456 },
      ]),
    ).toBe(true);
  });
});
