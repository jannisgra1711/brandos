import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Im Testlauf interessiert nur, was fehlschlägt. Die Info- und Warn-Ausgaben
// der Provider-Schicht würden die Testergebnisse sonst überdecken.
// Über die Umgebungsvariable weiterhin übersteuerbar.
process.env.BRANDOS_LOG_LEVEL ??= "error";

register("./alias-hooks.mjs", pathToFileURL(import.meta.filename));
