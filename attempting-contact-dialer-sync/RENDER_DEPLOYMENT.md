# Render Deployment

Deploy this project as a Render Background Worker so the scheduler stays running without a local computer.

## Service

- Service type: `Background Worker`
- Runtime: `Node`
- Root directory: `attempting-contact-dialer-sync` if your Git repo contains this project as a subfolder
- Build command: `npm install`
- Start command: `npm start`

`npm start` runs `node src/index.js`, which starts the existing scheduler.

## Schedule

Keep these environment variables:

```env
LOCAL_TIMEZONE=America/Indiana/Indianapolis
SCHEDULE_TIMES=10:00,13:00,17:00
RUN_ON_START=false
```

The app scheduler runs Monday through Saturday and skips Sunday.

## Environment Variables

Add these in Render under the worker's Environment tab. Do not commit `.env`.

Required:

```env
GHL_API_TOKEN=
GHL_LOCATION_ID=
PIPELINE_ID=
ATTEMPTING_CONTACT_STAGE_ID=
DIALER_WORKFLOW_ID=
```

Current verified pipeline/stage values:

```env
PIPELINE_ID=WEdCzgaatRxzYuIugmjJ
ATTEMPTING_CONTACT_STAGE_ID=1963a146-d2c9-46d0-860f-f6960f8a8765
```

Recommended defaults:

```env
DIALER_DEDUPE_TAG_PREFIX=dialer_added_today
LOCAL_TIMEZONE=America/Indiana/Indianapolis
SCHEDULE_TIMES=10:00,13:00,17:00
RUN_ON_START=false
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2023-02-21
GHL_PAGE_LIMIT=100
```

Optional task fallback variables, only used if `DIALER_WORKFLOW_ID` is empty:

```env
GHL_TASK_TITLE=Manual call - Attempting Contact
GHL_TASK_BODY=Queued from Attempting Contact deal board stage.
GHL_TASK_DUE_MINUTES=0
GHL_TASK_ASSIGNED_TO=
```

## Deploy Steps

1. Push the project to GitHub without committing `.env`.
2. In Render, create a new `Background Worker`.
3. Connect the GitHub repo.
4. Set root directory to `attempting-contact-dialer-sync` if needed.
5. Set build command to `npm install`.
6. Set start command to `npm start`.
7. Add the environment variables above, or use Render's `Add from .env` option and review them before saving.
8. Deploy.

## Verify

After deploy, open the worker logs. You should see:

```text
scheduler_started
next_run_scheduled
```

At 10:00, 13:00, and 17:00 local time Monday through Saturday, the logs should show a normal `sync_started` and `sync_finished` run.

For a read-only match check before enabling the worker, run locally:

```bash
npm run verify-matching
```
