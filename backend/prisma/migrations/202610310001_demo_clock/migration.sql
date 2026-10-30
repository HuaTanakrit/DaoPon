CREATE TABLE "replay_settings" (
  "id" INTEGER NOT NULL PRIMARY KEY CHECK ("id" = 1),
  "replayAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
