import { SupportedLanguages, type ParsedFile } from 'gitnexus-shared';
import { buildMro, defaultLinearize } from '../../scope-resolution/passes/mro.js';
import type { ScopeResolver } from '../../scope-resolution/contract/scope-resolver.js';
import { kotlinProvider } from '../kotlin.js';
import {
  kotlinArityCompatibility,
  kotlinMergeBindings,
  populateKotlinOwners,
  resolveKotlinImportTarget,
  type KotlinResolveContext,
} from './index.js';

/**
 * Kotlin scope resolver for RFC #909 Ring 3.
 *
 * Kotlin is registered for scope-resolution but execution is currently
 * held behind a phase-level safety gate while parity hardening continues.
 */
export const kotlinScopeResolver: ScopeResolver = {
  language: SupportedLanguages.Kotlin,
  languageProvider: kotlinProvider,
  importEdgeReason: 'kotlin-scope: import',

  resolveImportTarget: (targetRaw, fromFile, allFilePaths) => {
    const ws: KotlinResolveContext = { fromFile, allFilePaths };
    return resolveKotlinImportTarget(
      { kind: 'named', localName: '_', importedName: '_', targetRaw },
      ws,
    );
  },

  mergeBindings: (existing, incoming) => [...kotlinMergeBindings([...existing, ...incoming])],

  arityCompatibility: (callsite, def) => kotlinArityCompatibility(def, callsite),

  buildMro: (graph, parsedFiles, nodeLookup) =>
    buildMro(graph, parsedFiles, nodeLookup, defaultLinearize),

  populateOwners: (parsed: ParsedFile) => populateKotlinOwners(parsed),

  isSuperReceiver: (text) => text.trim() === 'super',

  fieldFallbackOnMethodLookup: false,
  propagatesReturnTypesAcrossImports: true,
  collapseMemberCallsByCallerTarget: false,
  hoistTypeBindingsToModule: true,
};
