# One-off transform: make supabase/apply-pending-migrations.sql replay-safe by
# inserting `drop policy if exists "X" on T;` before every top-level
# `create policy "X" on T` that isn't already preceded by a same-name drop.
# Also makes the admin_users role-check constraint replay-safe.
# The batch file is re-run by hand in the SQL Editor, so every statement must
# tolerate the objects already existing.
# Run:  python scripts/fix-batch-policies.py
import re

PATH = 'supabase/apply-pending-migrations.sql'
with open(PATH, 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

out = []
dropped = set()          # (policy name, table) already dropped above
create_re = re.compile(
    r'^\s*create\s+policy\s+"([^"]+)"\s+on\s+((?:public\.)?[\w]+)',
    re.IGNORECASE,
)
drop_re = re.compile(
    r'^\s*drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+((?:public\.)?[\w]+)',
    re.IGNORECASE,
)

def table_of(ref: str) -> str:
    return ref.strip().strip('"').lower().removeprefix('public.')

for line in lines:
    m = drop_re.match(line)
    if m:
        dropped.add((m.group(1).lower(), table_of(m.group(2))))
        out.append(line)
        continue

    m = create_re.match(line)
    if m:
        name, table = m.group(1), table_of(m.group(2))
        if (name.lower(), table) not in dropped:
            out.append(f'drop policy if exists "{name}" on public.{table};')
            print(f'line {len(out) - 1}: added drop for "{name}" on {table}')
        out.append(line)
        continue

    # constraint: make idempotent
    if re.match(r'^\s*alter\s+table\s+public\.admin_users\s+add\s+constraint\s+admin_users_role_check\b', line, re.IGNORECASE):
        indent = line[: len(line) - len(line.lstrip())]
        out.append(f'do $$ begin')
        out.append(f'  if not exists (select 1 from pg_constraint where conname = \'admin_users_role_check\') then')
        out.append(f'    alter table public.admin_users add constraint admin_users_role_check')
        out.append(f'      check (role in (\'super_admin\', \'admin\')) not valid;')
        out.append(f'  end if;')
        out.append(f'end $$;')
        print('wrapped admin_users_role_check in a guard')
        continue

    out.append(line)

with open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write('\n'.join(out))

print('done')
