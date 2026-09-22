/**
 * Triage Agent
 * Understands the emergency chat and determines urgency, required
 * department/specialization and a concise clinical summary.
 *
 * Deterministic, explainable rules are used by default so the MVP runs with
 * zero external dependencies. If TRIAGE_PROVIDER=openai and OPENAI_API_KEY is
 * set, the agent augments the rules with an LLM. The rule engine always
 * guarantees a safe fallback.
 *
 * The rule engine is intentionally broad: natural-language synonyms are
 * normalised before matching and each category carries weighted clinical terms,
 * so free-text descriptions categorise accurately and not just the suggested
 * quick-start phrases.
 */

/* ----------------------------- Knowledge base ---------------------------- */

const CATEGORY_DEFS = [
  {
    key: 'cardiac',
    departmentName: 'Cardiology',
    specialization: 'Cardiology',
    wardHint: 'cardiology',
    terms: [
      ['cardiac arrest', 15], ['heart attack', 15], ['myocardial infarction', 15],
      ['heart stopped', 15], ['crushing chest', 13], ['chest pain', 11],
      ['chest tightness', 11], ['chest pressure', 10], ['pressure in chest', 10],
      ['chest discomfort', 9], ['angina', 10], ['heart problem', 9],
      ['pain in left arm', 9], ['left arm pain', 9], ['pain in arm', 5],
      ['pain in jaw', 7], ['jaw pain', 7], ['radiating', 5], ['radiates', 5],
      ['palpitations', 8], ['palpitation', 8], ['racing heart', 8],
      ['heart is racing', 8], ['fast heartbeat', 8], ['irregular heartbeat', 8],
      ['slow heartbeat', 7], ['sweating', 3], ['cold sweat', 6],
      ['blue lips', 12], ['shortness of breath', 4],
    ],
  },
  {
    key: 'neuro',
    departmentName: 'Neurology',
    specialization: 'Neurology',
    wardHint: 'icu',
    terms: [
      ['stroke', 16], ['brain stroke', 16], ['paralysis', 14], ['paralysed', 14],
      ['paralyzed', 14], ['slurred speech', 14], ['slurring', 12],
      ['facial droop', 14], ['face droop', 14], ['drooping face', 13],
      ['drooping mouth', 12], ['unable to speak', 12], ['cannot speak', 12],
      ['trouble speaking', 11], ['difficulty speaking', 11],
      ['weakness on one side', 13], ['one side weakness', 13],
      ['left side weakness', 12], ['right side weakness', 12],
      ['numbness', 9], ['tingling', 7], ['pins and needles', 7],
      ['seizure', 14], ['seizures', 14], ['fits', 12], ['fit', 10],
      ['convulsion', 14], ['convulsions', 14], ['unconscious', 15],
      ['unresponsive', 15], ['loss of consciousness', 15], ['blacked out', 12],
      ['not responding', 12], ['coma', 15], ['head injury', 12],
      ['skull', 9], ['severe headache', 10], ['worst headache', 12],
      ['bad headache', 8], ['headache', 6], ['migraine', 8],
      ['confusion', 8], ['confused', 8], ['disoriented', 9],
      ['memory loss', 7], ['blurred vision', 7], ['double vision', 8],
      ['vision loss', 9], ['cannot see', 10], ['tremor', 7], ['shaking', 5],
      ['dizzy', 4], ['vertigo', 6], ['stiff neck', 8], ['balance problem', 7],
    ],
  },
  {
    key: 'trauma_ortho',
    departmentName: 'Orthopedics',
    specialization: 'Orthopedics',
    wardHint: 'emergency',
    terms: [
      ['fracture', 13], ['fractured', 13], ['broken bone', 13], ['broken leg', 13],
      ['broken arm', 13], ['broken wrist', 13], ['broken ankle', 13],
      ['broken hip', 13], ['break in bone', 12], ['dislocation', 12],
      ['dislocated', 12], ['sprain', 9], ['sprained', 9], ['twisted', 8],
      ['accident', 10], ['road accident', 12], ['car accident', 12],
      ['bike accident', 12], ['motorcycle accident', 12], ['fell down', 9],
      ['fell from', 10], ['fall', 8], ['injury', 8], ['injured', 8],
      ['unable to walk', 12], ['cannot walk', 12], ['unable to move', 11],
      ['cannot move', 11], ['cannot bear weight', 11], ['deformed', 11],
      ['back pain', 8], ['severe back pain', 11], ['neck pain', 7],
      ['knee pain', 7], ['shoulder pain', 7], ['hip pain', 8],
      ['ankle pain', 7], ['wrist pain', 7], ['joint pain', 7],
      ['swelling', 5], ['swollen', 5], ['bruise', 4], ['open wound', 8],
      ['deep cut', 8], ['cut', 5], ['wound', 6], ['laceration', 8],
      ['bleeding wound', 9],
    ],
  },
  {
    key: 'surgery',
    departmentName: 'General Surgery',
    specialization: 'General Surgery',
    wardHint: 'emergency',
    terms: [
      ['abdominal pain', 11], ['stomach pain', 11], ['stomach ache', 11],
      ['belly pain', 11], ['tummy pain', 11], ['abdomen pain', 11],
      ['severe stomach', 12], ['appendicitis', 14], ['appendix', 10],
      ['vomiting blood', 14], ['blood in vomit', 14], ['throwing up blood', 14],
      ['blood in stool', 12], ['blood in motion', 12], ['black stools', 10],
      ['internal bleeding', 14], ['stab', 14], ['gunshot', 15],
      ['deep wound', 10], ['blunt trauma', 12], ['hernia', 9],
      ['gallbladder', 9], ['gallstone', 9], ['gall stones', 9],
      ['kidney stone', 9], ['renal colic', 10], ['bowel', 8],
      ['obstruction', 8], ['abscess', 8], ['pus', 6], ['peritonitis', 13],
      ['rigid abdomen', 13], ['guarding', 6], ['severe burn', 12],
      ['burn injury', 10], ['burns on', 9], ['burn on', 9], ['boiling water', 9],
      ['fire burn', 10], ['third degree', 14],
    ],
  },
  {
    key: 'pediatric',
    departmentName: 'Pediatrics',
    specialization: 'Pediatrics',
    wardHint: 'pediatric',
    terms: [
      ['child', 9], ['children', 9], ['kid', 8], ['kids', 8], ['infant', 10],
      ['baby', 10], ['babies', 10], ['newborn', 10], ['neonate', 10],
      ['toddler', 10], ['my son', 10], ['my daughter', 10], ['son', 6],
      ['daughter', 6], ['boy', 5], ['girl', 5], ['grandchild', 8],
      ['school going', 7], ['daycare', 6],
    ],
  },
  {
    key: 'respiratory',
    departmentName: 'General Medicine',
    specialization: 'General Medicine',
    wardHint: 'general',
    terms: [
      ['difficulty breathing', 12], ['breathing difficulty', 12],
      ['trouble breathing', 12], ['cannot breathe', 14], ['cannot breath', 14],
      ['hard to breathe', 12], ['shortness of breath', 11], ['short of breath', 11],
      ['breathless', 11], ['breathlessness', 11], ['wheezing', 11],
      ['wheeze', 11], ['asthma', 11], ['asthma attack', 13], ['pneumonia', 11],
      ['coughing blood', 13], ['cough blood', 13], ['cough', 7], ['coughing', 7],
      ['chest congestion', 8], ['choking', 14], ['suffocating', 13],
      ['low oxygen', 12], ['oxygen level', 9], ['cannot talk', 10],
      ['gasping', 12], ['chest infection', 8], ['covid', 8], ['tb', 5],
    ],
  },
  {
    key: 'general',
    departmentName: 'General Medicine',
    specialization: 'General Medicine',
    wardHint: 'general',
    terms: [
      ['fever', 8], ['high fever', 10], ['temperature', 6], ['chills', 6],
      ['shivering', 5], ['vomiting', 7], ['vomit', 7], ['throwing up', 7],
      ['nausea', 6], ['diarrhea', 9], ['diarrhoea', 9], ['loose motion', 9],
      ['loose motions', 9], ['dehydration', 10], ['dehydrated', 10],
      ['weakness', 6], ['tired', 5], ['fatigue', 5], ['body ache', 6],
      ['body pain', 6], ['muscle pain', 6], ['rash', 6], ['itching', 5],
      ['allergy', 7], ['allergic', 7], ['food poisoning', 11],
      ['infection', 6], ['urinary', 8], ['burning urination', 9],
      ['blood in urine', 11], ['unable to urinate', 12],
      ['flank pain', 9], ['sore throat', 6], ['cold', 5], ['flu', 6],
      ['dizzy', 5], ['dizziness', 5], ['fainting', 8], ['fainted', 9],
      ['light headed', 6], ['ear pain', 5], ['eye pain', 5],
    ],
  },
];

