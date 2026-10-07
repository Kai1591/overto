import { NextRequest } from "next/server";

/**
 * POST /api/followup
 *
 * Přijímá JSON tělo:
 * {
 *   originalQuery: string,     // původní dotaz uživatele
 *   originalAnswer: string,    // původní odpověď AI
 *   originalStatus: string,    // původní verdikt (Pravda/Nepravda/...)
 *   tema: string,              // téma pro kontext
 *   followUpQuestion: string,  // nová doplňující otázka
 * }
 */
export async function POST(request: NextRequest) {
  let originalQuery: string;
  let originalAnswer: string;
  let originalStatus: string;
  let tema: string;
  let followUpQuestion: string;

  try {
    const telo = await request.json();
    originalQuery = String(telo.originalQuery ?? "").trim();
    originalAnswer = String(telo.originalAnswer ?? "").trim();
    originalStatus = String(telo.originalStatus ?? "").trim();
    tema = String(telo.tema ?? "").trim();
    followUpQuestion = String(telo.followUpQuestion ?? "").trim();
  } catch {
    return Response.json(
      { chyba: "Neplatný formát požadavku." },
      { status: 400 }
    );
  }

  if (!followUpQuestion || !originalAnswer) {
    return Response.json(
      { chyba: "Chybí povinné parametry." },
      { status: 400 }
    );
  }

  if (followUpQuestion.length > 500) {
    return Response.json(
      { chyba: "Otázka je příliš dlouhá. Maximálně 500 znaků." },
      { status: 400 }
    );
  }

  const apiKlic = process.env.GOOGLE_API_KEY;
  if (!apiKlic) {
    return Response.json(
      { chyba: "API klíč není nakonfigurován." },
      { status: 500 }
    );
  }

  const systemPrompt = `Jsi specializovaný datový analytik pro Královéhradecký kraj.
Uživatel se tě ptá na doplňující otázku k analýze, kterou jsi právě provedl.

PŮVODNÍ DOTAZ UŽIVATELE: "${originalQuery}"
TVŮJ PŮVODNÍ VERDIKT: ${originalStatus}
TVOJE PŮVODNÍ ODPOVĚĎ: "${originalAnswer}"
TÉMA: ${tema}

Odpověz na doplňující otázku stručně a jasně (2–4 věty) v češtině.
Opři se o kontext původní analýzy. Pokud otázka jde mimo rámec dat, upřímně to řekni.
Odpověz jako prostý text – zcela bez formátování, bez markdownu, a nepoužívej žádné hvězdičky (*) pro odrážky nebo tučné písmo.`;

  const geminiTelo = JSON.stringify({
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: `Doplňující otázka: "${followUpQuestion}"` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  });

  try {
    const kontroler = new AbortController();
    const casovac = setTimeout(() => kontroler.abort(), 20_000);

    let geminiOdpoved: Response;
    try {
      geminiOdpoved = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKlic}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: geminiTelo,
          signal: kontroler.signal,
        }
      );
    } finally {
      clearTimeout(casovac);
    }

    if (!geminiOdpoved!.ok) {
      return Response.json(
        { chyba: "AI služba momentálně nedostupná. Zkuste to znovu." },
        { status: 502 }
      );
    }

    const geminiData = await geminiOdpoved!.json();
    const odpoved: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!odpoved) {
      return Response.json(
        { chyba: "AI nevrátila žádnou odpověď." },
        { status: 502 }
      );
    }

    return Response.json({ answer: odpoved.trim() });
  } catch (err) {
    const jeTimeout =
      err instanceof DOMException && err.name === "AbortError";
    return Response.json(
      {
        chyba: jeTimeout
          ? "AI neodpověděla včas. Zkuste to znovu."
          : "Nastala neočekávaná chyba.",
      },
      { status: 502 }
    );
  }
}
