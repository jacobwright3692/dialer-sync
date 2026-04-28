import { getConfig } from "./config.js";
import { GhlClient } from "./ghlClient.js";
import { createLogger } from "./logger.js";

const config = getConfig();
process.env.TZ = config.timezone;

const logger = createLogger();
const client = new GhlClient(config, logger);

logger.info("verify_matching_started", {
  mode: "read_only",
  mutationsBlocked: true,
  workflowEnrollmentBlocked: true,
  tagUpdatesBlocked: true,
  locationId: config.locationId,
  pipelineId: config.pipelineId,
  stageId: config.stageId
});

try {
  const result = await client.searchAttemptingContactOpportunities();
  logger.info("verify_matching_finished", {
    totalOpportunitiesFetched: result.returnedCount,
    matchingCount: result.opportunities.length,
    matchingCountGreaterThanZero: result.opportunities.length > 0,
    firstMatchingOpportunityId: result.opportunities[0]?.id ?? null
  });
} catch (error) {
  logger.error("verify_matching_failed", { error: error.message });
  process.exitCode = 1;
}
