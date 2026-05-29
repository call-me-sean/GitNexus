import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/tree-sitter/parser-loader.js', () => ({
  loadParser: vi.fn(async () => ({
    parse: vi.fn(),
    getLanguage: vi.fn(),
  })),
  loadLanguage: vi.fn(async () => undefined),
  isLanguageAvailable: vi.fn(() => true),
}));

vi.mock('../../src/core/tree-sitter/safe-parse.js', () => ({
  parseSourceSafe: vi.fn(() => ({ rootNode: {} })),
}));

import { createKnowledgeGraph } from '../../src/core/graph/graph.js';
import { createASTCache } from '../../src/core/ingestion/ast-cache.js';
import { processParsing } from '../../src/core/ingestion/parsing-processor.js';
import { processImports } from '../../src/core/ingestion/import-processor.js';
import { processCalls } from '../../src/core/ingestion/call-processor.js';
import { processHeritage } from '../../src/core/ingestion/heritage-processor.js';
import { createSymbolTable } from '../../src/core/ingestion/model/symbol-table.js';
import { createResolutionContext } from '../../src/core/ingestion/model/resolution-context.js';
import * as parserLoader from '../../src/core/tree-sitter/parser-loader.js';
import * as safeParse from '../../src/core/tree-sitter/safe-parse.js';

