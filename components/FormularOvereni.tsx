"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, CheckCircle2, XCircle, HelpCircle, BarChart2, ChevronDown, RefreshCw, ExternalLink } from "lucide-react";
import type { VysledekOvereni } from "@/types/fakta";
import dynamic from "next/dynamic";
import type { MapFeature } from "./MapWidget";

const MapWidget = dynamic(() => import("./MapWidget"), {
  ssr: false,
  loading: () => (
    <div className="h-80 md:h-[28rem] w-full bg-white/5 animate-pulse rounded-[1.5rem] flex items-center justify-center">
      <span className="text-white/30 text-sm">Načítám mapu...</span>
    </div>
  )
});

const MAX_DELKA_TEXTU = 1000;

// Definice témat, aby se Gemini měl čeho chytit
const TEMATA_MAPA = {
  "Sliby vs. Realita: Krajská infrastruktura (Doprava a Zdravotnictví)": "sliby_realita",
  "Fact-checking veřejných zakázek a krajských dotací (Hlídač peněz)": "hlidac_penez",
};

const PLACEHOLDER_MAPA: Record<keyof typeof TEMATA_MAPA, string> = {
  "Sliby vs. Realita: Krajská infrastruktura (Doprava a Zdravotnictví)": "Zjisti, zda slova politiků o opravách silnic a stavu nemocnic odpovídají tvrdým datům...",
  "Fact-checking veřejných zakázek a krajských dotací (Hlídač peněz)": "Přelož mi do lidštiny, kdo vyhrál tuto zakázku a jestli tam nejsou podezřelé anomálie...",
};

const DOPORUCENE_DOTAZY: Record<keyof typeof TEMATA_MAPA, string[]> = {
  "Sliby vs. Realita: Krajská infrastruktura (Doprava a Zdravotnictví)": [
    "Ověř tvrzení: 'Kraj opravil většinu havarijních silnic na Náchodsku.'",
    "Jaká je skutečná kapacita a dostupnost lůžek v krajských nemocnicích?",
    "Zanalyzuj dopravní situaci a počet havarijních úseků napříč okresem Hradec Králové."
  ],
  "Fact-checking veřejných zakázek a krajských dotací (Hlídač peněz)": [
    "Vypiš mi subjekty, které získaly neobvykle vysoké dotace z kraje.",
    "Proveď analýzu investičních pobídek. Jaké firmy z toho nejvíce profitují?",
    "Přelož mi složitá finanční data: Kam skutečně tečou krajské peníze na rozvoj?"
  ]
};

// Vizuální konfigurace pro každý stav
const STAV_CONFIG = {
  Pravda: {
    pill: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30",
    dot: "bg-emerald-400",
    text: "text-emerald-50/90",
    map_border: "border-emerald-400/20",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    odkaz: "text-emerald-300/60 hover:text-emerald-300",
  },
  Nepravda: {
    pill: "bg-red-500/20 text-red-300 border border-red-400/30",
    dot: "bg-red-400",
    text: "text-red-50/90",
    map_border: "border-red-400/20",
    icon: <XCircle className="h-3.5 w-3.5" />,
    odkaz: "text-red-300/60 hover:text-red-300",
  },
  Neověřitelné: {
    pill: "bg-white/10 text-white/50 border border-white/20",
    dot: "bg-white/40",
    text: "text-white/60",
    map_border: "border-white/10",
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    odkaz: "text-white/30 hover:text-white/60",
  },
  Analýza: {
    pill: "bg-blue-500/20 text-blue-300 border border-blue-400/30",
    dot: "bg-blue-400",
    text: "text-white/90",
    map_border: "border-blue-400/20",
    icon: <BarChart2 className="h-3.5 w-3.5" />,
    odkaz: "text-blue-300/60 hover:text-blue-300",
  },
} as const;

// Typy zpráv ve vlákně
type ZpravaUzivatele = { id: string; typ: "uzivatel"; text: string };
type ZpravaAI = { id: string; typ: "ai"; vysledek: VysledekOvereni; dotaz: string; tema: string };
type ZpravaNacitani = { id: string; typ: "nacitani" };
type Zprava = ZpravaUzivatele | ZpravaAI | ZpravaNacitani;

