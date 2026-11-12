// Math Race Champions: one game, three experiences. Every screen is loaded on
// demand, so opening Classroom Competition never downloads the 3D racing code,
// the car shop or the online room code.

import { startShell } from "./shell.js";

startShell(
  {
    hub: () => import("./hub.js"),
    "how-to": () => import("./how-to.js"),
    progress: () => import("./progress.js"),
    "classroom-setup": () => import("./classroom/setup.js"),
    classroom: () => import("./classroom/classroom.js"),
    computer: () => import("./computer/stages.js"),
    garage: () => import("./computer/garage.js"),
    online: () => import("./online/create.js"),
    "online-lobby": () => import("./online/lobby.js"),
    race: () => import("./race/race-screen.js")
  },
  "hub"
);
