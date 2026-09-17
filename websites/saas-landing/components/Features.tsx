import Reveal from "./Reveal";
import { Bolt, Chart, Plug, Puzzle, Shield, Users } from "./icons";

const features = [
  {
    icon: Plug,
    title: "300+ native integrations",
    body: "Slack, Gmail, Notion, HubSpot, NetSuite, Snowflake and everything in between — connected in a couple of clicks, no engineering ticket required.",
    span: "lg:col-span-2",
  },
  {
    icon: Bolt,
    title: "Agents that actually act",
    body: "Not just summarise. Nova agents read, decide, write back, and escalate to a human when confidence drops below your threshold.",
  },
  {
    icon: Chart,
    title: "Observability built in",
    body: "Every run is traceable — inputs, decisions, tokens, cost. Replay any execution and see exactly why it did what it did.",
  },
  {
    icon: Puzzle,
    title: "Composable blocks",
    body: "Chain triggers, conditions, transforms and approvals into workflows your whole team can read and edit.",
    span: "lg:col-span-2",
  },
  {
    icon: Shield,
    title: "Enterprise-grade security",
    body: "SOC 2 Type II, GDPR-ready, region-pinned data residency and SSO/SCIM on every paid plan.",
  },
  {
    icon: Users,
    title: "Human in the loop",
    body: "Approval gates, confidence thresholds and audit trails keep a person firmly in charge of what ships.",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-brand-600/10 blur-[140px]"
      />
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-300 uppercase">
            Platform
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl">
            Everything you need to automate the boring 60%
          </h2>
          <p className="mt-5 text-lg text-slate-300 text-pretty">
            One platform for connecting tools, orchestrating agents and proving
            the impact to your CFO.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal
              key={feature.title}
              delay={(i % 3) * 90}
              className={feature.span ?? ""}
            >
              <article className="surface surface-hover h-full rounded-2xl p-6 transition duration-300">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/25 to-accent-500/20 text-brand-300 ring-1 ring-white/10">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
                  {feature.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
