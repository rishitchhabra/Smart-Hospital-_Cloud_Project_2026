# MedAgentX — Serverless / AWS deployment

The MVP runs locally with an Express API + SQLite so it is instantly demoable.
This folder contains the serverless reference architecture that the local code
maps onto, so the same agents can run on AWS without changing business logic.

## Service mapping

| Requirement              | AWS service                                  | Local equivalent                                  |
| ------------------------ | -------------------------------------------- | ------------------------------------------------- |
| Frontend                 | React/Vite → S3 + CloudFront                  | `src/frontend` (Vite dev server)                  |
| APIs                     | API Gateway → Lambda                         | Express in `src/backend/src/app.js`               |
| Backend functions/agents | AWS Lambda                                    | `src/backend/src/agents/*`                        |
| Workflow orchestration   | AWS Step Functions                            | `src/backend/src/agents/coordinatorAgent.js`      |
| AI agents / LLM          | Amazon Bedrock (Claude)                       | Rule engine + optional OpenAI in `triageAgent.js` |
| Data                     | DynamoDB                                      | SQLite (`src/backend/src/db.js`)                  |
| Events / alerts          | EventBridge + SQS                             | `alerts` table + polling in the UI                |
| Auth                     | Cognito (JWT, role claims)                    | JWT (`src/backend/src/auth.js`)                   |
| Monitoring               | CloudWatch                                    | `activity_logs` table + console logs              |
| Notifications            | SNS / SES                                     | `notificationAgent.js` (`alerts` rows)            |

## Step Functions state machine

`statemachine/emergency-workflow.asl.json` implements:

```
Triage → AllocateBed → AssignDoctor → NotifyStaff → WaitForArrival → Admission → Succeed
```

- `Triage`, `AllocateBed`, `AssignDoctor`, `NotifyStaff`, `Admission` invoke the
  corresponding Lambda in `lambda/handler.mjs`.
- `WaitForArrival` uses a task token; the ward "Mark patient arrived" action in
  the UI would call `SendTaskSuccess`, resuming the workflow into admission.
- Each task has retries; bed/doctor steps degrade gracefully if no bed/doctor is
  available so the emergency is still created and staff alerted.

## Deploy

```bash
# prerequisites: AWS SAM CLI, AWS credentials, Node 20+
cd src/aws
sam build
sam deploy --guided
```

Outputs include the API URL, Cognito pool/client IDs, CloudFront URL, the state
machine ARN and the SNS topic ARN.

## Frontend deployment

```bash
cd src/frontend
npm run build          # -> dist/
aws s3 sync dist/ s3://<WebBucket>/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

Set the API base URL via a reverse proxy/CloudFront behavior or an env var at
build time.

## Notes on parity

- `lambda/handler.mjs` imports the very same agent modules the local server uses.
- To go fully serverless, replace `src/backend/src/db.js` with DynamoDB
  repositories. The schema and access patterns are modelled by the tables and
  GSIs in `template.yaml` (`ward-status-index`, `specialization-index`, etc.).
- `seed-dynamo.mjs` recreates the hospital master data (no patients) in
  DynamoDB for a fresh environment.
