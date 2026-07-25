import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-xs font-medium tracking-wide text-faint uppercase">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">Nicht gefunden</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Diese Analyse existiert nicht mehr oder wurde nie erstellt. Möglicherweise wurde sie
        gelöscht oder der lokale Datastore geleert.
      </p>
      <div className="mt-6 flex gap-3">
        <ButtonLink href="/" variant="primary" size="sm">
          Zum Dashboard
        </ButtonLink>
        <ButtonLink href="/research" size="sm">
          Neue Recherche
        </ButtonLink>
      </div>
    </div>
  );
}
