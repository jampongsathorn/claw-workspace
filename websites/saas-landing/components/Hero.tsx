import Reveal from "./Reveal";
import { ArrowRight, Bolt, Check, Star } from "./icons";

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-36 pb-20 lg:pt-44">
      {/* backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_75%_55%_at_50%_0%,#000_35%,transparent_100%)]" />
        <div className="animate-pulse-slow absolute -top-40 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-brand-500/25 blur-[130px]" />
        <div className="animate-pulse-slow absolute -top-16 right-[-6rem] h-[26rem] w-[26rem] rounded-full bg-accent-500/20 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <a
              href="#product"
              className="surface inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-200 transition hover:text-white"
            >
              <span className="flex h-5 items-center rounded-full bg-brand-500/20 px-2 text-[11px] font-semibold text-brand-300">
                New
              </span>
              Nova Agents 2.0 — now with live tool calling
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mt-7 text-5xl leading-[1.05] font-semibold tracking-tight text-white text-balance sm:text-6xl lg:text-7xl">
              Put your busywork on{" "}
              <span className="text-gradient">autopilot</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 text-pretty">
              Nova connects the tools your team already uses, then runs the
              repetitive work between them — so your people spend their day on
              decisions instead of data entry.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#cta"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:shadow-xl hover:shadow-brand-600/40 sm:w-auto"
              >
                Start free — no card needed
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#product"
                className="surface surface-hover inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white transition sm:w-auto"
              >
                Watch 2-min demo
              </a>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Bolt className="h-4 w-4 text-brand-300" />
                Live in under 10 minutes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-brand-300" />
                SOC 2 Type II
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="flex text-amber-300">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5" />
                  ))}
                </span>
                4.9 / 5 on G2
              </span>
            </div>
          </Reveal>
        </div>

        {/* product mockup */}
        <Reveal delay={380} className="mt-16">
          <div className="relative mx-auto max-w-5xl">
            <div
              aria-hidden
              className="absolute -inset-x-8 -top-6 bottom-0 -z-10 rounded-[2.5rem] bg-gradient-to-b from-brand-500/25 to-transparent blur-3xl"
            />
            <div className="surface overflow-hidden rounded-2xl shadow-2xl shadow-black/60">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-rose-400/70" />
                <span className="h-3 w-3 rounded-full bg-amber-400/70" />
                <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
                <div className="mx-auto hidden rounded-md bg-white/5 px-4 py-1 text-xs text-slate-400 sm:block">
                  app.nova.ai/workflows
                </div>
              </div>

              <div className="grid gap-4 p-4 sm:grid-cols-5 sm:p-6">
                <aside className="hidden flex-col gap-2 sm:col-span-1 sm:flex">
                  {["Overview", "Workflows", "Agents", "Runs", "Settings"].map(
                    (item, i) => (
                      <div
                        key={item}
                        className={`rounded-lg px-3 py-2 text-xs font-medium ${
                          i === 1
                            ? "bg-brand-500/15 text-brand-300"
                            : "text-slate-400"
                        }`}
                      >
                        {item}
                      </div>
                    ),
                  )}
                </aside>

                <div className="sm:col-span-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { k: "Runs today", v: "12,480", d: "+18%" },
                      { k: "Hours saved", v: "1,204", d: "+9%" },
                      { k: "Success rate", v: "99.4%", d: "+0.6%" },
                    ].map((s) => (
                      <div key={s.k} className="surface rounded-xl p-3.5">
                        <p className="text-[11px] tracking-wide text-slate-400 uppercase">
                          {s.k}
                        </p>
                        <p className="mt-1.5 text-xl font-semibold text-white">
                          {s.v}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-emerald-400">
                          {s.d} vs last week
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="surface mt-3 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">
                        Invoice intake → ERP
                      </p>
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                        Running
                      </span>
                    </div>
                    <div className="mt-4 flex items-end gap-1.5">
                      {[38, 52, 44, 66, 58, 78, 71, 88, 62, 74, 92, 68].map(
                        (h, i) => (
                          <span
                            key={i}
                            className="flex-1 rounded-t bg-gradient-to-t from-brand-600/40 to-brand-400"
                            style={{ height: `${h}px` }}
                          />
                        ),
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      {[
                        "Extracted 3 line items from invoice_2291.pdf",
                        "Matched PO #4482 — confidence 98.2%",
                        "Posted to NetSuite as INV-004418",
                      ].map((line) => (
                        <div
                          key={line}
                          className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-slate-300"
                        >
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
