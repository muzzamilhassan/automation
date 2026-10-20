---
name: research
description: Investigate a question against high-trust primary sources using WebSearch/WebFetch and capture the findings as a cited Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
license: MIT
metadata:
  source: mattpocock/skills (adapted)
  category: lifecycle
---

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it. Use WebSearch to find the sources and WebFetch to read them.
2. Write the findings to a single Markdown file, citing each claim's source as a URL right where the claim is made. Mark anything you could not verify against a primary source as **unverified**, and note what you would need to verify it.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
