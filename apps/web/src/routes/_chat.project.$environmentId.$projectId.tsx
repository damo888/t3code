import { createFileRoute } from "@tanstack/react-router";

import { ProjectHomePage } from "../components/project-home/ProjectHomePage";
import { projectHomeSearchFromUrl } from "../components/project-home/projectHome.logic";

export const Route = createFileRoute("/_chat/project/$environmentId/$projectId")({
  validateSearch: projectHomeSearchFromUrl,
  component: ProjectHomeRoute,
});

function ProjectHomeRoute() {
  const { environmentId, projectId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <ProjectHomePage environmentId={environmentId} projectId={projectId} tab={tab} />;
}
