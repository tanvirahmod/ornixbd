# One-off audit of supabase/apply-pending-migrations.sql for statements that
# fail on REPLAY (the file is run repeatedly by hand in the SQL Editor).
# Reports:
#   1. create policy "X" on T with no drop policy if exists "X" on T earlier
#   2. alter table T add column C without "if not exists"
#   3. create table T without "if not exists"
#   4. create trigger without a prior drop trigger if exists
#   5. bare INSERT INTO (seed rows) without "on conflict"
#   6. create index / unique index without "if not exists"
#   7. add constraint without a prior drop constraint
#   8. create function without "or replace", create type / domain
# Run:  python scripts/audit-batch-idempotency.py
import re

PATH = 'supabase/apply-pending-migrations.sql'
text = open(PATH, encoding='utf-8').read()
lines = text.split('\n')

def norm(name: str) -> str:
    return name.strip().strip('"').lower()

def table_of(ref: str) -> str:
    return norm(ref).removeprefix('public.')

dropped_policies = set()
dropped_triggers = set()
issues = []

for i, raw in enumerate(lines, 1):
    line = raw.strip()
    low = line.lower()
    if not low or low.startswith('--'):
        continue

    # 1) policies: remember drops, flag bare creates
    m = re.match(r'drop\s+policy\s+(?:if\s+exists\s+)?"?([\w\s]+?)"?\s+on\s+((?:public\.)?\w+)', low)
    if m:
        dropped_policies.add((norm(m.group(1)), table_of(m.group(2))))
    m = re.match(r'create\s+policy\s+"?([\w\s]+?)"?\s+on\s+((?:public\.)?\w+)', low)
    if m and not low.startswith('create or replace'):
        key = (norm(m.group(1)), table_of(m.group(2)))
        if key not in dropped_policies:
            issues.append((i, 'policy', raw.strip()[:90]))

    # 2) add column without if not exists
    m = re.search(r'alter\s+table\s+(?:only\s+)?(?:public\.)?\w+\s+add\s+column\s+(if\s+not\s+exists\s+)?(\w+)', low)
    if m and not m.group(1):
        issues.append((i, 'add column', raw.strip()[:90]))

    # 3) create table without if not exists
    if re.match(r'create\s+table\s+(?!if\s+not\s+exists)', low):
        issues.append((i, 'create table', raw.strip()[:90]))

    # 4) trigger without prior drop if exists
    m = re.match(r'drop\s+trigger\s+if\s+exists\s+(\w+)', low)
    if m:
        dropped_triggers.add(norm(m.group(1)))
    m = re.match(r'create\s+trigger\s+(\w+)', low)
    if m and not low.startswith('create or replace'):
        if norm(m.group(1)) not in dropped_triggers:
            issues.append((i, 'trigger', raw.strip()[:90]))

    # 5) bare insert (seed rows) without on conflict nearby
    if re.match(r'insert\s+into\s+', low) and 'on conflict' not in low:
        issues.append((i, 'insert', raw.strip()[:90]))

    # 6) index without if not exists
    if re.match(r'create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)', low):
        issues.append((i, 'index', raw.strip()[:90]))

    # 7) add constraint without a prior drop of the same name
    m = re.search(r'add\s+constraint\s+(\w+)', low)
    if m and f'drop constraint' not in text[: text.find(line)].lower():
        issues.append((i, 'constraint', raw.strip()[:90]))

    # 8) function without or replace / types
    if re.match(r'create\s+function\s+', low):
        issues.append((i, 'function', raw.strip()[:90]))
    if re.match(r'create\s+(type|domain)\s+', low):
        issues.append((i, 'type/domain', raw.strip()[:90]))

print(f'{len(issues)} potential replay hazards in {PATH}\n')
current = None
for lineno, kind, snippet in issues:
    if kind != current:
        print(f'--- {kind} ---')
        current = kind
    print(f'  line {lineno}: {snippet}')
