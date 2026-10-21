# Content task (`type == "content"`)

Loaded by `execute-task` for content sub-tasks.

## Steps

1. Load `references/memory.md` → `references/rag.md` (context, per step 1.5).

2. With `task.copy == "i18n"`, append copy directly to the locale
   dictionaries — no intermediaries:
   - Locale files: `task.metadata.locale_dirs` — the actual i18n layout;
     write only there.
   - Keys: `task.metadata.locale_keys` — an unalterable constant; append one
     entry per key, for every locale the project defines
     (`task.metadata.locales` when given, else infer from the dictionaries).
   - Never create tracking files; commit dictionary writes straight to the
     shared branch.
   - Copy-only scope: never open or alter layout components (`.astro`,
     `.tsx`, `.vue`).
   - Commit: `git add <dict files>` and
     `git commit -m "content: <ns> locale copy" -- <dict files>`.
   - No plan or narrative files, no tracking files.

3. Otherwise (standard content), write the copy directly into the locale
   dictionaries, narrative and structure shaped inline:
   - Voice profile, USP with a number, one concrete pain scenario, journey —
     applied to the copy as written, nothing saved.
   - Dictionary files: `task.metadata.locale_dirs`; keys:
     `task.metadata.locale_keys`.
   - Copy-only scope: never open or alter layout components (`.astro`,
     `.tsx`, `.vue`).
   - Commit: `git add <dict files>` and
     `git commit -m "content: <scenario> copy" -- <dict files>`. Nothing else
     is written; no plan or narrative files.

5. Apply the prose-quality overlay (`references/prose-quality.md`):
   - Grep for banned words/phrases; every benefit claim carries a
     number/constraint; CTA states the actual next step; copy-paste test.

6. Commit: `git add <dict files> && git commit -m "..." -- <dict files>`.

## Success Criteria

- `task.copy == "i18n"`: every `metadata.locale_keys` key has a text in every
  locale of the project's dictionaries; no intermediate files; zero banned words
- Standard content: copy landed in the project's dictionaries for its keys;
  no plan or narrative files created
- Acceptance criteria met