async function ziskatChybovouZpravu(odpoved: Response): Promise<string> {
  // Rozpoznání, zda jde o problém pocházející od komunikace s AI (statusy 502, 503, 429)
  const jeGeminiChyba = odpoved.status === 502 || odpoved.status === 503 || odpoved.status === 429;
  const prefix = jeGeminiChyba ? "Problém na straně Google Gemini: " : "";

  try {
    const json = await odpoved.json();
    if (json.chyba) return prefix + json.chyba;
  } catch {
    // Ignorujeme JSON parse errory
  }
  switch (odpoved.status) {
    case 400: return "Dotaz nebyl správně sestavený.";
    case 429: return prefix + "Příliš mnoho dotazů. Počkejte chvíli.";
    case 502: case 503: return prefix + "Služba je momentálně přetížená nebo nedostupná.";
    default: return `Nastala neočekávaná chyba (${odpoved.status}).`;
  }
}

// Konfigurace barvy bubliny pro AI
const BUBLINA_CONFIG = {
  Pravda:       "bg-black/40 border-emerald-500/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),0_0_30px_-10px_rgba(16,185,129,0.15)]",
  Nepravda:     "bg-black/40 border-red-500/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),0_0_30px_-10px_rgba(239,68,68,0.15)]",
  Neověřitelné: "bg-black/40 border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]",
  Analýza:      "bg-black/40 border-blue-500/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),0_0_30px_-10px_rgba(59,130,246,0.15)]",
} as const;

// Komponenta pro jednu AI odpověď ve vlákně
function AIZprava({ zprava }: { zprava: ZpravaAI }) {
  const { vysledek, dotaz, tema } = zprava;
  const { status, explanation, sourceLink, map_features } = vysledek;
  const konfig = STAV_CONFIG[status] ?? STAV_CONFIG["Neověřitelné"];
  const bublinaBg = BUBLINA_CONFIG[status] ?? BUBLINA_CONFIG["Neověřitelné"];



  return (
    <div className="flex justify-start w-full animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className={`w-full max-w-[95%] lg:max-w-[90%] rounded-[2rem] rounded-tl-xl border backdrop-blur-3xl px-6 py-5 md:p-6 ${bublinaBg}`}>
        {/* Status pilulka */}
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${konfig.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${konfig.dot}`} />
            {konfig.icon}
            {status}
          </span>
        </div>

        {/* Hlavní text odpovědi */}
        <p className="text-lg font-light text-white leading-relaxed mt-2">
          {explanation}
        </p>

        {/* Mapa inline s fluid glass efektem */}
        {map_features && map_features.length > 0 && (
          <div className="relative mt-6 group max-w-full">
            {/* Dynamický glow v pozadí mapy */}
            <div className={`absolute -inset-3 rounded-[2rem] bg-gradient-to-tr from-white/5 to-white/10 blur-xl opacity-40 transition duration-700 group-hover:opacity-80`}></div>
            
            {/* Glass deska pro mapu */}
            <div className={`relative rounded-[2rem] border bg-black/20 p-2 backdrop-blur-2xl shadow-2xl ${konfig.map_border}`}>
              {/* Jemný lesk nahoře na rámu */}
              <div className="absolute inset-0 rounded-[2rem] border border-white/20 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none z-10"></div>
              
              <div className="rounded-[1.5rem] overflow-hidden relative z-0">
                <MapWidget features={map_features} />
              </div>
            </div>
          </div>
        )}

        {/* Odkaz na zdroj */}
        {sourceLink && (
          <div className="mt-5 border-t border-white/5 pt-4">
            <a
              href={sourceLink ?? "https://www.datakhk.cz/dataset/stav-povrchu-silnic-v-khk"}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${konfig.odkaz}`}
            >
              Otevřená data KHK
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

      </div>
    </div>
  );
}

