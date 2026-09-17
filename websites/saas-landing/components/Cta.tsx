import Reveal from "./Reveal";
import { ArrowRight, Check } from "./icons";

export default function Cta() {
  return (
    <section id="cta" className="pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-600/25 via-ink-900 to-accent-500/20 px-8 py-16 text-center sm:px-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000,transparent)]"
            />
            <div
              aria-hidden
              className="animate-float pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-400/25 blur-[110px]"
            />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl">
                Your team's Tuesday shouldn't be copy-paste
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-slate-200/90 text-pretty">
                Connect one tool, automate one process, and see the difference
                before your next standup.
              </p>

              <form className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:flex-row">
                <label htmlFor="work-email" className="sr-only">
                  Work email
                </label>
                <input
                  id="work-email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  className="w-full rounded-full border border-white/15 bg-ink-950/70 px-5 py-3.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
                />
                <button
                  type="submit"
                  className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-300"
                >
                  Start free
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </form>

              <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-300">
                {["Free forever tier", "No credit card", "Setup in 10 minutes"].map(
                  (item) => (
                    <li key={item} className="inline-flex items-center gap-2">
                      <Check className="h-4 w-4 text-brand-300" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
