import fs from "node:fs";
import path from "node:path";

loadDotEnv();

const DEFAULT_SCHEDULE_TIMES = ["10:00", "13:00", "17:00"];

export function getConfig() {
  const dialerWorkflowId = readEnv("DIALER_WORKFLOW_ID", readEnv("GHL_MANUAL_CALL_WORKFLOW_ID", ""));
  const config = {
    apiBaseUrl: trimTrailingSlash(readEnv("GHL_API_BASE_URL", "https://services.leadconnectorhq.com")),
    apiToken: readRequiredEnv("GHL_API_TOKEN"),
    apiVersion: readEnv("GHL_API_VERSION", "2023-02-21"),
    locationId: readRequiredEnv("GHL_LOCATION_ID"),
    pipelineId: readRequiredEnv("PIPELINE_ID"),
    stageId: readRequiredEnv("ATTEMPTING_CONTACT_STAGE_ID"),
    dialerWorkflowId,
    queueMode: dialerWorkflowId ? "workflow" : "task",
    dedupeTagPrefix: readEnv("DIALER_DEDUPE_TAG_PREFIX", "dialer_added_today"),
    taskTitle: readEnv("GHL_TASK_TITLE", "Manual call - Attempting Contact"),
    taskBody: readEnv("GHL_TASK_BODY", "Queued from Attempting Contact deal board stage."),
    taskDueMinutes: Number.parseInt(readEnv("GHL_TASK_DUE_MINUTES", "0"), 10),
    taskAssignedTo: readEnv("GHL_TASK_ASSIGNED_TO", ""),
    pageLimit: Number.parseInt(readEnv("GHL_PAGE_LIMIT", "100"), 10),
    timezone: readEnv("LOCAL_TIMEZONE", "America/Indiana/Indianapolis"),
    scheduleTimes: parseScheduleTimes(readEnv("SCHEDULE_TIMES", DEFAULT_SCHEDULE_TIMES.join(","))),
    runOnStart: readEnv("RUN_ON_START", "false").toLowerCase() === "true"
  };

  if (!Number.isInteger(config.pageLimit) || config.pageLimit < 1 || config.pageLimit > 100) {
    throw new Error("GHL_PAGE_LIMIT must be an integer between 1 and 100.");
  }

  if (!Number.isFinite(config.taskDueMinutes) || config.taskDueMinutes < 0) {
    throw new Error("GHL_TASK_DUE_MINUTES must be 0 or greater.");
  }

  return config;
}

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripQuotes(trimmed.slice(separatorIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseScheduleTimes(value) {
  const times = value.split(",").map((time) => time.trim()).filter(Boolean);
  const invalid = times.find((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  if (invalid) {
    throw new Error(`Invalid SCHEDULE_TIMES entry: ${invalid}. Expected HH:mm in 24-hour time.`);
  }

  return times.length > 0 ? times : DEFAULT_SCHEDULE_TIMES;
}

function readRequiredEnv(name) {
  const value = readEnv(name, "");
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readEnv(name, fallback) {
  return (process.env[name] ?? fallback).trim();
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