// Hlavní komponenta
export default function FormularOvereni() {
  const [vlakno, setVlakno] = useState<Zprava[]>([]);
  const [text, nastavText] = useState("");
  const [temaZobrazeni, nastavTemaZobrazeni] = useState<keyof typeof TEMATA_MAPA>("Sliby vs. Realita: Krajská infrastruktura (Doprava a Zdravotnictví)");
  const [chyba, nastavChybu] = useState<string | null>(null);
  const tema = TEMATA_MAPA[temaZobrazeni];

  const zbyvajiciZnaky = MAX_DELKA_TEXTU - text.length;
  const jeTextPrilis = zbyvajiciZnaky < 0;
  const nacitani = vlakno.some(z => z.typ === "nacitani");

  const odeslat = async (textKOvereni = text, temaKOvereni = tema) => {
    if (!textKOvereni.trim() || textKOvereni.length > MAX_DELKA_TEXTU || nacitani) return;

    const id = crypto.randomUUID();
    const idNacitani = crypto.randomUUID();

    nastavText("");
    nastavChybu(null);

    setVlakno(prev => [
      ...prev,
      { id, typ: "uzivatel", text: textKOvereni },
      { id: idNacitani, typ: "nacitani" },
    ]);

    const kontroler = new AbortController();
    const casovac = setTimeout(() => kontroler.abort(), 60_000);

    const kontextVlakno = vlakno
      .filter(z => z.typ !== "nacitani")
      .map(z => {
        if (z.typ === "uzivatel") return { role: "user", text: z.text };
        if (z.typ === "ai") return { role: "ai", text: z.vysledek?.explanation ?? "" };
        return null;
      })
      .filter(Boolean);

    try {
      const odpoved = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: textKOvereni, 
          tema: temaKOvereni,
          history: kontextVlakno
        }),
        signal: kontroler.signal,
      });

      if (!odpoved.ok) {
        const msg = await ziskatChybovouZpravu(odpoved);
        setVlakno(prev => prev.filter(z => z.id !== idNacitani));
        nastavChybu(msg);
        return;
      }

      const data: VysledekOvereni = await odpoved.json();
      setVlakno(prev => [
        ...prev.filter(z => z.id !== idNacitani),
        { id: crypto.randomUUID(), typ: "ai", vysledek: data, dotaz: textKOvereni, tema: temaKOvereni },
      ]);
    } catch (err) {
      setVlakno(prev => prev.filter(z => z.id !== idNacitani));
      nastavChybu(
        err instanceof DOMException && err.name === "AbortError"
          ? "Dotaz trval příliš dlouho. Zkraťte dotaz nebo zkuste znovu."
          : "Nastala neočekávaná chyba. Zkuste to prosím znovu."
      );
    } finally {
      clearTimeout(casovac);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-12">

      {/* ── Konverzační vlákno ── */}
      {vlakno.length > 0 && (
        <div className="flex flex-col gap-6 w-full">
          {vlakno.map(zprava => {
            if (zprava.typ === "uzivatel") {
              return (
                <div key={zprava.id} className="flex justify-end w-full animate-in fade-in duration-300">
                  <div className="max-w-[95%] lg:max-w-[85%] rounded-[2rem] rounded-tr-xl bg-white/20 backdrop-blur-md border border-white/30 px-6 py-5 md:p-6 shadow-2xl">
                    <p className="text-lg font-light text-white leading-relaxed">
                      {zprava.text}
                    </p>
                  </div>
                </div>
              );
            }
            if (zprava.typ === "nacitani") {
              return (
                <div key={zprava.id} className="flex justify-start w-full animate-in fade-in duration-300">
                  <div className="rounded-[2rem] rounded-tl-xl bg-white/5 border border-white/10 px-6 py-4 flex items-center gap-3 shadow-lg backdrop-blur-md">
                    <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                    <span className="text-sm md:text-base text-white/50 font-medium">Analyzuji data...</span>
                  </div>
                </div>
              );
            }
            if (zprava.typ === "ai") {
              return <AIZprava key={zprava.id} zprava={zprava} />;
            }
          })}
        </div>
      )}

      {/* ── Chybová hláška ── */}
      {chyba && (
        <div role="alert" className="flex items-start gap-3 text-red-300/80">
          <p className="text-sm font-light">{chyba}</p>
          <button
            onClick={() => { nastavChybu(null); odeslat(); }}
            className="shrink-0 inline-flex items-center gap-1 text-xs text-red-300/60 underline underline-offset-2 hover:text-red-300 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Znovu
          </button>
        </div>
      )}

      {/* ── Spodní kontejner: Výběr tématu + Input ── */}
      <div className="relative w-full mt-6">
        <div className="relative z-10 flex flex-col gap-4 w-full">
          {/* Výběr tématu (Ovály nad inputem) */}
          <div className="flex flex-wrap justify-center sm:justify-start gap-3">
            {(Object.keys(TEMATA_MAPA) as Array<keyof typeof TEMATA_MAPA>).map(klic => (
              <button
                key={klic}
                type="button"
                onClick={() => nastavTemaZobrazeni(klic)}
                className={`px-5 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 border backdrop-blur-xl shadow-lg ${
                  klic === temaZobrazeni
                    ? "bg-white/15 text-white border-white/40 shadow-white/5"
                    : "bg-black/60 text-white/70 border-white/10 hover:bg-black/40 hover:text-white hover:border-white/30"
                }`}
              >
                {klic}
              </button>
          ))}
        </div>

        {/* ── Glassmorphism input ── */}
        <form
          onSubmit={e => { e.preventDefault(); odeslat(); }}
          className="w-full rounded-[2rem] border border-white/10 bg-black/40 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] backdrop-blur-3xl"
        >
          {/* Záhlaví inputu */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <label htmlFor="tvrzeni" className="text-xs font-medium uppercase tracking-widest text-white/30">
              Zadejte tvrzení k ověření
            </label>
            <span className={`text-xs tabular-nums transition-colors ${
              jeTextPrilis ? "font-semibold text-red-400" : zbyvajiciZnaky <= 50 ? "text-amber-400" : "text-white/30"
            }`}>
              {zbyvajiciZnaky}
            </span>
          </div>

          {/* Textarea */}
          <textarea
            id="tvrzeni"
            value={text}
            onChange={e => nastavText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim() && !nacitani && !jeTextPrilis) {
                  odeslat();
                }
              }
            }}
            disabled={nacitani}
            maxLength={MAX_DELKA_TEXTU + 50}
            placeholder={PLACEHOLDER_MAPA[temaZobrazeni]}
            rows={2}
            className={`w-full resize-none bg-transparent text-white placeholder-white/25 text-lg outline-none px-5 pb-2 font-light leading-relaxed ${jeTextPrilis ? "text-red-300" : ""}`}
          />

          {jeTextPrilis && (
            <p className="px-5 pb-2 text-xs text-red-400">
              Zkraťte o {Math.abs(zbyvajiciZnaky)} znaků.
            </p>
          )}

          {/* Lišta nástrojů */}
          <div className="flex items-center justify-end px-5 pb-4 pt-2 border-t border-white/5">
            {/* Tlačítko odeslat */}
            <button
              type="submit"
              disabled={nacitani || !text.trim() || jeTextPrilis}
              className="bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-full px-5 py-1.5 text-sm font-medium flex items-center gap-2 transition-all active:scale-95"
            >
              {nacitani ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Ověřuji...</>
              ) : (
                <><Send className="h-3.5 w-3.5" />Odeslat</>
              )}
            </button>
          </div>
        </form>

        {/* Doporučené dotazy */}
        <div className="flex flex-wrap justify-center gap-2 mt-1 w-full animate-in fade-in duration-500">
          {DOPORUCENE_DOTAZY[temaZobrazeni].map((dotaz, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => odeslat(dotaz)}
              disabled={nacitani}
              className="px-4 py-2 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 shadow-lg text-xs sm:text-sm text-white/70 hover:bg-black/30 hover:text-white hover:border-white/25 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 group"
            >
              <HelpCircle className="h-3.5 w-3.5 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" />
              <span className="font-light">{dotaz}</span>
            </button>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
