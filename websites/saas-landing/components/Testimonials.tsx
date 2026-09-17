import Reveal from "./Reveal";
import { Star } from "./icons";

const testimonials = [
  {
    quote:
      "We replaced four internal scripts and a contractor with two Nova workflows. The finance close went from nine days to four.",
    name: "Amara Okonkwo",
    role: "VP Finance Ops, Meridian Logistics",
    initials: "AO",
  },
  {
    quote:
      "The observability is what sold me. Being able to replay any run and show the compliance team the exact decision path is huge.",
    name: "Daniel Reyes",
    role: "Head of RevOps, Vertex Labs",
    initials: "DR",
  },
  {
    quote:
      "Our support team ships changes to their own automations now. Zero tickets to engineering in the last quarter.",
    name: "Pim Chaiwong",
    role: "Director of CX, Kanso",
    initials: "PC",
  },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="border-y border-white/[0.07] bg-white/[0.015] py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-300 uppercase">
            Customers
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl">
            Teams that stopped doing it manually
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-4 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 110}>
              <figure className="surface surface-hover flex h-full flex-col justify-between rounded-2xl p-6 transition duration-300">
                <div>
                  <div className="flex gap-0.5 text-amber-300">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className="h-4 w-4" />
                    ))}
                  </div>
                  <blockquote className="mt-5 text-[15px] leading-relaxed text-slate-200 text-pretty">
                    “{t.quote}”
                  </blockquote>
                </div>
                <figcaption className="mt-7 flex items-center gap-3 border-t border-white/8 pt-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/40 to-accent-500/30 text-xs font-semibold text-white ring-1 ring-white/10">
                    {t.initials}
                  </span>
                  <span className="text-sm">
                    <span className="block font-medium text-white">
                      {t.name}
                    </span>
                    <span className="block text-slate-400">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
