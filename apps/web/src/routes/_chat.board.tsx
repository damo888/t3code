import { createFileRoute } from "@tanstack/react-router";

import { MissionBoardPage } from "../components/board/MissionBoardPage";

export const Route = createFileRoute("/_chat/board")({
  component: MissionBoardPage,
});
