# Attempting Contact Dialer Sync

Small standalone automation that finds GoHighLevel opportunities in the Deal Board stage `Attempting Contact` and queues each linked contact for manual calling.

This project is intentionally separate from the lead webhook/scrubbing flow and the seller-call web app.

## Behavior

- Runs Monday through Saturday at `10:00 AM`, `1:00 PM`, and `5:00 PM` local time.
- Searches only the configured pipeline and `Attempting Contact` stage.
- Fetches each opportunity's linked contact.
- Skips contacts without a valid phone number.
- Dedupes contact IDs within each scheduled run.
- Dedupes across same-day runs with a GoHighLevel contact tag.
- Does not move opportunities.
- Does not change source, assignment, bucket, notes, stages, or existing contact/opportunity fields.
- Logs every added, skipped, and failed contact.

## Setup

```bash
cd attempting-contact-dialer-sync
cp .env.example .env
```

Fill in:

- `GHL_API_TOKEN`
- `GHL_LOCATION_ID`
- `PIPELINE_ID`
- `ATTEMPTING_CONTACT_STAGE_ID`

For the existing power dialer/manual call queue, set:

- `DIALER_WORKFLOW_ID`: the existing workflow that contains the GoHighLevel `Manual Call` action used by the power dialer.

When `DIALER_WORKFLOW_ID` is configured, the sync enrolls contacts with `POST /contacts/:contactId/workflow/:workflowId` so they enter the manual call queue. If `DIALER_WORKFLOW_ID` is empty, the sync falls back to creating a contact task with `POST /contacts/:contactId/tasks`.

The scheduler/API enrollment is the entry point for this automation. The GoHighLevel workflow does not need a native trigger named `Contact Added to Workflow`, and the sync does not depend on one. The target workflow only needs the `Manual Call` action/step configured for the power dialer queue. If GoHighLevel requires a trigger before the workflow can be saved or published, use the least intrusive placeholder trigger available in the GHL UI, but do not rely on that trigger for this automation.

For once-per-day duplicate prevention, the sync applies a daily contact tag after a successful queue add:

```text
dialer_added_today_YYYY-MM-DD
```

Before adding a contact to the workflow or task fallback, it checks for today's tag and skips the contact if the tag is already present. The date uses `LOCAL_TIMEZONE`, so contacts can be processed again the next local day if they are still in `Attempting Contact`.

## Run Once

```bash
npm run run-once
```

This is the same as:

```bash
node src/sync.js
```

## Verify Matching Only

```bash
npm run verify-matching
```

This read-only command calls `/opportunities/search`, runs the same local pipeline/stage matching, and prints match diagnostics. It does not fetch contacts, enroll workflows, create tasks, or apply tags.

## Run Scheduled

```bash
npm start
```

Keep the process alive with your normal process manager, for example `pm2`, `systemd`, or a hosting scheduler.

For Render deployment, see [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md).

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `GHL_API_TOKEN` | yes | Private Integration Token or OAuth access token for the sub-account. |
| `GHL_LOCATION_ID` | yes | Existing GoHighLevel location/account ID. |
| `PIPELINE_ID` | yes | Existing Deal Board pipeline ID. |
| `ATTEMPTING_CONTACT_STAGE_ID` | yes | Existing `Attempting Contact` stage ID. |
| `DIALER_WORKFLOW_ID` | recommended | Existing workflow with a Manual Call action. The sync enrolls contacts by API, without relying on a separate GHL trigger. If empty, task fallback is used. |
| `DIALER_DEDUPE_TAG_PREFIX` | no | Defaults to `dialer_added_today`; actual tag includes the local date. |
| `LOCAL_TIMEZONE` | no | Defaults to `America/Indiana/Indianapolis`. |
| `SCHEDULE_TIMES` | no | Defaults to `10:00,13:00,17:00`. |
| `RUN_ON_START` | no | Set `true` to sync immediately when scheduler starts. |

## Notes

The official HighLevel docs list these relevant API surfaces:

- `GET /opportunities/search`
- `GET /contacts/:contactId`
- `POST /contacts/:contactId/workflow/:workflowId`
- `POST /contacts/:contactId/tasks`

If your account's manual call queue is driven by a specific workflow, set `DIALER_WORKFLOW_ID` so this automation only enrolls the contact into that existing workflow. The automation does not create or modify workflows, and it does not require a separate workflow trigger to start.
