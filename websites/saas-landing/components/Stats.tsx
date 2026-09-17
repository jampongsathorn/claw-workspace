import Reveal from "./Reveal";

const stats = [
  { value: "1.2M", label: "Hours automated each month" },
  { value: "99.4%", label: "Workflow success rate" },
  { value: "300+", label: "Native integrations" },
  { value: "< 10 min", label: "Average time to first run" },
];

export default function Stats() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] lg:grid-cols-4">
          {stats.map((stat, i) => (
            <Reveal
              key={stat.label}
              delay={i * 70}
              className="bg-ink-950/60 px-6 py-8 text-center backdrop-blur"
            >
              <dt className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {stat.value}
              </dt>
              <dd className="mt-2 text-sm text-slate-400">{stat.label}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
