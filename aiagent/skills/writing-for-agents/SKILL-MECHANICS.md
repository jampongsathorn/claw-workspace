# Skill mechanics

The skill-specific branch of `writing-for-agents`: what changes when the
document is a skill (frontmatter, the invocation choice, calling other
skills, router skills). Everything else about writing it is the universal
reference in `SKILL.md`.

## Invocation

Two choices, trading the two loads:

- **Model-visible**: the skill carries a `description` in its frontmatter.
  The harness renders `name: description` in the session skill catalog, so
  the agent can fire the skill autonomously and other skills can reach it.
  You can still type its name: model-visibility always _includes_ user reach;
  a description only ever adds agent discovery, never removes the human's.
  The description is the skill's top-level context pointer, forced to stay
  loaded at all times: permanent context load in exchange for discoverability.
  A model-visible skill whose content is all reference is also one home for
  shared reference: another skill can invoke it, so reference needed by
  several skills lives in one place. Mechanics: write a model-facing
  description carrying the trigger branches (the pointer-writing rules in
  `SKILL.md` apply in full).
- **User-only**: the skill omits the `description` (the harness catalog
  renders only skills that have one, so an undescriptioned skill is invisible
  to the agent). Only the human invoking its name can reach it, and no other
  skill can. Zero context load, but it spends cognitive load: you are the
  index that must remember it exists. The body can still open with a
  one-line human-facing summary.

Pick model-visibility only when the agent must reach the skill on its own,
or another skill must. If it only ever fires by hand, make it user-only and
pay no context load.

Shared reference that two user-only skills both need can live in neither:
with no descriptions, neither can fire the other. Push it to a plain file
outside the skill system: external reference any skill can point at.

## Splitting by invocation

The invocation cut of splitting (the sequence cut lives in `SKILL.md`):
split off a model-visible skill when you have a distinct leading word that
should trigger it on its own (a trigger word you actually use in your
prompts), or another skill must reach it. You pay context load for the new
always-loaded description, so that independent reach has to be worth it.

## Calling other skills

Dependencies between skills are expressed as an explicit instruction to read
the named skill and follow it: "Read the full `SKILL.md` of <skill> (in
`skills/<skill>/`) and follow it." Naming the skill and the act of reading
it is what gets it fired; a bare name dropped into prose may be read as a
mention. The same skill, one pass: if a step needs two skills, it is two
reads, not one.

A skill may invoke model-visible skills. It can never reach a user-only
skill, full stop: nothing but the human can. When a step's precondition is a
user-only skill, phrase it as an instruction for the human: "ask the user to
run <skill>", never as a read-and-follow step.

Merely _reading_ a reference file for vocabulary is a one-line pointer, not
invoking the skill that owns it. Only the active discipline the skill
defines is an invocation.

## Router skills

When user-only skills multiply past what you can remember, that piled-up
cognitive load is cured by a **router skill**: one user-visible index that
names the others and when to reach for each, so the human has one entry
point to remember instead of many. In this harness that is the
`skills/README.md` catalog (or a dedicated user-only index skill once the
set grows). It can only hint, never fire: user-only skills are reachable by
no one but the human. A router that lies is a bug: whenever a skill is
added, renamed, or removed, re-read the router and update it in the same
change.
