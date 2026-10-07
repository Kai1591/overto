"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, XCircle, HelpCircle, ExternalLink, BarChart2, Send, Loader2, MessageCircle, ChevronDown } from "lucide-react";
import type { VysledekOvereni } from "@/types/fakta";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// MapWidget se smí renderovat pouze na klientovi, protože Leaflet sahá na window
const MapWidget = dynamic(() => import("./MapWidget"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full rounded-xl bg-white/5 animate-pulse mt-4 flex items-center justify-center border border-white/10">
      <span className="text-white/40 text-sm">Načítám mapu...</span>
    </div>
  ),
});

interface FactCardProps {
  vysledek: VysledekOvereni;
  originalQuery: string;
  tema: string;
}

interface FollowUpMessage {
  role: "user" | "ai";
  text: string;
}

/**
 * Komponenta pro vykreslení markdownu pomocí react-markdown.
 * Bezpečně zvládá hvězdičky a další markdown formátování.
 */
function FormatovanyText({ text }: { text: string }) {
  // Fixujeme "\n" string literal z AI, aby to opravdu byl nový řádek
  // A přidáme chybějící odřádkování před " - " nebo " * ", pokud ho AI zapomene (tzv. inline odrážky)
  const opravenyText = text
    .replace(/\\n/g, "\n")
    .replace(/(?<=[.:!?])\s+([-*])\s+(?=\S)/g, "\n\n$1 ")
    .replace(/(?<!\n)\s+([-*])\s+(?=\*\*)/g, "\n$1 ");
  
  return (
    <div className="space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({node, ...props}) => <h1 className="pt-2 text-sm font-semibold uppercase tracking-wider opacity-90" {...props} />,
          h2: ({node, ...props}) => <h2 className="pt-2 text-sm font-semibold uppercase tracking-wider opacity-90" {...props} />,
          h3: ({node, ...props}) => <h3 className="pt-2 text-sm font-semibold uppercase tracking-wider opacity-90" {...props} />,
          h4: ({node, ...props}) => <h4 className="pt-2 text-sm font-semibold uppercase tracking-wider opacity-90" {...props} />,
          ul: ({node, ...props}) => <ul className="space-y-1 list-none m-0 p-0" {...props} />,
          li: ({node, children, ...props}) => (
            <li className="flex gap-2 pl-1" {...props}>
              <span className="opacity-60 shrink-0 mt-0.5">•</span>
              <span className="break-words">{children}</span>
            </li>
          ),
          strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
          p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />
        }}
      >
        {opravenyText}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Glassmorphism konfigurace vizuálních stavů.
 */
const KONFIGURACE_STAVU = {
  Pravda: {
    obal: "bg-emerald-500/10 border-emerald-400/40",
    ikonaBg: "bg-emerald-500/20",
    ikona: <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />,
    stitek: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30",
    popisek: "Výsledek ověření",
    text: "text-emerald-100/90",
    glow: "shadow-emerald-500/10",
    oddelovac: "border-emerald-400/20",
    odkaz: "text-emerald-300 hover:text-emerald-100",
    chatBorder: "border-emerald-400/20",
    chatInput: "border-emerald-400/30 focus:border-emerald-400/60",
    userBubble: "bg-emerald-500/20 text-emerald-100",
    aiBubble: "bg-white/5 text-white/80",
  },
  Nepravda: {
    obal: "bg-red-500/10 border-red-400/40",
    ikonaBg: "bg-red-500/20",
    ikona: <XCircle className="h-6 w-6 text-red-400 shrink-0" />,
    stitek: "bg-red-500/20 text-red-300 border border-red-400/30",
    popisek: "Výsledek ověření",
    text: "text-red-100/90",
    glow: "shadow-red-500/10",
    oddelovac: "border-red-400/20",
    odkaz: "text-red-300 hover:text-red-100",
    chatBorder: "border-red-400/20",
    chatInput: "border-red-400/30 focus:border-red-400/60",
    userBubble: "bg-red-500/20 text-red-100",
    aiBubble: "bg-white/5 text-white/80",
  },
  Neověřitelné: {
    obal: "bg-white/5 border-white/15",
    ikonaBg: "bg-white/10",
    ikona: <HelpCircle className="h-6 w-6 text-white/50 shrink-0" />,
    stitek: "bg-white/10 text-white/60 border border-white/20",
    popisek: "Výsledek ověření",
    text: "text-white/60",
    glow: "shadow-white/5",
    oddelovac: "border-white/10",
    odkaz: "text-white/50 hover:text-white/80",
    chatBorder: "border-white/10",
    chatInput: "border-white/20 focus:border-white/40",
    userBubble: "bg-white/10 text-white/80",
    aiBubble: "bg-white/5 text-white/60",
  },
  Analýza: {
    obal: "bg-blue-500/10 border-blue-400/40",
    ikonaBg: "bg-blue-500/20",
    ikona: <BarChart2 className="h-6 w-6 text-blue-400 shrink-0" />,
    stitek: "bg-blue-500/20 text-blue-300 border border-blue-400/30",
    popisek: "Odpověď z dat",
    text: "text-blue-100/90",
    glow: "shadow-blue-500/10",
    oddelovac: "border-blue-400/20",
    odkaz: "text-blue-300 hover:text-blue-100",
    chatBorder: "border-blue-400/20",
    chatInput: "border-blue-400/30 focus:border-blue-400/60",
    userBubble: "bg-blue-500/20 text-blue-100",
    aiBubble: "bg-white/5 text-white/80",
  },
} as const;

/**
 * Komponenta zobrazující výsledek ověření nebo analýzy + inline follow-up chat.
 */
