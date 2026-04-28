import { getConfig } from "./config.js";
import { GhlClient } from "./ghlClient.js";
import { createLogger } from "./logger.js";
import { startScheduler } from "./scheduler.js";
import { runSync } from "./sync.js";

const config = getConfig();
process.env.TZ = config.timezone;

const logger = createLogger();
const client = new GhlClient(config, logger);

startScheduler({
  config,
  logger,
  run: (scheduledFor) => runSync({ client, logger, scheduledFor })
});
