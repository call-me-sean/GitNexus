# GitNexus PR Reviewer Swarm

A coordinated, read-only Claude Code reviewer swarm for GitNexus pull requests. Seven specialized subagents produce a structured, evidence-grounded production-readiness review.

## Invocation

```
/gitnexus-pr-swarm-review <PR URL or PR number>
```

Examples:

```
/gitnexus-pr-swarm-review 1234
/gitnexus-pr-swarm-review https://github.com/abhigyanpatwari/GitNexus/pull/1234
```

## Agents

| Agent | Purpose |
|-------|---------|
| `gitnexus-pr-facts-historian` | Gathers PR identity, visible GitHub state, changed files, commits, linked issues, repo history, and visibility gaps |
| `gitnexus-branch-hygiene-reviewer` | Classifies merge state and branch hygiene using exact enumerated values |
| `gitnexus-risk-architect` | Identifies production failure modes using risk-model-first reasoning |
| `gitnexus-test-ci-verifier` | Verifies test coverage, CI wiring, and validation gaps |
| `gitnexus-security-boundary-reviewer` | Reviews auth, secrets, injection, hidden Unicode, and trust boundaries |
| `gitnexus-docs-dod-reviewer` | Builds a PR-specific Definition of Done from repo guidance docs |
| `gitnexus-synthesis-critic` | Critiques the final review for evidence grounding and verdict-rule compliance |

## Key Properties

- **Read-only.** All agents use only Read, Grep, Glob, and Bash tools. No agent can edit files.
- **Evidence-grounded.** Every finding must cite files, line ranges, checks, issue/PR references, or commands.
- **Missing visibility becomes verification work.** If GitHub state cannot be determined, the review treats missing items as mandatory verification points rather than inventing facts.
- **Manually invoked.** No hooks or automatic triggers. Use the `/gitnexus-pr-swarm-review` slash command to start a review.

## Relationship to Existing PR Review

This swarm coexists with the existing `/gitnexus-pr-review` skill. The existing skill is a single-agent linear checklist using GitNexus MCP tools. The swarm is a multi-agent deep review with focused responsibilities per domain.

## After Adding or Editing Agent Files

Claude Code loads agent files at startup. If you directly add or edit files in `.claude/agents/`, restart Claude Code for the changes to take effect.