const EMERGENCY_FALLBACK = {
  key: 'emergency',
  departmentName: 'Emergency',
  specialization: 'Emergency Medicine',
  wardHint: 'emergency',
  terms: [
    ['emergency', 6], ['urgent', 5], ['severe pain', 7], ['intense pain', 7],
    ['unbearable pain', 8], ['serious', 5], ['critical', 7], ['pain', 4],
    ['hurt', 4], ['hurts', 4], ['hurting', 4], ['unwell', 3], ['sick', 4],
    ['help', 2], ['bleeding', 6], ['blood', 4], ['problem', 2],
  ],
};

const ALL_CATEGORIES = [...CATEGORY_DEFS, EMERGENCY_FALLBACK];

/** Natural-language synonyms normalised before matching. */
const SYNONYMS = [
  [/short(ness)? of breath/g, 'shortness of breath'],
  [/short of breath/g, 'shortness of breath'],
  [/breathlessness|breathless/g, 'breathless'],
  [/can ?not breath(e|ing)?/g, 'cannot breathe'],
  [/difficulty (in )?breath(ing)?/g, 'difficulty breathing'],
  [/trouble breath(ing)?/g, 'trouble breathing'],
  [/loose motions?/g, 'loose motion'],
  [/throwing up|puking|puked/g, 'vomiting'],
  [/stomach (pain|ache)|belly (pain|ache)|tummy (pain|ache)|abdominal (pain|ache)/g, 'abdominal pain'],
  [/chest (pain|ache|discomfort)/g, 'chest pain'],
  [/passing out|passed out|faint(ed|ing)?|black(ed)? out|blackout/g, 'fainting'],
  [/high temperature|very hot|burning up/g, 'high fever'],
  [/can ?not walk|unable to walk|difficulty walking/g, 'cannot walk'],
  [/can ?not move|unable to move/g, 'cannot move'],
  [/can ?not speak|unable to speak|difficulty speaking/g, 'cannot speak'],
  [/bleeding a lot|heavy bleeding|bleeding heavily|lot of blood/g, 'severe bleeding'],
  [/breath(ing)? (stopped|has stopped)|stopped breathing/g, 'not breathing'],
  [/heart ?attack|myocardial infarction/g, 'heart attack'],
  [/high ?bp|high blood pressure/g, 'high blood pressure'],
  [/low ?bp|low blood pressure/g, 'low blood pressure'],
  [/sugar (level )?(is )?(very )?(high|low)/g, 'blood sugar problem'],
  // Possessive / article tolerant body-part pain patterns
  [/pain in (my |his |her |their |the |a )?left arm/g, 'pain in left arm'],
  [/left arm (pain|ache|aching|hurts?|is hurting)/g, 'pain in left arm'],
  [/pain in (my |his |her |their |the |a )?(right )?arm/g, 'pain in arm'],
  [/pain in (my |his |her |their |the |a )?jaw/g, 'jaw pain'],
  [/(jaw|chin) (pain|ache|aching|hurts?)/g, 'jaw pain'],
  [/pain in (my |his |her |their |the |a )?chest/g, 'chest pain'],
  [/chest (is )?(hurting|hurts|aching|tight|tightening)/g, 'chest tightness'],
  [/pain in (my |his |her |their |the |a )?abdomen/g, 'abdominal pain'],
  [/abdominal (pain|ache)|stomach (pain|ache)/g, 'abdominal pain'],
  [/pain in (my |his |her |their |the |a )?stomach/g, 'stomach pain'],
  [/stomach (is )?(hurting|hurts|aching|aches|painful|pain)/g, 'stomach pain'],
  [/belly (is )?(hurting|hurts|aching|aches|painful|pain)/g, 'abdominal pain'],
  [/tummy (is )?(hurting|hurts|aching|aches|painful|pain)/g, 'abdominal pain'],
  [/blood in (my |his |her |their |the )?urine/g, 'blood in urine'],
  [/blood in (my |his |her |their |the )?vomit/g, 'vomiting blood'],
  [/blood in (my |his |her |their |the )?stool/g, 'blood in stool'],
  [/(burns?|burning) (while|when) (i |we )?(pee|urinate|pass urine|peeing|urinating)/g, 'burning urination'],
  [/pain (while|when) (i )?(pee|urinate|peeing|urinating)/g, 'burning urination'],
  [/painful urination/g, 'burning urination'],
  [/(leg|arm|wrist|ankle|hip|bone|hand|foot|finger|rib|jaw|collarbone|shoulder) (is |got )?broken/g, 'broken bone'],
  [/(fractured|broke) (my |his |her |their |the )?(leg|arm|wrist|ankle|hip|bone|hand|foot|finger|rib|jaw|collarbone|shoulder)/g, 'fracture'],
];

