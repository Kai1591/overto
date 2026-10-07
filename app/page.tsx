import { ExternalLink } from "lucide-react";
import FormularOvereni from "@/components/FormularOvereni";
import { RandomLetterSwap } from "@/components/ui/random-letter-swap";

/* ─── SVG logo „over.to" je nyni v public/logo.svg ──────────────────── */

/**
 * Hlavní stránka aplikace over.to
 *
 * Serverová komponenta. Layout:
 * - Fixní animované tmavé pozadí s mesh gradientem
 * - Fixní skleněný navbar s logem a navigací
 * - Hero sekce s velkou typografií
 * - Glassmorphism formulář v dolní části
 * - Fixní patička s povinným odkazem na otevřená data
 */
export default function Stranka() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">

      {/* ══ Fixní pozadí ══════════════════════════════════════════════════════════════════ */}
      <div className="fixed inset-0 -z-10 bg-teal-500 overflow-hidden">
        {/* Mřížka (Grid) rovnoměrně rozmístěná v pozadí */}
        <div
          className="absolute inset-0 bg-repeat"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M60 0H0v60' fill='none' stroke='%23ffffff' stroke-opacity='0.25' stroke-width='1'/%3E%3C/svg%3E\")",
            backgroundSize: "60px 60px",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)",
          }}
        />
      </div>

      {/* ══ Fixní skleněný navbar ═════════════════════════════════════════════════════════ */}
      <header className="fixed top-0 z-50 w-full px-6 py-4 md:px-12 bg-transparent">
        <div className="flex w-full items-center justify-between">

          {/* Levá strana – logo + název */}
          <a
            href="/"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
            aria-label="over.to – domovská stránka"
          >
            <img src="/logo.svg" alt="over.to logo" className="h-[23px] w-[32px]" />
            <span className="font-cabinet font-bold text-2xl tracking-wide text-white mt-1">
              OVĚŘ.TO
            </span>
          </a>

          {/* Pravá strana – navigace */}
          <nav className="hidden items-center gap-6 sm:flex" aria-label="Hlavní navigace">
            {[
              { href: "#", label: "Ověřovna" },
              { href: "#", label: "Katalog dat" },
              { href: "#", label: "O projektu" },
            ].map((odkaz) => (
              <RandomLetterSwap
                key={odkaz.label}
                href={odkaz.href}
                label={odkaz.label}
                className="font-mono text-sm text-white/70 transition-colors hover:text-white uppercase tracking-wider inline-block cursor-pointer"
              />
            ))}
          </nav>
        </div>
      </header>

      {/* ══ Hlavní obsah ══════════════════════════════════════════════════════════════════ */}
      <main className="relative flex min-h-[130vh] flex-col items-center px-6 pb-48 pt-32 md:px-12">

        {/* ── Hero sekce (horní část) ─────────────────────────────────────── */}
        <div className="flex w-full flex-col items-center justify-start mt-8">
          {/* Hlavní nadpis - Rozložení Awwwards typografie přes celou šířku */}
          <h1 className="font-cabinet font-bold w-full text-[9vw] sm:text-[7vw] md:text-[6vw] tracking-tight text-white leading-[0.9] uppercase flex flex-col">
          {/* 1. řádek: Ověřte ... každou ... zprávu */}
          <div className="reveal-text flex w-full items-center justify-between" style={{ '--delay': '0ms' } as React.CSSProperties}>
            <span className="block px-2 py-2">Ověřte</span>
            <span className="block px-2 py-2">každou</span>
            <span className="block px-2 py-2">zprávu</span>
          </div>

          {/* 2. řádek: daty a [ikona] z KH KRAJE. */}
          <div className="reveal-text flex w-full items-center" style={{ '--delay': '400ms', '--stripe-start': '15%' } as React.CSSProperties}>
            {/* Levé slovo vycentrované v první polovině šířky */}
            <div className="flex w-1/2 justify-center">
              <span className="block px-2 py-2">daty</span>
            </div>
            
            {/* Pravé slovo vycentrované v druhé polovině šířky */}
            <div className="flex w-1/2 justify-center items-center gap-2 md:gap-4 px-2 py-2">
              <div className="relative h-[0.8em] w-[0.8em] overflow-hidden text-neutral-600">
                <div className="icon-slider-track flex flex-col h-[400%] w-full">
                  <div className="flex h-1/4 w-full items-center justify-center">
                    <img src="/icon1.svg" className="w-full h-full" alt="" />
                  </div>
                  <div className="flex h-1/4 w-full items-center justify-center">
                    <img src="/icon2.svg" className="w-full h-full" alt="" />
                  </div>
                  <div className="flex h-1/4 w-full items-center justify-center">
                    <img src="/icon3.svg" className="w-full h-full" alt="" />
                  </div>
                  <div className="flex h-1/4 w-full items-center justify-center">
                    <img src="/icon1.svg" className="w-full h-full" alt="" />
                  </div>
                </div>
              </div>
              <span>z KH KRAJE.</span>
            </div>
          </div>
          </h1>
        </div>

        {/* ── Spodní sekce (formulář) nově nepřípíchnutý k obrazovce ── */}
        <div className="z-30 flex w-full flex-col items-center justify-center mt-24 mb-12">
          <div className="z-10 w-full flex flex-col gap-6">
            {/* Podnadpis vrácený nad formulář */}
            <p className="text-center text-base leading-relaxed text-white/60 md:text-lg drop-shadow-md">
              Zadejte tvrzení nebo otázku. Umělá inteligence ji ověří přímo oproti{" "}
              <span className="text-white">
                otevřeným datům Královéhradeckého kraje
              </span>
              .
            </p>

            {/* Konverzační vlákno + input */}
            <FormularOvereni />
          </div>
        </div>

        {/* ── Sekce O projektu (About) ── */}
        <section className="w-full mt-32 text-white/80" id="o-projektu">
          <h2 className="font-cabinet font-bold text-4xl md:text-6xl mb-24 uppercase tracking-wider text-white">
            O projektu
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24 text-2xl md:text-3xl leading-relaxed font-light">
            
            {/* Levý sloupec: První odstavec + Logo */}
            <div className="flex flex-col gap-12 md:gap-16 items-start">
              <p className="indent-12 md:indent-16 text-left">
                Projekt <span className="font-semibold text-white">OVĚŘ.TO</span> vznikl s cílem bojovat proti informačnímu šumu a usnadnit občanům rychlý přístup k reálným a spolehlivým údajům. Využíváme k tomu nejmodernější technologii umělé inteligence, která v reálném čase a v přirozeném jazyce analyzuje rozsáhlá veřejně dostupná data Královéhradeckého kraje.
              </p>
              
              {/* Logo s fluid efektem aplikovaným přímo na jeho tvar (bez pozadí) */}
              <div className="relative mt-12 md:mt-32 group max-w-full flex items-start">
                <img 
                  src="/khk-clean.svg" 
                  alt="Logo Královéhradeckého kraje" 
                  className="w-80 h-auto md:w-[32rem] lg:w-[42rem] max-w-full object-contain shrink-0 
                             opacity-80 transition-all duration-700 ease-out
                             drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] 
                             hover:drop-shadow-[0_0_40px_rgba(255,255,255,0.4)]
                             hover:opacity-100 hover:scale-105" 
                />
              </div>
            </div>

            {/* Pravý sloupec: Druhý odstavec (posunutý dolů) */}
            <p className="indent-12 md:indent-16 text-left md:mt-96">
              Každý položený dotaz a předložené tvrzení jsou důkladně vyhodnoceny a opřeny o konkrétní, dohledatelné datové sady z datového portálu kraje. Dáváme tím veřejnosti, novinářům i úředníkům do rukou silný nástroj pro maximální transparentnost a ověřování faktů v mžiku oka.
            </p>

          </div>
        </section>
      </main>

      {/* ══ Patička ─ povinný odkaz na otevřená data ══════════════════════ */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center py-3">
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent backdrop-blur-sm" />
        <a
          href="https://www.datakhk.cz/search"
          target="_blank"
          rel="noopener noreferrer"
          className="relative inline-flex items-center gap-1.5 text-xs text-white/50 transition-colors hover:text-white/80"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          Využívá otevřená data Královéhradeckého kraje
        </a>
      </footer>
    </div>
  );
}
