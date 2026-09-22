/**
 * AWS Lambda entrypoints for MedAgentX.
 *
 * This file is intentionally thin: each exported handler maps the AWS event to
 * the same agent functions used by the local Express server, so behaviour is
 * identical between the local MVP and the serverless deployment.
 *
 * In a real deployment `src/backend` is bundled into the Lambda package and the
 * SQLite data access layer (src/backend/src/db.js) is swapped for DynamoDB
 * repositories keyed by TABLE_PREFIX. The agent logic itself is unchanged.
 *
 * Mapping:
 *   coordinator        <- POST /emergency/chat            (starts Step Functions)
 *   triage             <- Step Functions Triage state
 *   bedAllocation      <- Step Functions AllocateBed state
 *   doctorAssignment   <- Step Functions AssignDoctor state
 *   notification       <- Step Functions NotifyStaff state (SNS/SES)
 *   admission          <- Step Functions Admission state
 *   api                <- API Gateway proxy (Express app)
 */

import serverless from 'serverless-http';

export async function coordinator(event) {
  const { main } = await import('../../backend/src/agents/coordinatorAgent.js');
  const body = parseBody(event);
  const result = await main.handleEmergencyChat({ conversation: body.conversation, actor: null });
  return response(201, result);
}

export async function triage(event) {
  const { runTriageAgent } = await import('../../backend/src/agents/triageAgent.js');
  const result = await runTriageAgent(event.conversation || []);
  return result;
}

export async function bedAllocation(event) {
  const { runBedAllocationAgent } = await import('../../backend/src/agents/bedAllocationAgent.js');
  return runBedAllocationAgent({
    triage: event.triage,
    emergencyId: event.emergencyId,
    actor: event.actor || null,
  });
}

export async function doctorAssignment(event) {
  const { runDoctorAssignmentAgent } = await import('../../backend/src/agents/doctorAssignmentAgent.js');
  return runDoctorAssignmentAgent({
    triage: event.triage,
    emergencyId: event.emergencyId,
    actor: event.actor || null,
  });
}

export async function notification(event) {
  const { runNotificationAgent } = await import('../../backend/src/agents/notificationAgent.js');
  // In production this publishes to SNS topic EMERGENCY_TOPIC_ARN and sends SES email.
  return runNotificationAgent(event);
}

export async function admission(event) {
  const { runAdmissionAgent } = await import('../../backend/src/agents/admissionAgent.js');
  return runAdmissionAgent({
    emergencyId: event.emergencyId,
    details: event.details || {},
    actor: event.actor || null,
  });
}

/** API Gateway proxy -> existing Express app (serverless-http). */
const appModule = await import('../../backend/src/app.js');
const handler = serverless(appModule.default);
export async function api(event, context) {
  return handler(event, context);
}

function parseBody(event) {
  if (!event?.body) return {};
  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return {};
  }
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
