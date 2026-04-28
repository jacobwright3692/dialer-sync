export function startScheduler({ config, logger, run }) {
  logger.info("scheduler_started", {
    timezone: config.timezone,
    scheduleTimes: config.scheduleTimes,
    days: "Monday-Saturday"
  });

  let running = false;

  async function runSafely(scheduledFor) {
    if (running) {
      logger.warn("sync_skipped_previous_run_still_active", {
        scheduledFor: scheduledFor.toISOString()
      });
      return;
    }

    running = true;
    try {
      await run(scheduledFor);
    } catch (error) {
      logger.error("sync_unhandled_error", { error: error.message });
    } finally {
      running = false;
      scheduleNext();
    }
  }

  function scheduleNext() {
    const nextRun = getNextRunDate(new Date(), config.scheduleTimes);
    const delayMs = nextRun.getTime() - Date.now();
    logger.info("next_run_scheduled", { scheduledFor: nextRun.toISOString() });
    setTimeout(() => runSafely(nextRun), delayMs);
  }

  if (config.runOnStart) {
    runSafely(new Date());
  } else {
    scheduleNext();
  }
}

export function getNextRunDate(now, scheduleTimes) {
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const candidateDate = new Date(now);
    candidateDate.setDate(now.getDate() + dayOffset);

    if (candidateDate.getDay() === 0) {
      continue;
    }

    for (const time of scheduleTimes) {
      const [hours, minutes] = time.split(":").map(Number);
      const candidate = new Date(candidateDate);
      candidate.setHours(hours, minutes, 0, 0);

      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    }
  }

  throw new Error("Unable to calculate next scheduled run.");
}
