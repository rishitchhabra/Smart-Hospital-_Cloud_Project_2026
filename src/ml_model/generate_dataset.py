"""Generate a synthetic emergency-triage dataset for the MedAgentX Triage Agent.

The dataset mirrors the rule engine in src/backend/src/agents/triageAgent.js:
free-text symptom descriptions mapped to a medical category and an urgency
level. It is intentionally synthetic and contains no real patient data.

Usage:
    python3 generate_dataset.py
Outputs:
    dataset/triage_samples.csv
"""

import csv
import itertools
import os
import random

random.seed(42)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dataset", "triage_samples.csv")

TEMPLATES = {
    "cardiac": {
        "critical": [
            "my father has severe chest pain and sweating he is {age}",
            "crushing chest pain radiating to the left arm since {mins} minutes",
            "he collapsed with chest tightness and no pulse",
            "cardiac arrest, patient not breathing, chest pain before collapse",
        ],
        "high": [
            "chest pain on exertion, {age} year old with palpitations",
            "irregular heartbeat and chest discomfort for {hours} hours",
            "angina like chest pain, feels pressure in chest",
        ],
        "moderate": [
            "mild chest discomfort after walking, no sweating",
            "occasional palpitations, feels fine otherwise",
        ],
    },
    "neuro": {
        "critical": [
            "sudden slurred speech and weakness on one side of face",
            "patient is unconscious after a seizure, {age} years old",
            "stroke suspected, facial droop and unable to move left arm",
            "severe headache worst of life with confusion and vomiting",
        ],
        "high": [
            "seizure episode lasting {mins} minutes, now drowsy",
            "numbness on right side and slurred speech started {hours} hours ago",
        ],
        "moderate": [
            "recurring migraine with light sensitivity",
            "mild dizziness and tingling in fingers",
        ],
    },
    "trauma_ortho": {
        "critical": [
            "road accident, open fracture of leg with heavy bleeding",
            "fell from height, deformed arm and severe pain",
        ],
        "high": [
            "broken bone suspected after a fall, unable to walk",
            "dislocated shoulder from bike accident, severe pain",
        ],
        "moderate": [
            "twisted ankle while walking, mild swelling",
            "sprained wrist after a small fall, slight pain",
        ],
    },
    "surgery": {
        "critical": [
            "deep wound on abdomen with internal bleeding after stab",
            "vomiting blood and severe abdominal pain",
        ],
        "high": [
            "appendicitis suspected, severe stomach pain on right side",
            "burns on hand from boiling water, second degree",
        ],
        "moderate": [
            "mild abdominal pain and bloating since yesterday",
            "small laceration on forearm, bleeding controlled",
        ],
    },
    "pediatric": {
        "critical": [
            "my {mchild_age} year old child is not breathing properly and blue lips",
            "baby is unresponsive after high fever and convulsion",
        ],
        "high": [
            "my {mchild_age} year old daughter has high fever and continuous vomiting",
            "toddler with difficulty breathing and wheezing",
        ],
        "moderate": [
            "my {mchild_age} year old child has mild fever and cold",
            "infant with slight rash and mild diarrhoea",
        ],
    },
    "respiratory": {
        "critical": [
            "severe difficulty breathing, unable to speak full sentences",
            "choking and gasping for air, oxygen level dropping",
        ],
        "high": [
            "asthma attack not relieved by inhaler",
            "shortness of breath and wheezing since morning",
        ],
        "moderate": [
            "mild cough and cold for {days} days",
            "slight breathlessness after climbing stairs",
        ],
    },
    "general": {
        "critical": [
            "high fever with severe dehydration and fainting",
            "anaphylaxis after food, swelling of face and throat",
        ],
        "high": [
            "high fever and persistent vomiting for {days} days",
            "dehydration with dizziness and weakness",
        ],
        "moderate": [
            "mild fever and body ache since yesterday",
            "food poisoning with diarrhoea, able to drink fluids",
        ],
    },
}

URGENCY_TO_LEVEL = {"critical": 1, "high": 3, "moderate": 4, "low": 5}


def fill(text):
    return (
        text.replace("{age}", str(random.choice([45, 52, 58, 64, 70, 76])))
        .replace("{mins}", str(random.choice([5, 10, 15, 20, 30])))
        .replace("{hours}", str(random.choice([1, 2, 3, 4, 6])))
        .replace("{days}", str(random.choice([1, 2, 3, 4])))
        .replace("{mchild_age}", str(random.choice([1, 2, 3, 4, 5, 7, 10])))
    )


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    rows = []
    prefixes = ["", "please help, ", "urgent! ", "my relative has ", "we need help, "]
    suffixes = ["", " please advise", " it is getting worse", " started suddenly"]

    for category, by_urgency in TEMPLATES.items():
        for urgency, texts in by_urgency.items():
            for text in texts:
                for _ in range(18):
                    sample = fill(text)
                    sample = random.choice(prefixes) + sample + random.choice(suffixes)
                    rows.append({
                        "text": sample,
                        "category": category,
                        "urgency": urgency,
                        "triage_level": URGENCY_TO_LEVEL[urgency],
                    })

    random.shuffle(rows)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "category", "urgency", "triage_level"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} samples to {OUT}")


if __name__ == "__main__":
    main()
