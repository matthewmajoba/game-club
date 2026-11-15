"""Give Game Club members new two-word secret codes.

Usage:
  python scripts/set_codes.py            # new codes for everyone
  python scripts/set_codes.py Katie Kat  # new codes for just these people

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local, stores only a
bcrypt hash in the database, and writes the readable codes to member-codes.txt
(gitignored). Hand each person their code privately.
"""
import json, secrets, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEMBERS = ["Hannah", "Junior", "Katie", "Sarah", "Anthony", "Giselle", "Michael", "Kat", "Kalon", "Matt"]

FIRST = ["pickle", "soggy", "turbo", "goblin", "crusty", "spicy", "wobbly", "sneaky", "funky", "chunky",
         "greasy", "moist", "feral", "cursed", "haunted", "beefy", "cosmic", "salty", "rusty", "jiggly",
         "noodle", "gremlin", "sweaty", "zesty", "bonkers", "wonky", "squishy", "toasty", "fuzzy", "grumpy"]
SECOND = ["tornado", "waffle", "possum", "burrito", "toaster", "nugget", "llama", "pancake", "raccoon", "meatball",
          "goose", "taco", "biscuit", "walrus", "spork", "cabbage", "hamster", "noodle", "pudding", "badger",
          "dumpling", "lasagna", "weasel", "muffin", "tater", "gerbil", "crouton", "sasquatch", "corndog", "platypus"]


def env():
    vals = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip()
    return vals


def main():
    e = env()
    names = sys.argv[1:] or MEMBERS
    used, out = set(), {}
    for n in names:
        while True:
            code = f"{secrets.choice(FIRST)} {secrets.choice(SECOND)}"
            if code not in used and code.split()[0] != code.split()[1]:
                break
        used.add(code)
        req = urllib.request.Request(
            e["SUPABASE_URL"] + "/rest/v1/rpc/set_member_code",
            data=json.dumps({"p_name": n, "p_code": code}).encode(),
            headers={"apikey": e["SUPABASE_SERVICE_ROLE_KEY"],
                     "Authorization": "Bearer " + e["SUPABASE_SERVICE_ROLE_KEY"],
                     "Content-Type": "application/json"},
            method="POST")
        urllib.request.urlopen(req).read()
        out[n] = code

    path = ROOT / "member-codes.txt"
    existing = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if ": " in line and not line.startswith("#"):
                k, v = line.split(": ", 1)
                existing[k] = v
    existing.update(out)
    lines = ["# Game Club secret codes. KEEP PRIVATE. Hand each person only their own.",
             "# Not case sensitive. Spaces/dashes don't matter.", ""]
    lines += [f"{n}: {existing[n]}" for n in MEMBERS if n in existing]
    lines += [f"{n}: {v}" for n, v in existing.items() if n not in MEMBERS]
    path.write_text("\n".join(lines) + "\n")
    print(f"Set {len(out)} code(s): {', '.join(out)}. Written to member-codes.txt")


if __name__ == "__main__":
    main()
