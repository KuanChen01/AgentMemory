# Product

## Register

product

## Users

Developers and operator-users who run multiple local coding agents and need one trusted control surface for shared memory state, runtime policy, diagnostics, and installation confidence. They are usually debugging agent behavior or validating a local setup, so the UI must stay fast, legible, and explicit about what changed.

## Product Purpose

AgentMemory provides a local persistent memory layer for Claude Code, OpenCode, Codex, Antigravity CLI, and Grok. The admin workbench exists to inspect the database, control read/write memory gates, view curated startup context, test search quality, manage structured state, and validate the LLM connection used by background summarization.

## Brand Personality

Precise, calm, native-feeling.

The product should feel like a polished local OS utility: quiet enough for repeated use, premium enough to inspire trust, and clear enough that dangerous ambiguity around memory reads, writes, and model settings is avoided.

## Anti-references

Avoid generic SaaS dashboards, terminal-only austerity, decorative AI gradients, card-heavy marketing layouts, and vague connection states. Avoid controls that look beautiful but hide whether read/write gates, model values, or test results are current.

## Design Principles

- Make operational state visible before asking the user to act.
- Keep destructive or high-impact changes explicit, reversible, and labeled in plain language.
- Use premium motion only to show panel changes, loading, and successful state transitions.
- Preserve bilingual UI shell behavior without translating stored AgentMemory data.
- Prefer local-first confidence: show the exact endpoint, model, project path, and freshness where it matters.

## Accessibility & Inclusion

Target WCAG AA contrast for text and controls. Support keyboard focus states, reduced-motion preferences, clear loading and error states, and responsive layouts that keep forms usable on laptop and mobile widths.
