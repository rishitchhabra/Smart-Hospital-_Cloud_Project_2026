/**
 * Seed the MedAgentX DynamoDB tables with hospital master data.
 *
 * IMPORTANT: Patients, admissions, prescriptions and appointments are
 * intentionally NOT seeded. They are created only through the emergency
 * workflow at runtime.
 *
 * Usage (after `sam deploy`):
 *   TABLE_PREFIX=MedAgentX AWS_REGION=us-east-1 node seed-dynamo.mjs
 *
 * Requires @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb.
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import {
  DEPARTMENTS, WARDS, BEDS, DOCTORS, STAFF, MEDICINES, USERS,
} from '../backend/src/seed.js';

const PREFIX = process.env.TABLE_PREFIX || 'MedAgentX';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region: REGION });
const doc = DynamoDBDocumentClient.from(client);

const T = (name) => `${PREFIX}-${name}`;

async function ensureTable(TableName, extra = {}) {
  try {
    await client.send(new DescribeTableCommand({ TableName }));
    return;
  } catch { /* create below */ }
  await client.send(new CreateTableCommand({
    TableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    ...extra,
  }));
}

async function isEmpty(TableName) {
  const res = await doc.send(new ScanCommand({ TableName, Limit: 1 }));
  return (res.Items || []).length === 0;
}

async function putAll(TableName, items, mapper = (x) => x) {
  if (!(await isEmpty(TableName))) {
    console.log(`${TableName}: already populated, skipping`);
    return;
  }
  for (const item of items) {
    await doc.send(new PutCommand({ TableName, Item: mapper(item) }));
  }
  console.log(`${TableName}: seeded ${items.length} items`);
}

let bedSeq = 1;
function bedRecord(b) {
  const id = `BED-${String(bedSeq).padStart(3, '0')}`;
  bedSeq += 1;
  return { id, ward_id: b.ward_id, bed_number: b.bed_number, bed_type: b.bed_type, status: b.status };
}

async function main() {
  await ensureTable(T('Departments'));
  await ensureTable(T('Wards'));
  await ensureTable(T('Beds'), {
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'ward_id', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [{
      IndexName: 'ward-status-index',
      KeySchema: [
        { AttributeName: 'ward_id', KeyType: 'HASH' },
        { AttributeName: 'status', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    }],
  });
  await ensureTable(T('Doctors'));
  await ensureTable(T('Staff'));
  await ensureTable(T('Medicines'));
  await ensureTable(T('Users'));

  await putAll(T('Departments'), DEPARTMENTS);
  await putAll(T('Wards'), WARDS);
  await putAll(T('Beds'), BEDS, bedRecord);
  await putAll(T('Doctors'), DOCTORS);
  await putAll(T('Staff'), STAFF);
  await putAll(T('Medicines'), MEDICINES);
  // Users require hashed passwords; the local seed script handles that.
  await putAll(T('Users'), USERS, (u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    name: u.name,
    email: u.email,
    phone: u.phone,
    doctor_id: u.doctor_id || null,
    staff_id: u.staff_id || null,
    active: true,
    note: 'password hashes must be provisioned via Cognito',
  }));

  console.log('\nMaster data seeded. No patients/prescriptions/admissions created.');
  console.log('Session id:', randomUUID());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
