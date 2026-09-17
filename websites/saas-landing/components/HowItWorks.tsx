import Reveal from "./Reveal";

const steps = [
  {
    n: "01",
    title: "Connect your stack",
    body: "Authorise the tools you already pay for. Nova maps your data model automatically and shows you what it found.",
  },
  {
    n: "02",
    title: "Describe the outcome",
    body: "Write the rule in plain English — or pick a template. Nova drafts the workflow and you review it before anything runs.",
  },
  {
    n: "03",
    title: "Ship and watch it work",
    body: "Turn it on, set your confidence thresholds, and get a weekly digest of hours saved and edge cases flagged.",
  },
];

export default function HowItWorks() {
  return (
    <section id="product" className="py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-300 uppercase">
              How it works
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl">
              From messy process to running automation in an afternoon
            </h2>
            <p className="mt-5 text-lg text-slate-300 text-pretty">
              No migration project. No six-week onboarding. Nova sits on top of
              the systems you have and starts paying for itself in the first
              week.
            </p>

            <div className="mt-10 surface rounded-2xl p-6">
              <p className="text-sm font-semibold text-white">
                Typical rollout timeline
              </p>
              <div className="mt-5 space-y-5">
                {[
                  { d: "Day 1", t: "Connect tools, run first workflow", p: 100 },
                  { d: "Week 1", t: "5–8 processes automated", p: 72 },
                  { d: "Month 1", t: "Team-wide rollout + audit pack", p: 40 },
                ].map((row) => (
                  <div key={row.d}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-white">{row.d}</span>
                      <span className="text-slate-400">{row.t}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
                        style={{ width: `${row.p}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <ol className="relative space-y-4">
            <div
              aria-hidden
              className="absolute top-6 bottom-6 left-[1.65rem] w-px bg-gradient-to-b from-brand-500/60 via-white/10 to-transparent"
            />
            {steps.map((step, i) => (
              <Reveal
                as="li"
                key={step.n}
                delay={i * 110}
                className="relative flex gap-5"
              >
                <div className="surface relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-brand-300">
                  {step.n}
                </div>
                <div className="surface surface-hover flex-1 rounded-2xl p-6 transition duration-300">
                  <h3 className="text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}

            <Reveal
              as="li"
              delay={340}
              className="surface ml-[4.75rem] rounded-2xl p-6"
            >
              <p className="text-sm leading-relaxed text-slate-300">
                <span className="font-semibold text-white">
                  Need to prove it internally?
                </span>{" "}
                Nova generates a cost-savings report you can forward straight to
                finance.
              </p>
            </Reveal>
          </ol>
        </div>
      </div>
    </section>
  );
}
