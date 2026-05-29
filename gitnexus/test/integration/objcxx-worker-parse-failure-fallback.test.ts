import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPipelineFromRepo, getNodesByLabel } from './resolvers/helpers.js';
import { _captureLogger } from '../../src/core/logger.js';

const DIST_WORKER = path.resolve(
  __dirname,
  '..',
  '..',
  'dist',
  'core',
  'ingestion',
  'workers',
  'parse-worker.js',
);
const hasDistWorker = fs.existsSync(DIST_WORKER);

if (!hasDistWorker && process.env.CI) {
  throw new Error(
    'dist/parse-worker.js missing on CI — worker parse-fallback integration would silently skip. Ensure build runs before this suite.',
  );
}

function writeFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-objcxx-fallback-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

function removeFixture(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

describe.skipIf(!hasDistWorker)('worker Objective-C++ fallback on parse failure', () => {
  const repoRoot = writeFixture({
    'src/main.mm': `int add(int a, int b) { return a + b; }\n`,
  });

  afterAll(() => removeFixture(repoRoot));

  it('falls back to C++ when Objective-C parse fails and logs parse_failure route', async () => {
    const prev = process.env.GITNEXUS_TEST_FORCE_MM_OBJC_PARSE_FAILURE;
    process.env.GITNEXUS_TEST_FORCE_MM_OBJC_PARSE_FAILURE = '1';
    const cap = _captureLogger();

    try {
      const result = await runPipelineFromRepo(repoRoot, () => undefined, {
        skipGraphPhases: true,
        skipWorkers: false,
        workerThresholdsForTest: { minFiles: 1, minBytes: 1 },
        workerUrlForTest: pathToFileURL(DIST_WORKER) as URL,
      });

      expect(getNodesByLabel(result, 'Function')).toContain('add');
      expect(
        cap
          .records()
          .some(
            (r) =>
              r.msg ===
              '[ingestion] Language fallback routes: objectivec->cpp(.mm):parse_failure: 1',
          ),
      ).toBe(true);
    } finally {
      cap.restore();
      if (prev === undefined) delete process.env.GITNEXUS_TEST_FORCE_MM_OBJC_PARSE_FAILURE;
      else process.env.GITNEXUS_TEST_FORCE_MM_OBJC_PARSE_FAILURE = prev;
    }
  });
});