const CRITICAL_TERMS = [
  'cardiac arrest', 'heart attack', 'heart stopped', 'not breathing',
  'stopped breathing', 'no pulse', 'unresponsive', 'unconscious',
  'loss of consciousness', 'stroke', 'paralysis', 'paralysed', 'paralyzed',
  'slurred speech', 'facial droop', 'face droop', 'seizure', 'convulsion',
  'severe bleeding', 'heavy bleeding', 'vomiting blood', 'blood in vomit',
  'coughing blood', 'overdose', 'poisoning', 'poison', 'anaphylaxis',
  'anaphylactic', 'choking', 'collapsed', 'coma', 'blue lips', 'stab',
  'gunshot', 'deep wound', 'third degree', 'severe head injury', 'cannot breathe',
  'internal bleeding', 'not responding', 'suicidal', 'self harm',
];

const CRITICAL_COMBOS = [
  ['chest pain', 'sweating'],
  ['chest pain', 'left arm'],
  ['chest pain', 'pain in arm'],
  ['chest pain', 'jaw'],
  ['chest pain', 'crushing'],
  ['chest pain', 'radiating'],
  ['chest pain', 'cold sweat'],
  ['chest pain', 'shortness of breath'],
  ['pain in left arm', 'sweating'],
  ['pain in left arm', 'shortness of breath'],
  ['jaw pain', 'sweating'],
  ['abdominal pain', 'rigid'],
  ['abdominal pain', 'bleeding'],
  ['fever', 'stiff neck'],
  ['fever', 'rash'],
];

