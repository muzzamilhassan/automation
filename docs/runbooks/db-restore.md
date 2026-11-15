# Runbook — restore the Neon database from a nightly backup

Backups: GitHub repo → Releases → **"Neon backups (age-encrypted)"** (tag
`db-backups`), one file per night `neon-YYYY-MM-DD.dump.age`, last 30 days.
Made by `.github/workflows/db-backup.yml`; every dump was restored into a
throwaway Postgres and row-checked before it was saved.

**You need the private key:** `C:\Users\<you>\.quarry-backup\age-identity.txt`
(keep a copy in a password manager / USB — without it the backups cannot be
opened). The matching public key is in the workflow (`AGE_RECIPIENT`).

## 1. Download and decrypt

```bash
bash scripts/gh-personal release download db-backups -p "neon-2026-11-16.dump.age" -D restore-tmp
age -d -i "$HOME/.quarry-backup/age-identity.txt" -o restore-tmp/neon.dump restore-tmp/neon-2026-11-16.dump.age
pg_restore --list restore-tmp/neon.dump | head    # sanity: lists tables
```

(`age` for Windows: github.com/FiloSottile/age/releases — `age.exe`.)

## 2. Restore

**Safest: into a NEW Neon branch** (Neon console → Branches → Create branch
→ copy its connection string), check it, then point the apps at it or copy
data back:

```bash
pg_restore -d "<new-branch-DIRECT-url>" --no-owner --no-privileges restore-tmp/neon.dump
```

Use the **direct** host (no `-pooler` in the hostname). Never restore over the
live database without a fresh dump of it first.

## 3. After restoring
- Point `DATABASE_URL` (GitHub secret + Vercel env + local `.env`) at the
  restored database if it replaces production; redeploy the Studio
  (`cd studio && vercel --prod`).
- Delete `restore-tmp/` (it holds plaintext data).
