#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyHeaderLanguageFromContentDetailed,
  getLanguageFromFilename,
  getLanguageFromFilenameWithContent,
  SupportedLanguages,
  type HeaderLanguageClassification,
} from 'gitnexus-shared';

type Summary = {
  repo: string;
  headers: number;
  classCounts: Record<HeaderLanguageClassification, number>;
  mixedBreakdown: {
    objcDominant: number;
    balanced: number;
    cppDominant: number;
  };
  routeCounts: {
    legacyCpp: number;
    contentObjc: number;
    contentCpp: number;
    contentC: number;
  };
  divergence: {
    changed: number;
    unchanged: number;
  };
  ambiguity: {
    mixed: number;
    unknown: number;
  };
  samples: {
    changedToObjc: string[];
    changedToC: string[];
    mixed: string[];
  };
};

const SKIP_DIRS = new Set([
  '.git',
  '.gitnexus',
  'node_modules',
  'Pods',
  'build',
  'dist',
  'out',
  'DerivedData',
  'vendor',
  'target',
]);

const isHeaderLike = (file: string): boolean => {
  const lower = file.toLowerCase();
  return lower.endsWith('.h') || lower.endsWith('.pch');
};

const walkHeaders = (root: string): string[] => {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile() && isHeaderLike(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
};

const emptySummary = (repo: string): Summary => ({
  repo,
  headers: 0,
  classCounts: { c: 0, cpp: 0, objectivec: 0, mixed: 0, unknown: 0 },
  mixedBreakdown: { objcDominant: 0, balanced: 0, cppDominant: 0 },
  routeCounts: { legacyCpp: 0, contentObjc: 0, contentCpp: 0, contentC: 0 },
  divergence: { changed: 0, unchanged: 0 },
  ambiguity: { mixed: 0, unknown: 0 },
  samples: { changedToObjc: [], changedToC: [], mixed: [] },
});

const pushSample = (arr: string[], value: string, limit = 8): void => {
  if (arr.length < limit) arr.push(value);
};

const analyzeRepo = (repoPath: string): Summary => {
  const summary = emptySummary(path.basename(repoPath));
  const headers = walkHeaders(repoPath);

  for (const abs of headers) {
    let content = '';
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    const rel = path.relative(repoPath, abs).replace(/\\/g, '/');
    summary.headers += 1;

    const detailed = classifyHeaderLanguageFromContentDetailed(content);
    summary.classCounts[detailed.classification] += 1;

    if (detailed.classification === 'mixed') {
      summary.ambiguity.mixed += 1;
      pushSample(summary.samples.mixed, rel);
      const objcHits = detailed.objcSignals.length;
      const cppHits = detailed.cppSignals.length;
      if (objcHits > cppHits) summary.mixedBreakdown.objcDominant += 1;
      else if (objcHits < cppHits) summary.mixedBreakdown.cppDominant += 1;
      else summary.mixedBreakdown.balanced += 1;
    }
    if (detailed.classification === 'unknown') summary.ambiguity.unknown += 1;

    const legacy = getLanguageFromFilename(rel);
    const contentAware = getLanguageFromFilenameWithContent(rel, content);

    if (legacy === SupportedLanguages.CPlusPlus) summary.routeCounts.legacyCpp += 1;
    if (contentAware === SupportedLanguages.ObjectiveC) {
      summary.routeCounts.contentObjc += 1;
      if (legacy !== contentAware) pushSample(summary.samples.changedToObjc, rel);
    }
    if (contentAware === SupportedLanguages.CPlusPlus) summary.routeCounts.contentCpp += 1;
    if (contentAware === SupportedLanguages.C) {
      summary.routeCounts.contentC += 1;
      if (legacy !== contentAware) pushSample(summary.samples.changedToC, rel);
    }

    if (legacy !== contentAware) summary.divergence.changed += 1;
    else summary.divergence.unchanged += 1;
  }

  return summary;
};

const pct = (n: number, d: number): string =>
  d === 0 ? '0.00%' : `${((n / d) * 100).toFixed(2)}%`;

const toMarkdown = (summaries: Summary[]): string => {
  const lines: string[] = [];
  lines.push('# Header Classification Shadow Report');
  lines.push('');
  lines.push('> Note: “误判率”这里采用代理指标，不是人工标注真值。');
  lines.push('');

  for (const s of summaries) {
    const ambiguous = s.ambiguity.mixed + s.ambiguity.unknown;
    lines.push(`## ${s.repo}`);
    lines.push('');
    lines.push(`- headers: **${s.headers}**`);
    lines.push(
      `- class counts: objectivec=${s.classCounts.objectivec}, cpp=${s.classCounts.cpp}, c=${s.classCounts.c}, mixed=${s.classCounts.mixed}, unknown=${s.classCounts.unknown}`,
    );
    lines.push(
      `- mixed breakdown: objc-dominant=${s.mixedBreakdown.objcDominant}, balanced=${s.mixedBreakdown.balanced}, cpp-dominant=${s.mixedBreakdown.cppDominant}`,
    );
    lines.push(
      `- route divergence (legacy ext vs content-aware): ${s.divergence.changed}/${s.headers} (${pct(s.divergence.changed, s.headers)})`,
    );
    lines.push(
      `- ambiguity proxy (mixed+unknown): ${ambiguous}/${s.headers} (${pct(ambiguous, s.headers)})`,
    );
    lines.push(
      `- content-aware routing: objc=${s.routeCounts.contentObjc}, cpp=${s.routeCounts.contentCpp}, c=${s.routeCounts.contentC}`,
    );
    if (s.samples.changedToObjc.length > 0)
      lines.push(`- sample changed→ObjC: ${s.samples.changedToObjc.join(', ')}`);
    if (s.samples.changedToC.length > 0)
      lines.push(`- sample changed→C: ${s.samples.changedToC.join(', ')}`);
    if (s.samples.mixed.length > 0) lines.push(`- sample mixed: ${s.samples.mixed.join(', ')}`);
    lines.push('');
  }

  const total = summaries.reduce(
    (acc, s) => {
      acc.headers += s.headers;
      acc.changed += s.divergence.changed;
      acc.mixed += s.ambiguity.mixed;
      acc.unknown += s.ambiguity.unknown;
      return acc;
    },
    { headers: 0, changed: 0, mixed: 0, unknown: 0 },
  );
  lines.push('## Aggregate');
  lines.push('');
  lines.push(`- headers: **${total.headers}**`);
  lines.push(
    `- divergence proxy: ${total.changed}/${total.headers} (${pct(total.changed, total.headers)})`,
  );
  lines.push(
    `- ambiguity proxy (mixed+unknown): ${total.mixed + total.unknown}/${total.headers} (${pct(total.mixed + total.unknown, total.headers)})`,
  );
  lines.push(`- mixed only: ${total.mixed}/${total.headers} (${pct(total.mixed, total.headers)})`);
  lines.push(
    `- unknown only: ${total.unknown}/${total.headers} (${pct(total.unknown, total.headers)})`,
  );
  lines.push('');

  return lines.join('\n');
};

const main = (): void => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: tsx scripts/header-classification-shadow.ts <repoDir> [repoDir...]');
    process.exit(1);
  }

  const resolved = args.map((p) => path.resolve(p)).filter((p) => fs.existsSync(p));
  if (resolved.length === 0) {
    console.error('No valid repo paths found.');
    process.exit(1);
  }

  const summaries = resolved.map(analyzeRepo);
  const markdown = toMarkdown(summaries);
  const outPath = path.resolve(
    'test-results',
    `header-shadow-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');

  console.log(markdown);
  console.log(`\nSaved report: ${outPath}`);
};

main();