export default function FactCard({ vysledek, originalQuery, tema }: FactCardProps) {
  const { status, explanation, sourceLink } = vysledek;

  const konfig =
    KONFIGURACE_STAVU[status] ?? KONFIGURACE_STAVU["Neověřitelné"];

  // Follow-up chat stav
  const [chatOtevren, setChatOtevren] = useState(false);
  const [zpravy, setZpravy] = useState<FollowUpMessage[]>([]);
  const [vstup, setVstup] = useState("");
  const [nacitani, setNacitani] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const chatSpodek = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll na nové zprávy
  useEffect(() => {
    if (chatSpodek.current) {
      chatSpodek.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [zpravy]);

  // Focus input při otevření chatu
  useEffect(() => {
    if (chatOtevren && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [chatOtevren]);

  const odeslat = async () => {
    const otazka = vstup.trim();
    if (!otazka || nacitani) return;

    setVstup("");
    setChyba(null);
    setZpravy((prev) => [...prev, { role: "user", text: otazka }]);
    setNacitani(true);

    try {
      const odpoved = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalQuery,
          originalAnswer: explanation,
          originalStatus: status,
          tema,
          followUpQuestion: otazka,
        }),
      });

      if (!odpoved.ok) {
        const data = await odpoved.json().catch(() => ({}));
        setChyba(data?.chyba ?? "Nepodařilo se získat odpověď.");
        return;
      }

      const data = await odpoved.json();
      setZpravy((prev) => [...prev, { role: "ai", text: data.answer }]);
    } catch {
      setChyba("Nastala neočekávaná chyba. Zkuste to znovu.");
    } finally {
      setNacitani(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      odeslat();
    }
  };

  return (
    <div
      className={`mt-2 w-full rounded-2xl border shadow-xl backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden ${konfig.obal} ${konfig.glow}`}
      role="region"
      aria-label="Výsledek ověření"
    >
      {/* ── Tenký horní pruh s kontextem ────────────────────────── */}
      <div className={`flex items-center justify-between px-5 py-2.5 border-b ${konfig.oddelovac} bg-white/[0.03]`}>
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium">
          {konfig.popisek}
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-[0.15em] rounded-full px-2.5 py-0.5 ${konfig.stitek}`}>
          {status}
        </span>
      </div>

      {/* ── Hlavní text ─────────────────────────────────────────── */}
      <div className={`px-5 pt-5 pb-3 text-base leading-loose font-light ${konfig.text}`}>
        <FormatovanyText text={explanation} />
      </div>

      {/* ── Interaktivní Mapa ───────────────────────────────── */}
      {vysledek.map_features && vysledek.map_features.length > 0 && (
        <div className="px-5">
          <MapWidget features={vysledek.map_features} />
        </div>
      )}

      {/* ── Zdroj dat ───────────────────────────────────────── */}
      <div className={`mx-5 mt-4 border-t pt-3 ${konfig.oddelovac}`}>
        <p className="mb-1 text-xs text-white/30">Zdroj dat:</p>
        <a
          href={sourceLink ?? "https://www.datakhk.cz/dataset/stav-povrchu-silnic-v-khk"}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2 transition-colors ${konfig.odkaz}`}
        >
          <ExternalLink className="h-3 w-3" />
          Otevřená data Královéhradeckého kraje – Stav povrchu silnic
        </a>
      </div>

      {/* ── Follow-up chat toggle ────────────────────────────── */}
      <div className={`mx-5 mt-3 mb-4 border-t ${konfig.oddelovac}`}>
        <button
          type="button"
          onClick={() => setChatOtevren(!chatOtevren)}
          className="mt-3 flex w-full items-center justify-between text-xs text-white/40 hover:text-white/70 transition-colors group"
        >
          <span className="flex items-center gap-2">
            <MessageCircle className="h-3.5 w-3.5" />
            {zpravy.length > 0
              ? `Doplňující otázky (${zpravy.filter((z) => z.role === "user").length})`
              : "Zeptejte se na detaily k této analýze"}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-300 ${chatOtevren ? "rotate-180" : ""}`}
          />
        </button>

        {/* ── Chat vlákno ──────────────────────────────────── */}
        {chatOtevren && (
          <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Zprávy */}
            {zpravy.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {zpravy.map((zprava, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                      zprava.role === "user"
                        ? `ml-6 ${konfig.userBubble}`
                        : `mr-6 ${konfig.aiBubble}`
                    }`}
                  >
                    {zprava.role === "ai" && (
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                        Analytik
                      </p>
                    )}
                    {zprava.role === "ai" ? <FormatovanyText text={zprava.text} /> : zprava.text}
                  </div>
                ))}

                {nacitani && (
                  <div className={`mr-6 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${konfig.aiBubble}`}>
                    <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                    <span className="text-white/40">Zpracovávám...</span>
                  </div>
                )}

                {chyba && (
                  <p className="text-xs text-red-400 px-1">{chyba}</p>
                )}

                <div ref={chatSpodek} />
              </div>
            )}

            {/* Input */}
            <div className={`flex items-end gap-2 rounded-xl border bg-white/5 px-3 py-2 ${konfig.chatInput} transition-colors`}>
              <textarea
                ref={inputRef}
                value={vstup}
                onChange={(e) => setVstup(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={nacitani}
                placeholder="Zeptejte se na detaily... (Enter odešle)"
                rows={1}
                className="flex-1 resize-none bg-transparent text-xs text-white/80 placeholder-white/30 outline-none leading-relaxed"
                style={{ minHeight: "20px", maxHeight: "80px" }}
              />
              <button
                type="button"
                onClick={odeslat}
                disabled={!vstup.trim() || nacitani}
                className="shrink-0 rounded-lg p-1.5 text-white/40 transition-all hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Odeslat doplňující otázku"
              >
                {nacitani ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
