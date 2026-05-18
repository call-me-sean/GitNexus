import { getLanguageFromFilename, SupportedLanguages } from 'gitnexus-shared';

const WORKER_UNSAFE_LANGUAGES = new Set<SupportedLanguages>([
  SupportedLanguages.C,
  SupportedLanguages.CPlusPlus,
]);

export const hasWorkerUnsafeLanguageMix = (files: ReadonlyArray<{ path: string }>): boolean =>
  files.some((f) => {
    const language = getLanguageFromFilename(f.path);
    return language !== null && WORKER_UNSAFE_LANGUAGES.has(language);
  });
