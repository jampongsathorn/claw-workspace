import Reveal from "./Reveal";

const logos = [
  "Northwind",
  "Halcyon",
  "Vertex Labs",
  "Kanso",
  "Orbital",
  "Loomis",
  "Brightpath",
  "Meridian",
];

function Wordmark({ name }: { name: string }) {
  return (
    <span className="shrink-0 px-8 text-lg font-semibold tracking-tight whitespace-nowrap text-slate-500/80 transition hover:text-slate-300">
      {name}
    </span>
  );
}

export default function LogoCloud() {
  return (
    <section className="border-y border-white/[0.07] bg-white/[0.015] py-12">
      <Reveal className="mx-auto max-w-7xl px-6 lg:px-8">
        <p className="text-center text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
          Powering operations at 4,000+ teams
        </p>

        <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <div className="animate-marquee flex w-max">
            {[...logos, ...logos].map((name, i) => (
              <Wordmark key={`${name}-${i}`} name={name} />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