const HIGH_TERMS = [
  'broken bone', 'fracture', 'fractured', 'deformed', 'severe pain', 'unbearable',
  'intense pain', 'high fever', 'difficulty breathing', 'trouble breathing',
  'shortness of breath', 'breathless', 'asthma', 'fainted', 'fainting',
  'dislocated', 'dislocation', 'second degree', 'severe burn', 'burn injury',
  'appendicitis', 'cannot walk', 'cannot move', 'cannot speak',
  'uncontrolled bleeding', 'dehydration', 'dehydrated', 'blood in stool',
  'blurred vision', 'double vision', 'chest pain', 'severe headache',
  'worst headache', 'severe back pain', 'numbness', 'weakness on one side',
  'loose motion', 'food poisoning', 'blood in urine', 'unable to urinate',
  'high blood pressure', 'low blood pressure', 'blood sugar problem',
];

const LOW_TERMS = ['mild', 'slight', 'slightly', 'minor', 'small cut', 'stable', 'little bit'];

const ACTIONS_BY_KEY = {
  cardiac: [
    'Attach cardiac monitor and obtain a 12-lead ECG immediately',
    'Keep patient seated and at rest; do not allow exertion',
    'Have resuscitation cart and defibrillator at the bedside',
    'Establish IV access and prepare emergency cardiac drugs',
  ],
  neuro: [
    'Assess GCS, pupils and limb power on arrival',
    'Maintain airway and immobilise cervical spine if trauma',
    'Prepare for emergency CT/MRI and keep the patient nil-by-mouth',
    'Keep seizure precautions and suction at the bedside',
  ],
  trauma_ortho: [
    'Immobilise the affected limb and control any bleeding',
    'Prepare for emergency X-ray and keep the patient calm',
    'Assess distal pulses, sensation and capillary refill',
    'Arrange analgesia as prescribed by the doctor',
  ],
  surgery: [
    'Keep the patient nil-by-mouth and start IV fluids',
    'Prepare surgical consent and an OT slot',
    'Cross-match blood and keep it ready',
    'Monitor vitals every 15 minutes',
  ],
  pediatric: [
    'Assess paediatric vitals, weight and hydration',
    'Prepare child-size equipment and IV access',
    'Keep the parent/attendant with the child',
    'Monitor temperature, feeding and urine output',
  ],
  respiratory: [
    'Sit the patient upright and administer oxygen',
    'Prepare a nebuliser and monitor SpO2 continuously',
    'Keep bag-valve-mask ready at the bedside',
    'Obtain ABG if ordered by the doctor',
  ],
  general: [
    'Monitor vitals and hydration status',
    'Obtain basic labs (CBC, glucose, electrolytes)',
    'Start IV fluids as required',
    'Reassess the patient every 30 minutes',
  ],
  emergency: [
    'Triage vitals and stabilise the patient',
    'Establish IV access',
    'Monitor vitals continuously',
    'Prepare for immediate physician assessment',
  ],
};

