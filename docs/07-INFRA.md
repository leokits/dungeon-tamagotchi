# Infrastructure

## Guiding Principle: Zero Cost When Idle

This is a hobby project. Everything must scale to zero when not in use.

## Supabase (Free Tier)

### What We Use
- **PostgreSQL** — main database
- **Auth** — Google OAuth + magic link
- **Realtime** — live tile/pet updates pushed to client
- **Row-Level Security** — fine-grained access control
- **Storage** (optional, future) — sprite uploads if we ever need UGC

### Free Tier Limits
- 500 MB database
- 50,000 monthly active users
- 2 GB bandwidth
- 1 GB file storage
- 2 million Realtime messages/month

These limits are more than sufficient for a hobby project.

### Supabase Client Setup

Two clients:
1. **Browser client** (`@supabase/ssr`) — uses session cookies, respects RLS
2. **Service role client** — used in `/api/tick`, bypasses RLS

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TICK_SECRET=some-random-secret
```

## Cloud Run

### Configuration
```yaml
service: dungeon-tamagotchi
region: us-central1  # or closest to player base
min-instances: 0     # CRITICAL: scale to zero
max-instances: 3     # cap costs
cpu: 1
memory: 512Mi
timeout: 300s        # 5 min for tick processing
concurrency: 80
```

### Cold Start Mitigation
- Cloud Run cold start: ~2-5 seconds for Node.js
- Acceptable for a hobby game
- First request after idle triggers cold start
- Subsequent requests are fast while instance is warm
- Instance stays warm for ~15 minutes after last request

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
```

## Cloud Scheduler

Triggers the `/api/tick` endpoint every 5 minutes.

### Configuration
```yaml
name: dungeon-tick
schedule: "*/5 * * * *"
time_zone: "UTC"
http_target:
  uri: "https://dungeon-tamagotchi-xxxxx-uc.a.run.app/api/tick"
  http_method: POST
  headers:
    X-Tick-Secret: "${TICK_SECRET}"
  oidc_token:
    service_account_email: "scheduler-sa@project.iam.gserviceaccount.com"
```

### Cost
- Cloud Scheduler: 3 free jobs per account
- 1 job running every 5 min = well within free tier

### Tick Endpoint Protection
- Validates `X-Tick-Secret` header matches env var
- Optionally validates OIDC token from Cloud Scheduler service account
- Returns 401 if unauthorized

## CI/CD Pipeline

### GitHub → Cloud Build → Cloud Run

```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'us-central1-docker.pkg.dev/$PROJECT_ID/dungeon/app:$COMMIT_SHA', '.']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/$PROJECT_ID/dungeon/app:$COMMIT_SHA']

  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'dungeon-tamagotchi'
      - '--image'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/dungeon/app:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--min-instances'
      - '0'
      - '--max-instances'
      - '3'
```

### Trigger
- Push to `main` branch triggers build
- Can also trigger manually via Cloud Console

## Cost Estimate (Hobby Scale)

| Service          | Usage                | Cost     |
| ---------------- | -------------------- | -------- |
| Supabase         | Free tier            | $0       |
| Cloud Run        | ~0-5 hrs/month       | $0       |
| Cloud Scheduler  | 1 job                | $0       |
| Cloud Build      | 120 min/day free     | $0       |
| Artifact Registry| Minimal storage      | ~$0.01   |
| **Total**        |                      | **~$0**  |

## Environment Variables

```env
# .env.local (local dev)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TICK_SECRET=local-dev-secret

# Cloud Run (set via gcloud or Cloud Console)
# Same variables as above, with production values
```

## Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Simulate tick locally
curl -X POST http://localhost:3000/api/tick \
  -H "X-Tick-Secret: local-dev-secret"
```

For local dev, Supabase can run locally via `supabase start` (Docker) or connect to a remote Supabase project.

## Database Migrations

Store migration SQL files in `supabase/migrations/`:

```
supabase/
├── migrations/
│   ├── 20240101000000_initial_schema.sql
│   ├── 20240101000001_rls_policies.sql
│   └── ...
└── config.toml
```

Apply with: `supabase db push` or `supabase migration up`
