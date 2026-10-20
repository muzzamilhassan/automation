---
name: scale-playbook
description: Scale a product when signals demand it — a signal-to-action playbook from slow endpoints and DB pressure to caching, queues, read replicas, background jobs, object storage, and (last) sharding — each action tied to a before/after metric. Use when the user asks about scaling, performance, handling more traffic, or when p95 latency, DB load, or queue backlogs are real problems.
license: MIT
metadata:
  source: fullstack-agent-os (authored; measure-first discipline, monolith-first position)
  category: backend
---

# Scale Playbook — scale what hurts, prove it worked

Scaling actions are bought by SIGNALS, not by speculation. Every action: measure before → act → measure after → the delta is the deliverable.

## Signal → action

| Signal | Do, in order |
|--------|--------------|
| Slow pages (p95 up) | 1. PROFILE first — query logs, tracing; find the 1–3 real bottlenecks. 2. Usually: N+1 (`database-design`), missing index, or rendering/streaming everything at once. 3. Only then think cache. |
| DB CPU / locks / connection exhaustion | query+index fixes → connection pooling (PgBouncer-grade) → read replicas when READS dominate → vertical upgrade — sharding LAST |
| Hot endpoint (one route eats the box) | HTTP caching where responses are cacheable → app-level cache with an invalidation story → rate limit → queue it if it's heavy |
| Requests that take seconds (reports, emails, webhooks) | background jobs/queue: idempotent jobs, retries with backoff, dead-letter queue + alerting; the HTTP request only ENQUEUES |
| Large uploads/downloads | object storage + presigned URLs — files never stream through the app server |
| Spiky traffic | queue-based load leveling, static/cached pages for anonymous traffic, autoscaling on the right metric (queue depth, not CPU alone) |

## Caching rules (the hard part is invalidation)

- Cache only with a written invalidation story: who invalidates, when, on what event. TTL for tolerable staleness; version cache keys when the shape changes.
- Cache at the layer that hurts: HTTP (CDN) for anonymous pages; app cache for computed hot reads; never cache per-user data under shared keys (that is a data leak).

## The monolith position

Scale the modular monolith FIRST: clean seams (`refactor-slice`, `codebase-design`), queues between heavy work and requests, stateless app tier. Microservices are a team-communication technology before they are a scaling one — splitting early buys you distributed-systems bugs and solves a problem you may not have.

## Capacity basics

Know your numbers: current p95, DB max connections, queue depth norms, and the load level where the SLO breaks (`testing-advanced` load tests measure exactly this). Load-test BEFORE launches/pricing changes, after any scaling-relevant change.

## Report format (per action)

Signal → measured before → action taken → measured after → what's next if the target is still missed. No action without its metric; no "should be faster now".
