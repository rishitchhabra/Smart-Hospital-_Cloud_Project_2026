import { all, get, run, tx } from '../db.js';
import { nowIso, logActivity } from '../utils.js';

/**
 * Bed Allocation Agent
 * Finds and atomically reserves the most suitable available bed.
 *
 * Allocation policy (MVP):
 *  1. Massively critical (triageLevel 1) or high-acuity categories -> ICU first,
 *     then Emergency Ward.
 *  2. Everyone else -> Emergency Ward first, then the hinted ward, then General.
 *  3. If no bed is available, fail gracefully with a clear reason so the
 *     coordinator can still create the emergency and alert staff.
 */

function planWardOrder(triage) {
  const { triageLevel, category, wardHint } = triage;
  const order = [];
  const add = (t) => {
    if (t && !order.includes(t)) order.push(t);
  };

  const highAcuity = triageLevel <= 1 || category === 'neuro';
  if (highAcuity) {
    add('icu');
    add('emergency');
  } else {
    add('emergency');
    add(wardHint);
    if (wardHint !== 'icu') add('general');
  }
  add('cardiology');
  add('pediatric');
  add('general');
  return order;
}

export function findAvailableBed(triage) {
  const order = planWardOrder(triage);
  for (const wardType of order) {
    const bed = get(
      `SELECT b.*, w.name AS ward_name, w.type AS ward_type
         FROM beds b JOIN wards w ON w.id = b.ward_id
        WHERE w.type = ? AND b.status = 'available'
        ORDER BY b.bed_number ASC
        LIMIT 1`,
      wardType
    );
    if (bed) return bed;
  }
  return null;
}

export function runBedAllocationAgent({ triage, emergencyId, actor }) {
  const committed = tx(() => {
    const order = planWardOrder(triage);
    for (const wardType of order) {
      const bed = get(
        `SELECT b.*, w.name AS ward_name, w.type AS ward_type
           FROM beds b JOIN wards w ON w.id = b.ward_id
          WHERE w.type = ? AND b.status = 'available'
          ORDER BY b.bed_number ASC
          LIMIT 1`,
        wardType
      );
      if (!bed) continue;

      const claimed = run(
        `UPDATE beds SET status = 'reserved', current_emergency_id = ?, updated_at = ?
          WHERE id = ? AND status = 'available'`,
        emergencyId,
        nowIso(),
        bed.id
      );
      if (claimed.changes === 1) {
        return get(
          `SELECT b.*, w.name AS ward_name, w.type AS ward_type
             FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id = ?`,
          bed.id
        );
      }
    }
    return null;
  });

  if (!committed) {
    logActivity({
      actorUserId: actor?.id,
      actorRole: actor?.role,
      action: 'BED_ALLOCATION_FAILED',
      entity: 'emergency',
      entityId: emergencyId,
      details: { reason: 'No available bed', policy: planWardOrder(triage) },
    });
    return { agent: 'BedAllocationAgent', allocated: false, reason: 'No emergency bed currently available' };
  }

  logActivity({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'BED_RESERVED',
    entity: 'bed',
    entityId: committed.id,
    details: { emergencyId, ward: committed.ward_name, bed: committed.bed_number },
  });

  return {
    agent: 'BedAllocationAgent',
    allocated: true,
    bed: committed,
    reason: `Reserved ${committed.ward_name} / ${committed.bed_number}`,
  };
}

export function releaseBed(bedId) {
  if (!bedId) return;
  run(
    `UPDATE beds SET status = 'cleaning', current_emergency_id = NULL, updated_at = ? WHERE id = ?`,
    nowIso(),
    bedId
  );
}

export function bedInventory() {
  return all(
    `SELECT w.id AS ward_id, w.name AS ward_name, w.type AS ward_type,
            SUM(CASE WHEN b.status = 'available' THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
            SUM(CASE WHEN b.status = 'reserved' THEN 1 ELSE 0 END) AS reserved,
            SUM(CASE WHEN b.status IN ('cleaning','maintenance') THEN 1 ELSE 0 END) AS unavailable,
            COUNT(*) AS total
       FROM wards w LEFT JOIN beds b ON b.ward_id = w.id
      GROUP BY w.id
      ORDER BY w.name`
  );
}

export default { runBedAllocationAgent, findAvailableBed, releaseBed, bedInventory };
