# External Opportunity Webhook

- Path: `POST /api/webhooks/opportunities`
- Auth: `Authorization: Bearer <API_KEY>`

## Request Body

```json
{
  "prospect": { "name": "Acme Inc", "domains": ["acme.com", "www.acme.io"] },
  "opportunity": {
    "name": "Acme - Enterprise Suite",
    "description": "Initial inbound",
    "amount": 25000,
    "stageId": "<stageId>",
    "stageName": "Qualification",
    "ownerId": "<userId>",
    "createdDate": "2025-10-24"
  }
}
```

Notes:
- Provide either `stageId` or `stageName`.
- Prospect is created if no existing prospect matches any provided domain.
- Domains are normalized (lowercased, strip `www.`) and validated.

## Example

```bash
curl -X POST "$BASE_URL/api/webhooks/opportunities" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prospect": { "name": "Acme Inc", "domains": ["acme.com", "www.acme.io"] },
    "opportunity": {
      "name": "Acme - Enterprise Suite",
      "description": "Initial inbound",
      "amount": 25000,
      "stageName": "Qualification",
      "ownerId": "<userId>",
      "createdDate": "2025-10-24"
    }
  }'
```

---

# API Key Management

All endpoints require an authenticated admin user and are scoped to the user's organization.

- Base path: `/api/api-keys`

## List API keys

GET `/api/api-keys`

Response:
```json
{ "success": true, "data": [ { "_id": "...", "name": "Prod key", "isActive": true, "lastUsedAt": "..." } ] }
```

## Create API key

POST `/api/api-keys`

Body:
```json
{ "name": "My integration" }
```

Response (plaintext key returned once):
```json
{ "success": true, "data": { "_id": "...", "name": "My integration", "isActive": true }, "apiKey": "rk_..." }
```

## Revoke/activate API key

PATCH `/api/api-keys/:id`

Body:
```json
{ "isActive": false }
```

Response:
```json
{ "success": true, "data": { "_id": "...", "name": "...", "isActive": false } }
```

---

# Transcript Ingestion Webhook

- Path: `POST /api/webhooks/transcripts`
- Auth: `Authorization: Bearer <API_KEY>`
- Behavior:
  - Matches an existing calendar activity in your organization by exact start time and title (case-insensitive)
  - Returns 404 if no meeting matches (no new activity is created)
  - Overwrites any existing transcript

## Request Body

```json
{
  "title": "Weekly Sync",
  "startTime": "2025-11-12T09:00:00Z",
  "transcriptionText": "Raw transcript text or JSON/VTT content"
}
```

## Response

```json
{ "success": true, "activityId": "<calendarActivityId>" }
```

Errors:
- 401 Unauthorized: invalid or missing API key
- 400 Bad Request: invalid payload
- 404 Not Found: no meeting matched the time/title
- 500 Server Error

## Example cURL

```bash
curl -X POST "$BASE_URL/api/webhooks/transcripts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly Sync",
    "startTime": "2025-11-12T09:00:00Z",
    "transcriptionText": "..."
  }'
```
