// The racer's screen at /join, once the code belongs to an Online Race: join,
// wait in the lobby, race, see the result. No account, no shop, no garage.

import { startShell } from "./shell.js";

startShell(
  {
    join: () => import("./online/join-form.js"),
    "online-lobby": () => import("./online/lobby.js"),
    race: () => import("./race/race-screen.js")
  },
  "join"
);
