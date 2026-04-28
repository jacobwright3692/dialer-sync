export class GhlClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async searchAttemptingContactOpportunities() {
    const opportunities = [];
    let page = 1;

    while (true) {
      const params = new URLSearchParams({
        location_id: this.config.locationId,
        status: "open",
        limit: String(this.config.pageLimit),
        page: String(page)
      });

      const data = await this.request(`/opportunities/search?${params.toString()}`);
      const pageOpportunities = normalizeArray(data, ["opportunities", "items", "data"]);
      opportunities.push(...pageOpportunities);

      if (pageOpportunities.length < this.config.pageLimit) {
        break;
      }

      page += 1;
    }

    this.logOpportunityDebugSample(opportunities);

    const matchingOpportunities = opportunities.filter((opportunity, index) => {
      const matchResult = getOpportunityMatchResult(opportunity, this.config);

      if (index < 3) {
        this.logger.info("debug_opportunity_filter_result", {
          index,
          opportunityId: opportunity.id,
          normalizedPipelineId: matchResult.normalizedPipelineId,
          normalizedExpectedPipelineId: matchResult.normalizedExpectedPipelineId,
          pipelineMatches: matchResult.pipelineMatches,
          normalizedStageId: matchResult.normalizedStageId,
          normalizedExpectedStageId: matchResult.normalizedExpectedStageId,
          stageMatches: matchResult.stageMatches,
          matches: matchResult.matches,
          failedReason: matchResult.matches
            ? undefined
            : getFilterFailedReason(matchResult.pipelineMatches, matchResult.stageMatches)
        });
      }

      if (index === 0) {
        this.logger.info("debug_pipeline_id_characters", {
          opportunityId: opportunity.id,
          normalizedPipelineId: matchResult.normalizedPipelineId,
          normalizedExpectedPipelineId: matchResult.normalizedExpectedPipelineId,
          normalizedPipelineIdLength: matchResult.normalizedPipelineId.length,
          normalizedExpectedPipelineIdLength: matchResult.normalizedExpectedPipelineId.length,
          normalizedPipelineIdCharCodes: Array.from(matchResult.normalizedPipelineId).map((char) => {
            return char.charCodeAt(0);
          }),
          normalizedExpectedPipelineIdCharCodes: Array.from(
            matchResult.normalizedExpectedPipelineId
          ).map((char) => {
            return char.charCodeAt(0);
          }),
          normalizedPipelineIdsEqual:
            matchResult.normalizedPipelineId === matchResult.normalizedExpectedPipelineId
        });
      }

      return matchResult.matches;
    });

    return {
      returnedCount: opportunities.length,
      opportunities: matchingOpportunities
    };
  }

  logOpportunityDebugSample(opportunities) {
    opportunities.slice(0, 3).forEach((opportunity, index) => {
      this.logger.info("debug_opportunity_shape", {
        index,
        opportunityId: opportunity.id,
        opportunityName: opportunity.name ?? opportunity.title ?? opportunity.opportunityName,
        keys: Object.keys(opportunity),
        pipelineId: opportunity.pipelineId,
        pipeline_id: opportunity.pipeline_id,
        pipeline: opportunity.pipeline,
        stageId: opportunity.stageId,
        stage_id: opportunity.stage_id,
        pipelineStageId: opportunity.pipelineStageId,
        pipeline_stage_id: opportunity.pipeline_stage_id,
        status: opportunity.status,
        contactId: opportunity.contactId,
        contact_id: opportunity.contact_id
      });
    });
  }

  async getContact(contactId) {
    const data = await this.request(`/contacts/${encodeURIComponent(contactId)}`);
    return data.contact ?? data;
  }

  async addContactToManualCallQueue(contact) {
    if (this.config.dialerWorkflowId) {
      return this.addContactToManualCallWorkflow(contact.id);
    }

    return this.createCallTask(contact.id);
  }

  async addContactToManualCallWorkflow(contactId) {
    return this.requestWithMeta(
      `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(this.config.dialerWorkflowId)}`,
      { method: "POST" }
    );
  }

  async createCallTask(contactId) {
    const dueDate = new Date(Date.now() + this.config.taskDueMinutes * 60 * 1000).toISOString();
    const body = {
      title: this.config.taskTitle,
      body: this.config.taskBody,
      dueDate,
      completed: false
    };

    if (this.config.taskAssignedTo) {
      body.assignedTo = this.config.taskAssignedTo;
    }

    return this.requestWithMeta(`/contacts/${encodeURIComponent(contactId)}/tasks`, {
      method: "POST",
      body
    });
  }

  async addTagsToContact(contactId, tags) {
    return this.request(`/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: "POST",
      body: { tags }
    });
  }

  async removeTagsFromContact(contactId, tags) {
    return this.request(`/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: "DELETE",
      body: { tags }
    });
  }

  async request(path, options = {}) {
    const result = await this.requestWithMeta(path, options);
    return result.body;
  }

  async requestWithMeta(path, options = {}) {
    const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Version: this.config.apiVersion
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    const data = text ? parseJson(text, path) : {};

    if (!response.ok) {
      const message = data.message || data.error || response.statusText;
      const error = new Error(`GoHighLevel API ${response.status} ${message}`);
      error.status = response.status;
      error.body = data;
      error.path = path;
      throw error;
    }

    return {
      status: response.status,
      body: data
    };
  }
}

function normalizeArray(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  if (Array.isArray(data)) {
    return data;
  }

  return [];
}

function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from GoHighLevel for ${path}: ${error.message}`);
  }
}

function getFilterFailedReason(pipelineMatches, stageMatches) {
  if (!pipelineMatches && !stageMatches) {
    return "pipeline_and_stage_mismatch";
  }

  if (!pipelineMatches) {
    return "pipeline_mismatch";
  }

  return "stage_mismatch";
}

function getOpportunityMatchResult(opportunity, config) {
  const normalizedPipelineId = normalizePipelineId(opportunity.pipelineId);
  const normalizedStageId = String(opportunity.pipelineStageId || "").trim();
  const normalizedExpectedPipelineId = normalizePipelineId(config.pipelineId);
  const normalizedExpectedStageId = String(config.stageId || "").trim();

  const pipelineMatches = normalizedPipelineId === normalizedExpectedPipelineId;
  const stageMatches = normalizedStageId === normalizedExpectedStageId;
  const matches = pipelineMatches && stageMatches;

  return {
    normalizedPipelineId,
    normalizedExpectedPipelineId,
    normalizedStageId,
    normalizedExpectedStageId,
    pipelineMatches,
    stageMatches,
    matches
  };
}

function normalizePipelineId(value) {
  return String(value || "")
    .trim()
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}