/** Dynamic, category-specific clarifying question. */
const FOLLOW_UP_BY_KEY = {
  cardiac: 'Is the chest pain spreading to the arm, jaw, back or shoulder, and is the patient sweating or short of breath?',
  neuro: 'When did the symptoms start, and can the patient lift both arms, smile evenly and speak clearly?',
  trauma_ortho: 'Which body part is injured, is the limb deformed or bleeding, and can the patient still move and feel it?',
  surgery: 'Where exactly is the pain, and is the abdomen hard, swollen, rigid or tender to touch?',
  pediatric: 'How old is the child, and is the child alert, feeding and passing urine normally?',
  respiratory: 'Can the patient speak full sentences, and are the lips or fingertips turning pale or blue?',
  general: 'How high is the fever (if any), and is the patient able to keep fluids down and pass urine normally?',
  emergency: 'Is the patient conscious and breathing normally, and is there any active bleeding or injury?',
};

/* ------------------------------- Utilities ------------------------------- */

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(text) {
  let t = ` ${String(text || '').toLowerCase()} `;
  for (const [re, replacement] of SYNONYMS) t = t.replace(re, replacement);
  t = t
    .replace(/can['’]t\b/g, 'cannot')
    .replace(/won['’]t\b/g, 'will not')
    .replace(/n['’]t\b/g, ' not')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ` ${t} `;
}

function containsTerm(text, term) {
  if (term.includes(' ')) return text.includes(` ${term} `);
  const re = new RegExp(`\\b${escapeRegExp(term)}(s)?\\b`, 'i');
  return re.test(text);
}

function scoreCategory(text, def) {
  const matched = [];
  let score = 0;
  for (const [term, weight] of def.terms) {
    if (containsTerm(text, term)) {
      matched.push(term);
      score += weight + (term.length > 12 ? 2 : 0);
    }
  }
  return { score, matched };
}

function detectCategory(text) {
  let best = EMERGENCY_FALLBACK;
  let bestScore = 0;
  let bestMatched = [];

  for (const def of ALL_CATEGORIES) {
    const { score, matched } = scoreCategory(text, def);
    if (score > bestScore) {
      best = def;
      bestScore = score;
      bestMatched = matched;
    }
  }

  // If nothing at all matched, default to Emergency Medicine (never General).
  if (bestScore === 0) {
    const { matched } = scoreCategory(text, EMERGENCY_FALLBACK);
    return { category: EMERGENCY_FALLBACK, score: 0, matched };
  }
  return { category: best, score: bestScore, matched: bestMatched };
}

function detectUrgency(text, categoryKey, categoryScore = 0) {
  const critical = CRITICAL_TERMS.filter((t) => containsTerm(text, t));
  if (critical.length) return { urgency: 'critical', triageLevel: 1, triggers: critical };

  for (const [a, b] of CRITICAL_COMBOS) {
    if (containsTerm(text, a) && containsTerm(text, b)) {
      return { urgency: 'critical', triageLevel: 1, triggers: [`${a} + ${b}`] };
    }
  }

  const high = HIGH_TERMS.filter((t) => containsTerm(text, t));
  if (high.length >= 3) return { urgency: 'critical', triageLevel: 2, triggers: high };

  if (high.length >= 1) return { urgency: 'high', triageLevel: 3, triggers: high };

  // High-acuity specialisations are escalated only with a meaningful signal.
  if (['neuro', 'cardiac'].includes(categoryKey) && categoryScore >= 9) {
    return { urgency: 'high', triageLevel: 3, triggers: ['high-acuity specialisation'] };
  }

  if (LOW_TERMS.some((t) => containsTerm(text, t))) {
    return { urgency: 'low', triageLevel: 5, triggers: [] };
  }
  return { urgency: 'moderate', triageLevel: 4, triggers: [] };
}

function extractDemographics(text) {
  const t = ` ${text} `;
  const result = { age: null, gender: null };

  const ageMatch = t.match(/(\d{1,3})\s*(?:year|yr|yrs|year old|years old|yo)\b/);
  if (ageMatch) result.age = Number(ageMatch[1]);
  if (/\b(infant|newborn|neonate)\b/.test(t)) result.age = result.age ?? 0;
  if (/\b(baby|babies)\b/.test(t)) result.age = result.age ?? 1;
  if (/\b(toddler)\b/.test(t)) result.age = result.age ?? 2;

  if (/\b(male|man|men|boy|father|dad|husband|grandfather|son|brother)\b/.test(t)) result.gender = 'male';
  if (/\b(female|woman|women|girl|mother|mom|wife|grandmother|daughter|sister)\b/.test(t)) result.gender = 'female';

  return result;
}

function buildSummary(chiefComplaint, category, urgency, demographics) {
  const who = demographics.age != null ? `Patient (~${demographics.age}y)` : 'Patient';
  const gender = demographics.gender ? ` (${demographics.gender})` : '';
  return `${who}${gender}: ${chiefComplaint}. Suspected ${category.departmentName} emergency, triage ${urgency}.`;
}

/* --------------------------------- Engine -------------------------------- */

export function ruleTriage(conversation) {
  const userMessages = conversation.filter((m) => m.role === 'user');
  const transcript = conversation
    .map((m) => `${m.role === 'user' ? 'Patient/Attendant' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const userText = userMessages.map((m) => m.content).join(' ');
  const raw = userText.trim() || transcript;
  const text = normalize(raw);

  const demographics = extractDemographics(text);
  const { category, score, matched } = detectCategory(text);
  const { urgency, triageLevel, triggers } = detectUrgency(text, category.key, score);

  // Paediatric safety override:
  //  - any patient explicitly aged 14 or under, or
  //  - any description that explicitly mentions a child/baby (and no adult age),
  // is routed to Paediatrics.
  const pediatricDef = CATEGORY_DEFS.find((c) => c.key === 'pediatric');
  const pediatricSignal = scoreCategory(text, pediatricDef).score > 0;
  let finalCategory = category;
  const isChild = (demographics.age != null && demographics.age <= 14)
    || (demographics.age == null && pediatricSignal);
  if (isChild && category.key !== 'pediatric') {
    finalCategory = pediatricDef;
  }

  const firstUser = conversation.find((m) => m.role === 'user');
  const chiefComplaint = (firstUser?.content || 'Unspecified emergency').slice(0, 200);

  const allMatched = [...new Set(matched)].slice(0, 14);
  const confidence = finalCategory.key === 'emergency' && score === 0
    ? 0.35
    : Math.min(0.96, 0.5 + score / 45 + (triggers.length ? 0.05 : 0));

  return {
    agent: 'TriageAgent',
    urgency,
    triageLevel,
    requiredDepartment: finalCategory.departmentName,
    requiredSpecialization: finalCategory.specialization,
    wardHint: finalCategory.wardHint,
    category: finalCategory.key,
    chiefComplaint,
    summary: buildSummary(chiefComplaint, finalCategory, urgency, demographics),
    matchedSymptoms: allMatched,
    urgencyTriggers: triggers,
    recommendedActions: ACTIONS_BY_KEY[finalCategory.key] || ACTIONS_BY_KEY.emergency,
    followUpQuestion: FOLLOW_UP_BY_KEY[finalCategory.key] || FOLLOW_UP_BY_KEY.emergency,
    demographics,
    confidence: Number(confidence.toFixed(2)),
    method: 'rule-engine',
  };
}

/* ------------------------------- LLM layer ------------------------------- */

async function llmTriage(conversation, base) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return base;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a hospital emergency triage agent. Return ONLY JSON with keys: urgency (critical|high|moderate|low), requiredDepartment, requiredSpecialization, summary, recommendedActions (array of strings), followUpQuestion (one short clarifying question specific to this emergency).',
          },
          ...conversation.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return base;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return {
      ...base,
      ...parsed,
      recommendedActions: parsed.recommendedActions || base.recommendedActions,
      followUpQuestion: parsed.followUpQuestion || base.followUpQuestion,
      method: 'llm+rule',
    };
  } catch {
    return base;
  }
}

export async function runTriageAgent(conversation) {
  const base = ruleTriage(conversation);
  if ((process.env.TRIAGE_PROVIDER || '').toLowerCase() === 'openai') {
    return llmTriage(conversation, base);
  }
  return base;
}

export default { runTriageAgent, ruleTriage };
