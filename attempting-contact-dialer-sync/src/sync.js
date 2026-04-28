import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { GhlClient } from "./ghlClient.js";
import { createLogger } from "./logger.js";
import { hasValidPhone } from "./phone.js";

export async function runSync({ client, logger, scheduledFor = new Date() }) {
  const runId = createRunId(scheduledFor);
  const runDedupeTag = createRunDedupeTag(
    scheduledFor,
    client.config.timezone,
    client.config.dedupeTagPrefix
  );
  const seenContactIds = new Set();
  const summary = {
    runId,
    opportunitiesFound: 0,
    added: 0,
    skipped: 0,
    failed: 0
  };

  logger.info("sync_started", {
    runId,
    locationId: client.config.locationId,
    pipelineId: client.config.pipelineId,
    stageId: client.config.stageId,
    queueMode: client.config.queueMode,
    runDedupeTag
  });

  let searchResult;
  try {
    searchResult = await client.searchAttemptingContactOpportunities();
  } catch (error) {
    summary.failed += 1;
    logger.error("opportunities_search_failed", {
      runId,
      locationId: client.config.locationId,
      pipelineId: client.config.pipelineId,
      stageId: client.config.stageId,
      error: error.message
    });
    logger.info("sync_finished", summary);
    throw error;
  }

  const opportunities = searchResult.opportunities;
  summary.opportunitiesFound = opportunities.length;
  logger.info("opportunities_found", {
    runId,
    returnedCount: searchResult.returnedCount,
    matchingCount: opportunities.length,
    count: opportunities.length,
    locationId: client.config.locationId,
    pipelineId: client.config.pipelineId,
    stageId: client.config.stageId
  });

  for (const opportunity of opportunities) {
    const opportunityId = opportunity.id;
    const contactId = opportunity.contactId ?? opportunity.contact_id;

    if (!contactId) {
      summary.skipped += 1;
      logger.warn("opportunity_skipped_no_contact", {
        runId,
        opportunityId,
        skippedReason: "missing_contact_id"
      });
      continue;
    }

    if (seenContactIds.has(contactId)) {
      summary.skipped += 1;
      logger.info("contact_skipped_duplicate_in_run", {
        runId,
        contactId,
        opportunityId,
        skippedReason: "duplicate_contact_in_current_run"
      });
      continue;
    }

    seenContactIds.add(contactId);

    try {
      const contact = await client.getContact(contactId);
      const phone = contact.phone ?? contact.phoneNumber ?? contact.phone_number;
      const contactLabel = getContactLabel(contact, contactId);

      logger.info("contact_processing", {
        runId,
        contactId,
        contactName: contactLabel,
        opportunityId,
        runDedupeTag
      });

      if (!hasValidPhone(phone)) {
        summary.skipped += 1;
        logger.warn("contact_skipped_no_valid_phone", {
          runId,
          contactId,
          contactName: contactLabel,
          opportunityId,
          skippedReason: "missing_or_invalid_phone"
        });
        continue;
      }

      const runDedupeTagAlreadyExists = contactHasTag(contact, runDedupeTag);
      logger.info("contact_dedupe_status", {
        runId,
        contactId,
        contactName: contactLabel,
        opportunityId,
        runDedupeTag,
        runDedupeTagAlreadyExists
      });

      if (runDedupeTagAlreadyExists) {
        summary.skipped += 1;
        logger.info("contact_skipped_already_processed_this_run_window", {
          runId,
          contactId,
          contactName: contactLabel,
          opportunityId,
          skippedReason: "run_dedupe_tag_already_present",
          runDedupeTag
        });
        continue;
      }

      logger.info("workflow_enrollment_call_started", {
        runId,
        contactId,
        contactName: contactLabel,
        opportunityId,
        runDedupeTag,
        enrollmentApiCalled: true,
        queueMode: client.config.queueMode,
        workflowId: client.config.dialerWorkflowId || undefined
      });

      const enrollmentResponse = await client.addContactToManualCallQueue({
        ...contact,
        id: contact.id ?? contactId
      });

      logger.info("workflow_enrollment_call_finished", {
        runId,
        contactId,
        contactName: contactLabel,
        opportunityId,
        runDedupeTag,
        enrollmentApiCalled: true,
        enrollmentStatus: enrollmentResponse?.status,
        enrollmentBody: enrollmentResponse?.body,
        finalResult: "added_to_workflow_or_task"
      });

      logger.info("contact_added_to_workflow_or_task", {
        runId,
        contactId,
        contactName: contactLabel,
        opportunityId,
        queueMode: client.config.queueMode,
        workflowId: client.config.dialerWorkflowId || undefined
      });

      await client.addTagsToContact(contactId, [runDedupeTag]);
      logger.info("contact_dedupe_tag_applied", {
        runId,
        contactId,
        contactName: contactLabel,
        opportunityId,
        runDedupeTag
      });

      summary.added += 1;
      logger.info("contact_added_to_manual_call_queue", {
        runId,
        contactId,
        contactName: contactLabel,
        opportunityId,
        queueMode: client.config.queueMode,
        runDedupeTag,
        finalResult: "added"
      });
    } catch (error) {
      summary.failed += 1;
      logger.error("contact_failed", {
        runId,
        contactId,
        opportunityId,
        runDedupeTag,
        finalResult: "failed",
        error: error.message,
        enrollmentStatus: error.status,
        enrollmentBody: error.body,
        failureReason: inferFailureReason(error)
      });
    }
  }

  logger.info("sync_finished", summary);
  return summary;
}

export async function runSyncOnce() {
  const config = getConfig();
  process.env.TZ = config.timezone;

  const logger = createLogger();
  const client = new GhlClient(config, logger);

  try {
    await runSync({ client, logger });
  } catch (error) {
    logger.error("run_once_failed", { error: error.message });
    process.exitCode = 1;
  }
}

function createRunId(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function createRunDedupeTag(date, timezone, prefix) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${prefix}_${values.year}-${values.month}-${values.day}_${values.hour}`;
}

export function contactHasTag(contact, tagName) {
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  return tags.some((tag) => {
    if (typeof tag === "string") {
      return tag === tagName;
    }

    return tag?.name === tagName || tag?.tag === tagName;
  });
}

function getContactLabel(contact, fallbackId) {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return contact.name || contact.fullName || fullName || fallbackId;
}

function inferFailureReason(error) {
  const text = JSON.stringify(error.body ?? error.message ?? "").toLowerCase();
  if (text.includes("workflow") && (text.includes("active") || text.includes("already"))) {
    return "workflow_active_or_reentry_blocked";
  }

  if (text.includes("re-entry") || text.includes("reentry")) {
    return "workflow_reentry_blocked";
  }

  return "api_error";
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await runSyncOnce();
}