import { _captureLogger } from '../../src/core/logger.js';
import { SupportedLanguages } from 'gitnexus-shared';
describe('sequential native parser availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safeParse.parseSourceSafe).mockImplementation(() => ({ rootNode: {} }) as never);
  });

  it('skips Swift files in processImports when the native parser is unavailable', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await expect(
      processImports(
        createKnowledgeGraph(),
        [{ path: 'App.swift', content: 'import Foundation' }],
        createASTCache(),
        createResolutionContext(),
        undefined,
        '/tmp/repo',
        ['App.swift'],
      ),
    ).resolves.toBeUndefined();

    expect(parserLoader.loadLanguage).not.toHaveBeenCalled();
  });

  it('classifies Objective-C header content for processImports language availability checks', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await processImports(
      createKnowledgeGraph(),
      [{ path: 'User.h', content: '@interface User : NSObject @end' }],
      createASTCache(),
      createResolutionContext(),
      undefined,
      '/tmp/repo',
      ['User.h'],
    );

    expect(parserLoader.isLanguageAvailable).toHaveBeenCalledWith(SupportedLanguages.ObjectiveC);
    expect(parserLoader.isLanguageAvailable).not.toHaveBeenCalledWith(SupportedLanguages.CPlusPlus);
  });

  it('warns when processImports skips files in verbose mode', async () => {
    const cap = _captureLogger();
    const previous = process.env.GITNEXUS_VERBOSE;
    process.env.GITNEXUS_VERBOSE = '1';
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await processImports(
      createKnowledgeGraph(),
      [{ path: 'App.swift', content: 'import Foundation' }],
      createASTCache(),
      createResolutionContext(),
      undefined,
      '/tmp/repo',
      ['App.swift'],
    );

    expect(
      cap
        .records()
        .some(
          (r) =>
            r.msg ===
            '[ingestion] Skipped 1 swift file(s) in import processing — swift parser not available.',
        ),
    ).toBe(true);

    cap.restore();
    if (previous === undefined) {
      delete process.env.GITNEXUS_VERBOSE;
    } else {
      process.env.GITNEXUS_VERBOSE = previous;
    }
  });

  it('skips Swift files in processCalls when the native parser is unavailable', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await expect(
      processCalls(
        createKnowledgeGraph(),
        [{ path: 'App.swift', content: 'func demo() {}' }],
        createASTCache(),
        createResolutionContext(),
      ),
    ).resolves.toEqual([]);

    expect(parserLoader.loadLanguage).not.toHaveBeenCalled();
  });

  it('classifies Objective-C header content for processCalls language availability checks', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await processCalls(
      createKnowledgeGraph(),
      [{ path: 'User.h', content: '@interface User : NSObject @end' }],
      createASTCache(),
      createResolutionContext(),
    );

    expect(parserLoader.isLanguageAvailable).toHaveBeenCalledWith(SupportedLanguages.ObjectiveC);
    expect(parserLoader.isLanguageAvailable).not.toHaveBeenCalledWith(SupportedLanguages.CPlusPlus);
  });

  it('warns when processCalls skips files in verbose mode', async () => {
    const cap = _captureLogger();
    const previous = process.env.GITNEXUS_VERBOSE;
    process.env.GITNEXUS_VERBOSE = '1';
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await processCalls(
      createKnowledgeGraph(),
      [{ path: 'App.swift', content: 'func demo() {}' }],
      createASTCache(),
      createResolutionContext(),
    );

    expect(
      cap
        .records()
        .some(
          (r) =>
            r.msg ===
            '[ingestion] Skipped 1 swift file(s) in call processing — swift parser not available.',
        ),
    ).toBe(true);

    cap.restore();
    if (previous === undefined) {
      delete process.env.GITNEXUS_VERBOSE;
    } else {
      process.env.GITNEXUS_VERBOSE = previous;
    }
  });

  it('skips Swift files in processHeritage when the native parser is unavailable', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await expect(
      processHeritage(
        createKnowledgeGraph(),
        [{ path: 'App.swift', content: 'class AppViewController: UIViewController {}' }],
        createASTCache(),
        createResolutionContext(),
      ),
    ).resolves.toBeUndefined();

    expect(parserLoader.loadLanguage).not.toHaveBeenCalled();
  });

  it('classifies Objective-C header content for processHeritage language availability checks', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await processHeritage(
      createKnowledgeGraph(),
      [{ path: 'User.h', content: '@interface User : NSObject @end' }],
      createASTCache(),
      createResolutionContext(),
    );

    expect(parserLoader.isLanguageAvailable).toHaveBeenCalledWith(SupportedLanguages.ObjectiveC);
    expect(parserLoader.isLanguageAvailable).not.toHaveBeenCalledWith(SupportedLanguages.CPlusPlus);
  });

  it('warns when processHeritage skips files in verbose mode', async () => {
    const cap = _captureLogger();
    const previous = process.env.GITNEXUS_VERBOSE;
    process.env.GITNEXUS_VERBOSE = '1';
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await processHeritage(
      createKnowledgeGraph(),
      [{ path: 'App.swift', content: 'class AppViewController: UIViewController {}' }],
      createASTCache(),
      createResolutionContext(),
    );

    expect(
      cap
        .records()
        .some(
          (r) =>
            r.msg ===
            '[ingestion] Skipped 1 swift file(s) in heritage processing — swift parser not available.',
        ),
    ).toBe(true);

    cap.restore();
    if (previous === undefined) {
      delete process.env.GITNEXUS_VERBOSE;
    } else {
      process.env.GITNEXUS_VERBOSE = previous;
    }
  });

  it('skips Swift files in processParsing when the native parser is unavailable', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await expect(
      processParsing(
        createKnowledgeGraph(),
        [{ path: 'App.swift', content: 'class AppViewController: UIViewController {}' }],
        createSymbolTable(),
        createASTCache(),
      ),
    ).resolves.toBeNull();

    expect(parserLoader.loadLanguage).not.toHaveBeenCalled();
  });

  it('warns when processParsing skips files in verbose mode', async () => {
    const cap = _captureLogger();
    const previous = process.env.GITNEXUS_VERBOSE;
    process.env.GITNEXUS_VERBOSE = '1';
    vi.mocked(parserLoader.isLanguageAvailable).mockReturnValue(false);

    await processParsing(
      createKnowledgeGraph(),
      [{ path: 'App.swift', content: 'class AppViewController: UIViewController {}' }],
      createSymbolTable(),
      createASTCache(),
    );

    expect(
      cap
        .records()
        .some(
          (r) =>
            r.msg ===
            '[ingestion] Skipped 1 swift file(s) in parsing processing — swift parser not available.',
        ),
    ).toBe(true);

    cap.restore();
    if (previous === undefined) {
      delete process.env.GITNEXUS_VERBOSE;
    } else {
      process.env.GITNEXUS_VERBOSE = previous;
    }
  });

  it('routes .mm to C++ in processParsing when Objective-C parser is unavailable', async () => {
    vi.mocked(parserLoader.isLanguageAvailable).mockImplementation(
      (lang: SupportedLanguages) =>
        lang === SupportedLanguages.CPlusPlus || lang === SupportedLanguages.TypeScript,
    );

    await processParsing(
      createKnowledgeGraph(),
      [{ path: 'Foo.mm', content: 'int main() { return 0; }' }],
      createSymbolTable(),
      createASTCache(),
    );

    expect(parserLoader.loadLanguage).toHaveBeenCalledWith(SupportedLanguages.CPlusPlus, 'Foo.mm');
    expect(parserLoader.loadLanguage).not.toHaveBeenCalledWith(
      SupportedLanguages.ObjectiveC,
      'Foo.mm',
    );
  });

  it('logs parse_failure fallback route when .mm parse fails under Objective-C and retries with C++', async () => {
    const cap = _captureLogger();

    vi.mocked(parserLoader.isLanguageAvailable).mockImplementation(
      (lang: SupportedLanguages) =>
        lang === SupportedLanguages.ObjectiveC || lang === SupportedLanguages.CPlusPlus,
    );

    let parseCalls = 0;
    vi.mocked(safeParse.parseSourceSafe).mockImplementation(() => {
      parseCalls++;
      if (parseCalls === 1) throw new Error('objc parse failed');
      return { rootNode: {} } as never;
    });

    await processParsing(
      createKnowledgeGraph(),
      [{ path: 'Foo.mm', content: 'int main() { return 0; }' }],
      createSymbolTable(),
      createASTCache(),
    );

    expect(parserLoader.loadLanguage).toHaveBeenCalledWith(SupportedLanguages.ObjectiveC, 'Foo.mm');
    expect(parserLoader.loadLanguage).toHaveBeenCalledWith(SupportedLanguages.CPlusPlus, 'Foo.mm');
    expect(
      cap
        .records()
        .some(
          (r) =>
            r.msg === '[ingestion] Language fallback routes: objectivec->cpp(.mm):parse_failure: 1',
        ),
    ).toBe(true);

    cap.restore();
  });

  it('logs parse_failure fallback route for Objective-C header classified from content', async () => {
    const cap = _captureLogger();

    vi.mocked(parserLoader.isLanguageAvailable).mockImplementation(
      (lang: SupportedLanguages) =>
        lang === SupportedLanguages.ObjectiveC || lang === SupportedLanguages.CPlusPlus,
    );

    let parseCalls = 0;
    vi.mocked(safeParse.parseSourceSafe).mockImplementation(() => {
      parseCalls++;
      if (parseCalls === 1) throw new Error('objc header parse failed');
      return { rootNode: {} } as never;
    });

    await processParsing(
      createKnowledgeGraph(),
      [{ path: 'User.h', content: '@interface User : NSObject @end' }],
      createSymbolTable(),
      createASTCache(),
    );

    expect(parserLoader.loadLanguage).toHaveBeenCalledWith(SupportedLanguages.ObjectiveC, 'User.h');
    expect(parserLoader.loadLanguage).toHaveBeenCalledWith(SupportedLanguages.CPlusPlus, 'User.h');
    expect(
      cap
        .records()
        .some(
          (r) =>
            r.msg ===
            '[ingestion] Language fallback routes: objectivec->cpp(.h/.pch):parse_failure: 1',
        ),
    ).toBe(true);

    cap.restore();
  });

  it('aggregates grammar_unavailable and parse_failure fallback reasons in one parsing run', async () => {
    const cap = _captureLogger();

    vi.mocked(parserLoader.isLanguageAvailable).mockImplementation(
      (lang: SupportedLanguages, filePath?: string) => {
        if (lang === SupportedLanguages.CPlusPlus) return true;
        if (lang !== SupportedLanguages.ObjectiveC) return false;
        return filePath !== 'NoObjc.mm';
      },
    );

    let parseCalls = 0;
    vi.mocked(safeParse.parseSourceSafe).mockImplementation(() => {
      parseCalls++;
      if (parseCalls === 2) throw new Error('objc parse failed once for parse_failure route');
      return { rootNode: {} } as never;
    });

    await processParsing(
      createKnowledgeGraph(),
      [
        { path: 'NoObjc.mm', content: 'int no_objc() { return 0; }' },
        { path: 'FailThenCpp.mm', content: 'int fail_then_cpp() { return 1; }' },
      ],
      createSymbolTable(),
      createASTCache(),
    );

    const fallbackLog = cap
      .records()
      .find((r) => r.msg?.startsWith('[ingestion] Language fallback routes: '));

    expect(fallbackLog?.msg).toContain('objectivec->cpp(.mm):grammar_unavailable: 1');
    expect(fallbackLog?.msg).toContain('objectivec->cpp(.mm):parse_failure: 1');

    cap.restore();
  });
});
