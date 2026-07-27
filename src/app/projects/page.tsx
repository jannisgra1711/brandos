import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { ProjectList, StatusTally } from "@/components/projects/project-list";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/section";
import { listProjects } from "@/server/services/project-service";

export const metadata: Metadata = {
  title: "Vorhaben",
  description: "Produktideen, die weiterverfolgt werden.",
};

export const dynamic = "force-dynamic";

/**
 * Die Werkbank.
 *
 * Anders als die Historie ist das keine Chronik, sondern eine Arbeitsliste:
 * Was zuletzt angefasst wurde, steht oben. Verworfenes erscheint getrennt und
 * nur, wenn es welches gibt – beiseitegelegt heisst nicht gelöscht.
 */
export default async function ProjectsPage() {
  const [active, discarded] = await Promise.all([
    listProjects({ limit: 100 }),
    listProjects({ limit: 50, status: "verworfen" }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Vorhaben"
        title="In Arbeit"
        description="Aus einer Analyse übernommene Produktideen. Zuletzt bearbeitete zuerst."
        action={
          <ButtonLink href="/discovery" variant="secondary" size="sm">
            <Compass size={15} />
            Chancen suchen
          </ButtonLink>
        }
      />

      <Section title="Aktuell" description={undefined}>
        <div className="space-y-3">
          <StatusTally projects={active} />
          <ProjectList
            projects={active}
            emptyAction={
              <ButtonLink href="/research" size="sm">
                Markt untersuchen
              </ButtonLink>
            }
          />
        </div>
      </Section>

      {discarded.length > 0 ? (
        <Section
          title="Verworfen"
          description="Beiseitegelegt, aber nicht gelöscht – jederzeit wieder aufnehmbar."
        >
          <ProjectList projects={discarded} />
        </Section>
      ) : null}
    </div>
  );
}
