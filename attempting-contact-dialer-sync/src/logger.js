export function createLogger() {
  return {
    info(message, data = {}) {
      writeLog("info", message, data);
    },
    warn(message, data = {}) {
      writeLog("warn", message, data);
    },
    error(message, data = {}) {
      writeLog("error", message, data);
    }
  };
}

function writeLog(level, message, data) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}
