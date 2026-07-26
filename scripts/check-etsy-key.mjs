/**
 * Prueft den Etsy-Schluessel gegen `openapi-ping`.
 *
 * Etsy stellt diesen Endpunkt bereit, um genau eine Frage zu beantworten:
 * Wird dieser Keystring anerkannt? Ein voller Analyselauf beantwortet sie
 * auch, kostet aber Kontingent bei allen anderen Quellen und vergraebt das
 * Ergebnis im Quellenprotokoll.
 *
 * Der Schluessel wird aus `.env.local` gelesen und nie ausgegeben.
 *
 *   node scripts/check-etsy-key.mjs
 */

import { readFile } from "node:fs/promises";

const PING = "https://openapi.etsy.com/v3/application/openapi-ping";

async function readKey() {
  let raw;
  try {
    raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return { error: ".env.local nicht gefunden" };
  }

  const pick = (name) => {
    const match = new RegExp(`^\\s*${name}\\s*=(.*)$`, "m").exec(raw);
    return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
  };

  const keystring = pick("ETSY_API_KEY");
  const secret = pick("ETSY_API_SECRET");

  const missing = [
    keystring ? null : "ETSY_API_KEY",
    secret ? null : "ETSY_API_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    return { error: `Fehlt oder leer in .env.local: ${missing.join(", ")}` };
  }

  // Etsy erwartet beide Werte in einem Header, durch Doppelpunkt getrennt.
  return { key: `${keystring}:${secret}`, keystring, secret };
}

const { key, keystring, secret, error } = await readKey();

if (error) {
  console.error(`✖ ${error}`);
  // Hier laeuft noch kein Timer – ein harter Abbruch ist unbedenklich und
  // verhindert, dass der Rest des Skripts auf einen fehlenden Key zugreift.
  process.exit(1);
}

console.log(
  `Beide Werte gefunden (Keystring ${keystring.length} Zeichen, Secret ${secret.length}). Frage Etsy…`,
);

let response;
try {
  response = await fetch(PING, {
    headers: { accept: "application/json", "x-api-key": key },
    signal: AbortSignal.timeout(15_000),
  });
} catch (cause) {
  console.error(`✖ Etsy nicht erreichbar: ${cause instanceof Error ? cause.message : cause}`);
  process.exit(1);
}

const body = await response.text();

if (response.ok) {
  console.log(`✔ Schluessel wird anerkannt. Antwort: ${body.slice(0, 200)}`);
  console.log("  Dev-Server neu starten, damit .env.local neu gelesen wird.");
} else {
  console.error(`✖ Etsy lehnt ab: HTTP ${response.status}${body ? ` – ${body.slice(0, 200)}` : " (leerer Rumpf)"}`);

  // Etsys Meldungen unterscheiden die Faelle praezise – deshalb werden sie
  // hier uebersetzt statt zusammengefasst.
  console.error("");
  if (/format 'keystring:shared_secret'/i.test(body)) {
    console.error("  Der zusammengesetzte Wert hat die falsche Form. Erwartet wird");
    console.error("  keystring:shared_secret, genau ein Doppelpunkt, keine Leerzeichen.");
  } else if (/shared secret is required/i.test(body)) {
    console.error("  Etsy hat die App gefunden, aber kein Secret bekommen –");
    console.error("  ETSY_API_SECRET duerfte leer sein.");
  } else if (/not found|not active|incorrect shared secret/i.test(body)) {
    console.error("  Etsy ordnet die Werte keiner App zu. Entweder passen Keystring");
    console.error("  und Secret nicht zueinander, oder die App ist nicht aktiv.");
  } else {
    console.error("  Beide Werte stehen in .env.local und wurden als");
    console.error("  keystring:shared_secret gesendet.");
  }

  // Kein process.exit(): Der Timer aus AbortSignal.timeout laeuft noch, und
  // ein harter Abbruch laesst libuv unter Windows mit einer Assertion fallen.
  process.exitCode = 1;
}
