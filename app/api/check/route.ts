import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Mapování témat na názvy souborů v adresáři /data.
 * Při přidání nového tématu stačí doplnit tento objekt
 * a přidat odpovídající JSON soubor.
 */
const DIR_MAPPING: Record<string, string> = {
  sliby_realita: "slibyvsrealita",
  hlidac_penez: "hlidacpenez",
};

/**
 * Helper – načte a vrátí properties z GeoJSON/JSON souboru.
 */
function nacistSoubor(nazev: string, dotaz?: string): unknown {
  const cesta = path.join(process.cwd(), "data", nazev);
  if (!fs.existsSync(cesta)) return null;
  const obsah = fs.readFileSync(cesta, "utf-8");
  const parsed = JSON.parse(obsah);
  
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "features" in parsed &&
    Array.isArray((parsed as { features: unknown[] }).features)
  ) {
    let features = (parsed as { features: Array<{ properties?: unknown }> }).features
      .map((f) => f.properties);

    const fullFeatures = [...features];

    // Chytry filtr s bodováním relevance (BM25-lite)
    if (dotaz && features.length > 50) {
      const slova = dotaz.split(/[^a-záčďéěíňóřšťúůýž]+/).filter(w => w.length > 3);
      
      if (slova.length > 0) {
        // Obyčejné textové indexování
        const scoredFeatures = features.map(f => {
          const raw = JSON.stringify(f).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          let score = 0;
          for (const w of slova) {
            if (raw.includes(w)) score++;
          }
          return { feature: f, score };
        });

        // Seřadit podle relevance a vyřadit ty, co nemají žádnou shodu
        const matched = scoredFeatures
          .filter(sf => sf.score > 0)
          .sort((a, b) => b.score - a.score)
          .map(sf => sf.feature);
        
        if (matched.length > 0) {
          features = matched;
        }
      }
      
      // Finální striktní limit pro KAŽDÝ soubor. 
      if (features.length > 100) {
        features = features.slice(0, 100);
      }
    } else if (features.length > 100) {
       features = features.slice(0, 100);
    }

    return { __dataForAI: features, __fullDataForAgg: fullFeatures };
  }
  return { __dataForAI: parsed, __fullDataForAgg: parsed };
}

/**
 * POST /api/check
 *
 * Přijímá JSON tělo: { text: string, tema: string }
 * Ověří tvrzení oproti lokálním datovým souborům pomocí Google Gemini API.
 *
 * Ochranná logika:
 * - Pokud datový soubor pro dané téma neexistuje, vrátí 200 s "Neověřitelné"
 *   (nikdy nehavaruje s HTTP 500 kvůli chybějícím datům).
 */
export async function POST(request: NextRequest) {
  /* Parsování těla požadavku */
  let text: string;
  let tema: string;
  let history: any[] = [];

  try {
    const telo = await request.json();
    text = String(telo.text ?? "").trim();
    tema = String(telo.tema ?? "").trim();
    history = Array.isArray(telo.history) ? telo.history : [];
  } catch {
    return Response.json(
      { chyba: "Neplatný formát požadavku. Očekáváno JSON s klíči text a tema." },
      { status: 400 }
    );
  }

  /* Validace vstupů */
  if (!text || !tema) {
    return Response.json(
      { chyba: "Parametry text a tema jsou povinné." },
      { status: 400 }
    );
  }

  /* Ochrana před příliš dlouhým textem – max. 500 znaků */
  const MAX_DELKA = 500;
  if (text.length > MAX_DELKA) {
    return Response.json(
      { chyba: `Dotaz je příliš dlouhý (${text.length} znaků). Maximálně povoleno ${MAX_DELKA} znaků.` },
      { status: 400 }
    );
  }

  /* 
   * CHYTRÝ ROUTER: 
   * Rozdělíme 2 hlavní módy do podsložek a na základě klíčových slov v dotazu
   * načteme jen ty složky, které dávají smysl. Tím zabráníme přehlcení AI a timeoutům.
   */
  const MOZNE_SLOZKY = tema === "hlidac_penez" 
    ? ["hlidacpenez", "investice"] 
    : ["slibyvsrealita", "verejnadopravaasilnice", "zdravotnictvi", "IZSabezpecnost"];

  const KATEGORIE_SLOVA: Record<string, string[]> = {
    "zdravotnictvi": ["nemocnic", "doktor", "lekar", "zubar", "zdravot", "pece", "pohotovost", "lazne", "pediatr", "luzk", "pacient", "ordinac"],
    "IZSabezpecnost": ["polici", "hasic", "zachran", "izs", "bezpec", "kriminal", "vyjezd", "stanic"],
    "verejnadopravaasilnice": ["autobus", "vlak", "zeleznic", "zastavk", "letist", "doprav", "spoj", "mhd", "nadrazi", "kolej"],
    "slibyvsrealita": ["silnic", "asfalt", "povrch", "vytluk", "dir", "havarijn", "cesta", "usek"],
    "investice": ["invest", "oprav", "pobidk", "stavb", "infrastruktur", "rozvoj"],
    "hlidacpenez": ["dotac", "penez", "financ", "grant", "podpor", "rozpoc", "fond", "projekt"]
  };

  // Normalizace dotazu (malá písmena, bez diakritiky)
  // Bereme v úvahu i historii, protože kontext může ovlivnit, která data potřebujeme
  const kontextText = history.map(h => h.text).join(" ") + " " + text;
  const normText = kontextText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let vybraneSlozky: string[] = [];
  for (const slozka of MOZNE_SLOZKY) {
    const slova = KATEGORIE_SLOVA[slozka] || [];
    const match = slova.some(word => normText.includes(word));
    if (match) vybraneSlozky.push(slozka);
  }

  // Fallback: Pokud jsme v textu nenašli žádné klíčové slovo, 
  // načteme aspoň výchozí stěžejní složku pro daný mód (aby vždy byla nějaká data).
  if (vybraneSlozky.length === 0) {
    vybraneSlozky = tema === "hlidac_penez" ? ["hlidacpenez"] : ["slibyvsrealita"];
  }

  /* Dynamické načtení souborů z vybraných složek */
  let souborInfo: string[] = [];
  try {
    for (const slozka of vybraneSlozky) {
      const absolutniCesta = path.join(process.cwd(), "data", slozka);
      if (fs.existsSync(absolutniCesta)) {
        const soubory = fs.readdirSync(absolutniCesta);
        const vybraneSoubory = soubory
          .filter((f) => f.endsWith(".geojson") || f.endsWith(".json"))
          .filter((f) => !f.endsWith(".aliases.json"))
          .map((f) => path.join(slozka, f).replace(/\\/g, "/"));
        souborInfo.push(...vybraneSoubory);
      }
    }
  } catch (err) {
    console.warn(`[FaktaKHK] Nelze přečíst složky:`, err);
  }

  /*
   * NKOD (předzpracované, malé soubory v data/nkod_slim – viz scripts/prepare-nkod.mjs).
   * Načteme jen soubory, jejichž název sdílí kmen slova s dotazem (max. 3),
   * aby se do AI nedostalo nic zbytečného.
   */
  try {
    const nkodCesta = path.join(process.cwd(), "data", "nkod_slim");
    if (fs.existsSync(nkodCesta)) {
      const stemyDotazu = normText
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 5)
        .map((w) => w.slice(0, 5));

      if (stemyDotazu.length > 0) {
        const nkodSoubory = fs
          .readdirSync(nkodCesta)
          .filter((f) => f.endsWith(".geojson") && !f.startsWith("_"))
          .map((f) => {
            const nazevNorm = f.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const skore = stemyDotazu.filter((s) => nazevNorm.includes(s)).length;
            return { f, skore };
          })
          .filter((x) => x.skore > 0)
          .sort((a, b) => b.skore - a.skore)
          .slice(0, 3)
          .map((x) => path.join("nkod_slim", x.f).replace(/\\/g, "/"));
        souborInfo.push(...nkodSoubory);
      }
    }
  } catch (err) {
    console.warn(`[FaktaKHK] Nelze přečíst složku nkod_slim:`, err);
  }

  if (souborInfo.length === 0) {
    return Response.json({
      status: "Neověřitelné",
      explanation: "Data pro toto téma (nebo klíčová slova) zatím nebyla do systému nahrána.",
      sourceLink: "https://www.datakhk.cz/search",
    });
  }

  /* Načtení dat – podporuje jeden i více souborů */
  let data: unknown;
  let dataProAI: unknown;

  try {
    if (Array.isArray(souborInfo)) {
      // Více souborů – zkombinujeme do jednoho objektu s pojmenovanými sekcemi
      const kombinovanaData: Record<string, unknown> = {};
      const kombinovanaData_plnaData: Record<string, unknown> = {};
      let nactenyAlesponJeden = false;

      for (const nazev of souborInfo) {
        const sekce = nacistSoubor(nazev, normText) as any;
        if (sekce !== null) {
          const klic = nazev.replace(/\.[^.]+$/, "");
          if (sekce && typeof sekce === "object" && "__dataForAI" in sekce) {
            kombinovanaData[klic] = sekce.__dataForAI;
            kombinovanaData_plnaData[klic] = sekce.__fullDataForAgg;
          } else {
            kombinovanaData[klic] = sekce;
            kombinovanaData_plnaData[klic] = sekce;
          }
          nactenyAlesponJeden = true;
        }
      }

      if (!nactenyAlesponJeden) {
        return Response.json({
          status: "Neověřitelné",
          explanation: "Data pro toto téma zatím nebyla do systému nahrána.",
          sourceLink: "https://www.datakhk.cz/search",
        });
      }

      /* Přesný souhrn investičních pobídek – počítá kód, ne AI (model součty jen odhaduje) */
      const radkyPobidek: Array<Record<string, unknown>> = [];
      for (const sekce of Object.values(kombinovanaData_plnaData)) {
        if (Array.isArray(sekce)) {
          for (const r of sekce) {
            if (r && typeof r === "object" && "investice_mil__CZK" in r && "nazev_okresu" in r) {
              radkyPobidek.push(r as Record<string, unknown>);
            }
          }
        }
      }
      if (radkyPobidek.length > 0) {
        const cislo = (v: unknown) => {
          const n = Number(String(v ?? "").replace(",", "."));
          return Number.isFinite(n) ? n : 0;
        };
        const okresy: Record<string, { pobidek: Set<string>; firem: Set<string>; investice_mil_czk: number; nova_pm: number }> = {};
        const firmy: Record<string, { nazev: string; okresy: Set<string>; investice_mil_czk: number; nova_pm: number }> = {};
        let celkemInv = 0;
        let celkemPm = 0;
        const vsechnyPobidky = new Set<string>();

        for (const r of radkyPobidek) {
          const okres = String(r.nazev_okresu ?? "neuvedeno").trim();
          const ico = String(r.ico ?? r.nazev_spolecnosti ?? "?");
          const inv = cislo(r.investice_mil__CZK);
          const pm = cislo(r.nova_pm);
          const idPobidky = String(r.cislo_pobidky ?? `${ico}-${inv}`);

          okresy[okres] ??= { pobidek: new Set(), firem: new Set(), investice_mil_czk: 0, nova_pm: 0 };
          okresy[okres].pobidek.add(idPobidky);
          okresy[okres].firem.add(ico);
          okresy[okres].investice_mil_czk += inv;
          okresy[okres].nova_pm += pm;

          firmy[ico] ??= { nazev: String(r.nazev_spolecnosti ?? ico), okresy: new Set(), investice_mil_czk: 0, nova_pm: 0 };
          firmy[ico].okresy.add(okres);
          firmy[ico].investice_mil_czk += inv;
          firmy[ico].nova_pm += pm;

          vsechnyPobidky.add(idPobidky);
          celkemInv += inv;
          celkemPm += pm;
        }

        const zaokr = (n: number) => Math.round(n * 10) / 10;
        kombinovanaData["PREDPOCITANY_SOUHRN_INVESTICNICH_POBIDEK"] = {
          poznamka:
            "Přesné součty vypočítané kódem z řádků investičních pobídek. Jedna pobídka (cislo_pobidky) může mít více řádků, proto se pobídky počítají jako unikátní čísla. Používej tato čísla místo vlastního počítání.",
          celkem: {
            unikatnich_pobidek: vsechnyPobidky.size,
            firem: Object.keys(firmy).length,
            investice_mil_czk: zaokr(celkemInv),
            nove_pracovni_mista: celkemPm,
          },
          podle_okresu: Object.entries(okresy)
            .map(([okres, v]) => ({
              okres,
              unikatnich_pobidek: v.pobidek.size,
              firem: v.firem.size,
              investice_mil_czk: zaokr(v.investice_mil_czk),
              nove_pracovni_mista: v.nova_pm,
            }))
            .sort((a, b) => b.unikatnich_pobidek - a.unikatnich_pobidek),
          nejvetsi_firmy_podle_investic: Object.values(firmy)
            .map((f) => ({
              firma: f.nazev,
              okresy: Array.from(f.okresy),
              investice_mil_czk: zaokr(f.investice_mil_czk),
              nove_pracovni_mista: f.nova_pm,
            }))
            .sort((a, b) => b.investice_mil_czk - a.investice_mil_czk)
            .slice(0, 15),
        };
      }

      /* Přesný souhrn stavu silnic – počítá kód, ne AI (protože raw data jsou moc velká a nevejdou se do kontextu) */
      const radkySilnic: Array<Record<string, unknown>> = [];
      for (const sekce of Object.values(kombinovanaData_plnaData)) {
        if (Array.isArray(sekce)) {
          for (const r of sekce) {
            if (r && typeof r === "object" && ("stav_sil" in r || "Stav_povrc" in r)) {
              radkySilnic.push(r as Record<string, unknown>);
            }
          }
        } else if (sekce && typeof sekce === "object" && "features" in sekce && Array.isArray(sekce.features)) {
          for (const f of sekce.features) {
            if (f && typeof f === "object" && "properties" in f && typeof f.properties === "object" && f.properties && ("stav_sil" in f.properties || "Stav_povrc" in f.properties)) {
              radkySilnic.push(f.properties as Record<string, unknown>);
            }
          }
        }
      }

      if (radkySilnic.length > 0) {
        const okresySilnice: Record<string, Record<string, number>> = {};
        let celkemHavarijnich = 0;

        for (const r of radkySilnic) {
          const okres = String(r.nazev_okresu ?? r.Okres ?? r.Nazev_okre ?? "Neznámý okres").trim();
          const stavRaw = String(r.stav_sil ?? r.Stav_povrc ?? "").toLowerCase();
          
          let stav = "Nezjištěno";
          if (stavRaw.includes("havarijní") || stavRaw.includes("superhavarijní")) {
             stav = "Havarijní";
             celkemHavarijnich++;
          } else if (stavRaw.includes("nevyhovující")) stav = "Nevyhovující";
          else if (stavRaw.includes("vyhovující")) stav = "Vyhovující";
          else if (stavRaw.includes("dobrý")) stav = "Dobrý";
          else if (stavRaw.includes("výborný")) stav = "Výborný";

          okresySilnice[okres] ??= { "Havarijní": 0, "Nevyhovující": 0, "Vyhovující": 0, "Dobrý": 0, "Výborný": 0, "Nezjištěno": 0, "Celkem úseků": 0 };
          
          okresySilnice[okres]["Celkem úseků"]++;
          okresySilnice[okres][stav]++;
        }

        kombinovanaData["PREDPOCITANY_SOUHRN_STAVU_SILNIC"] = {
          poznamka: "Přesné součty úseků silnic podle okresů a jejich stavu. Využij tato přesná data namísto toho, aby ses snažil/a odhadovat stav z omezeného vzorku surových dat (do kterých se kvůli velikosti nedostaly všechny okresy).",
          celkem_havarijnich_v_kraji: celkemHavarijnich,
          podle_okresu: Object.entries(okresySilnice)
            .map(([okres, stavy]) => ({
              okres,
              ...stavy
            }))
            .sort((a, b) => b["Havarijní"] - a["Havarijní"]),
        };
      }

      data = kombinovanaData;
      dataProAI = kombinovanaData;
    } else {
      // Jeden soubor – původní logika
      const cestaSouboru = path.join(process.cwd(), "data", souborInfo);

      if (!fs.existsSync(cestaSouboru)) {
        return Response.json({
          status: "Neověřitelné",
          explanation:
            "Data pro toto téma zatím nebyla do systému nahrána. Kontaktujte správce nebo vložte příslušný JSON soubor do složky /data.",
          sourceLink: "https://www.datakhk.cz/search",
        });
      }

      const obsah = fs.readFileSync(cestaSouboru, "utf-8");
      data = JSON.parse(obsah);

      if (
        data !== null &&
        typeof data === "object" &&
        "features" in data &&
        Array.isArray((data as { features: unknown[] }).features)
      ) {
        const geojson = data as { features: Array<{ properties?: unknown }> };
        dataProAI = geojson.features
          .slice(0, 300)
          .map((f) => f.properties);
      } else {
        dataProAI = data;
      }
    }
  } catch (err) {
    console.error("[FaktaKHK] Chyba čtení datového souboru:", err);
    return Response.json(
      { chyba: "Nepodařilo se načíst datový soubor. Zkontrolujte jeho formát." },
      { status: 500 }
    );
  }

  /* Ověření dostupnosti API klíče */
  const apiKlic = process.env.GOOGLE_API_KEY;
  if (!apiKlic) {
    console.error("[FaktaKHK] Proměnná GOOGLE_API_KEY není nastavena.");
    return Response.json(
      { chyba: "API klíč není nakonfigurován. Nastavte proměnnou GOOGLE_API_KEY v souboru .env.local." },
      { status: 500 }
    );
  }

  /* Volání Google Gemini API */
  let basePrompt = "";
  if (tema === "hlidac_penez") {
    // Mód 1: Hlídač peněz
    basePrompt = `Jsi investigativní datový analytik Královéhradeckého kraje. Analyzuješ data o veřejných zakázkách a dotacích. Tvým úkolem je přeložit složitý úřední jazyk do srozumitelného shrnutí pro běžného občana. Ověř tvrzení uživatele. Soustřeď se na odhalování finančních anomálií (např. podezřele vysoké částky u daného typu zakázky) nebo netransparentnosti. Čerpej VÝHRADNĚ z přiloženého JSONu. Nevymýšlej si. Máš k dispozici VÝHRADNĚ data o krajských dotacích a krajských investicích. Pokud tvrzení uživatele hovoří o penězích z jiných zdrojů (např. vlastní rozpočty měst a obcí nebo státní rozpočet z NKÚ), musíš vrátit status 'Neověřitelné' a občanovi vysvětlit, že krajská data tyto finance neevidují.
Tvoje databáze obsahuje komplexní data o: Krajských dotacích (individuálních i programových do kraje, okresů a ORP) a Investičních pobídkách. Tuto znalost použij k představení svých možností, pokud se tě uživatel ptá, co umíš.
Pokud data obsahují sekci PREDPOCITANY_SOUHRN_INVESTICNICH_POBIDEK, jsou to přesné součty spočítané kódem. Cituj z ní čísla doslova (počty pobídek, firem, investice v mil. Kč, nová pracovní místa, pořadí okresů a největší firmy) a NIKDY je nenahrazuj vlastním odhadem ani vágními formulacemi jako "desítky miliard" nebo "tisíce míst". Vždy uveď konkrétní čísla a názvy firem.`;
  } else {
    // Mód 2: Sliby vs. Realita
    basePrompt = `Jsi nekompromisní fact-checker slibů lokálních politiků. Tvým úkolem je porovnat tvrzení uživatele (např. ze sociálních sítí o stavu silnic či nemocnic) s tvrdými daty Královéhradeckého kraje. Ověř reálný stav povrchů, investice do infrastruktury nebo data o lůžkách v přiloženém JSONu. Odhal, zda je tvrzení pravdivé, nebo se rozchází s realitou. Čerpej VÝHRADNĚ z přiloženého JSONu.
Tvoje databáze obsahuje komplexní data o: Kvalitě povrchů silnic, plánech zimní údržby, autobusových a železničních linkách a zastávkách, letištích, nemocnicích, ordinacích praktických lékařů (pro děti i dospělé), zubařích, lékařských pohotovostech, lázních, hasičských stanicích, policejních služebnách a výjezdových základnách záchranky. Tuto znalost použij k představení svých možností, pokud se tě uživatel ptá, co umíš.`;
  }

  const systemovyPrompt = `${basePrompt}

ROZHODNUTÍ O STATUSU (DŮLEŽITÉ):
1. Pokud uživatel předkládá TVRZENÍ k ověření (např. "Kraj dal 100 milionů na dotace"), použij status "Pravda", "Nepravda" nebo "Neověřitelné".
2. Pokud uživatel klade OTEVŘENOU OTÁZKU na data (např. "Kolik peněz šlo do Jičína?", "Jaká je úspěšnost?"), nehodnoť pravdivost, ale VŽDY použij status "Analýza".

Odpověz vždy striktně jako validní JSON objekt s těmito klíči:
- "status": přesně jedna z hodnot "Pravda", "Nepravda", "Neověřitelné", nebo "Analýza"
- "explanation": srozumitelné vysvětlení pro občana v češtině. Zcela se vyhni jakémukoliv formátování - nepoužívej žádné hvězdičky (*) pro odrážky ani pro tučné písmo. Piš pouze souvislý plynulý text bez markdownu. POZOR: Vracíš JSON, takže nesmíš použít skutečný neescapovaný konec řádku. Pro odřádkování odstavců použij VŽDY escapovanou sekvenci znaků '\\n'.
- "affected_segments": pole řetězců (string[]), které obsahuje ID (např. hodnota klíče "dp_id") všech dotčených úseků, projektů či silnic, o kterých v odpovědi mluvíš, pro potřeby mapy. Pokud nenajdeš konkrétní ID nebo se dotaz netýká specifik, vrať prázdné pole [].

Pokud data absolutně nestačí k posouzení tvrzení, použij status "Neověřitelné" s vysvětlením proč.`;

  const uzivatelskyzprava = `Dotaz uživatele: "${text}"

Dostupná krajská data:
${JSON.stringify(dataProAI, null, 0)}`;

  const messages = [];
  if (history && history.length > 0) {
    history.forEach((msg) => {
      messages.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }]
      });
    });
  }

  messages.push({
    role: "user",
    parts: [{ text: uzivatelskyzprava }]
  });

  /* Tělo požadavku – sestaveno jednou, použito při každém pokusu */
  const geminiTelo = JSON.stringify({
    system_instruction: {
      parts: [{ text: systemovyPrompt }],
    },
    contents: messages,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  /* Retry s exponenciálním backoffem – max. 3 pokusy, zpoždění 1 s / 2 s */
  const MAX_POKUSU = 3;
  const ZPOZDENI_MS = [1000, 2000];
  /** Timeout na jeden pokus – 60 s. AI občas potřebuje více času na analýzu objemných JSON souborů. */
  const TIMEOUT_MS = 60_000;

  let geminiOdpoved!: Response;

  try {
    for (let pokus = 1; pokus <= MAX_POKUSU; pokus++) {
      const kontroler = new AbortController();
      const casovac = setTimeout(() => kontroler.abort(), TIMEOUT_MS);

      try {
        geminiOdpoved = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${apiKlic}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: geminiTelo,
            signal: kontroler.signal,
          }
        );
      } catch (fetchChyba) {
        clearTimeout(casovac);
        /* Timeout nebo síťová chyba – nepokoušíme se opakovat, vrátíme srozumitelnou hlášku */
        const jeTimeout =
          fetchChyba instanceof DOMException && fetchChyba.name === "AbortError";
        return Response.json(
          {
            chyba: jeTimeout
              ? "AI služba neodpověděla včas (timeout 60 s). Zkuste to prosím znovu."
              : "Nepodařilo se spojit s AI službou. Zkontrolujte připojení a zkuste to znovu.",
          },
          { status: 502 }
        );
      } finally {
        clearTimeout(casovac);
      }

      /* Úspěch nebo neopravitelná chyba – přestaňme opakovat (pokud to není 503 nebo 429) */
      if (geminiOdpoved.ok || (geminiOdpoved.status !== 503 && geminiOdpoved.status !== 429)) break;

      /* 503 nebo 429 – server přetížen nebo rate limit, počkáme a zkusíme znovu */
      if (pokus < MAX_POKUSU) {
        // U chyby 429 (Rate Limit) většinou API žádá o cca 4 vteřiny, tak počkáme 5.
        const cekani = geminiOdpoved.status === 429 ? 5000 : (ZPOZDENI_MS[pokus - 1] ?? 2000);
        console.warn(
          `[FaktaKHK] Gemini chyba ${geminiOdpoved.status} – pokus ${pokus}/${MAX_POKUSU}, čekám ${cekani} ms…`
        );
        await new Promise((r) => setTimeout(r, cekani));
      }
    }

    if (!geminiOdpoved.ok) {
      const chybaText = await geminiOdpoved.text();
      console.error("[FaktaKHK] Gemini API chyba:", chybaText);

      const jePresizeni = geminiOdpoved.status === 503 || geminiOdpoved.status === 429;
      return Response.json(
        {
          chyba: jePresizeni
            ? "Příliš mnoho dotazů (vyčerpán limit). Prosím, počkejte pár vteřin a zkuste to znovu."
            : "Chyba při komunikaci s AI službou. Zkuste to prosím znovu.",
        },
        { status: 502 }
      );
    }

    const geminiData = await geminiOdpoved.json();

    /* Bezpečné vytažení textu z odpovědi Gemini */
    let rawText: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Odstranění markdown bloků (pokud je Gemini přidalo)
    rawText = rawText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim();

    let aiVysledek: { status: string; explanation: string; affected_segments?: string[] };
    try {
      aiVysledek = JSON.parse(rawText);
    } catch {
      // Fallback pro případ, že AI vrátil neescapované \n uvnitř explanation stringu
      try {
        const opraveno = rawText
          .replace(/\n/g, "\\n")
          .replace(/{\\n/g, "{\n")
          .replace(/}\\n/g, "}\n")
          .replace(/,\\n/g, ",\n")
          .replace(/\[\\n/g, "[\n")
          .replace(/\]\\n/g, "]\n")
          .replace(/"\\n\s+"/g, "\"\n  \"")
          .replace(/"\\n\}/g, "\"\n}");
        
        aiVysledek = JSON.parse(opraveno);
      } catch (e2) {
        console.error("[FaktaKHK] Nepodařilo se parsovat odpověď AI:", rawText);
        return Response.json({
          status: "Neověřitelné",
          explanation:
            "AI vrátila neočekávanou odpověď (chyba formátu). Zkuste to prosím znovu nebo přeformulujte tvrzení.",
          sourceLink: "https://www.datakhk.cz/search",
        });
      }
    }

    /* Příprava mapových dat (pokud AI specifikovalo dotčené úseky) */
    const map_features: Array<{ id: string; stav: string; coordinates: [number, number][]; okres?: string }> = [];
    if (aiVysledek.affected_segments && Array.isArray(aiVysledek.affected_segments) && aiVysledek.affected_segments.length > 0) {
      for (const nazev of souborInfo) {
        if (!nazev.endsWith(".geojson")) continue;
        try {
          const cesta = path.join(process.cwd(), "data", nazev);
          if (!fs.existsSync(cesta)) continue;

          const rawGeojson = JSON.parse(fs.readFileSync(cesta, "utf-8"));
          if (rawGeojson && Array.isArray(rawGeojson.features)) {
            for (const feature of rawGeojson.features) {
              const props = feature.properties;
              if (props && props.dp_id && aiVysledek.affected_segments.includes(String(props.dp_id))) {
                let coords: [number, number][] = [];
                if (feature.geometry?.type === "LineString" && Array.isArray(feature.geometry.coordinates)) {
                  coords = feature.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]); // [lon, lat] -> [lat, lon]
                } else if (feature.geometry?.type === "MultiLineString" && Array.isArray(feature.geometry.coordinates)) {
                  coords = feature.geometry.coordinates.flat().map((coord: number[]) => [coord[1], coord[0]]);
                } else if (feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
                  coords = [[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]];
                }
                
                // Přidáme jen úseky, které mají platné souřadnice (ideálně čáry nebo body)
                if (coords.length > 0) {
                  map_features.push({
                    id: String(props.dp_id || props.OBJECTID || Math.random()),
                    stav: props.stav_sil || props.nazev || "neznámý",
                    coordinates: coords,
                    okres: props.nazev_okresu || undefined
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn("[FaktaKHK] Chyba při extrakci mapových prvků ze souboru", nazev, e);
        }
      }
    }

    /* Vrácení strukturovaného výsledku frontendu */
    return Response.json({
      status: aiVysledek.status ?? "Neověřitelné",
      explanation:
        aiVysledek.explanation ?? "Výsledek nelze interpretovat.",
      sourceLink: "https://www.datakhk.cz/dataset/stav-povrchu-silnic-v-khk",
      map_features: map_features.length > 0 ? map_features : undefined,
    });
  } catch (err) {
    console.error("[FaktaKHK] Neočekávaná chyba při volání AI:", err);
    return Response.json(
      { chyba: "Nastala neočekávaná chyba. Zkuste to prosím znovu." },
      { status: 500 }
    );
  }
}
