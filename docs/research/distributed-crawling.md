# Distributed, cluster-scale crawling: recommendation

- **Status:** Recommendation for review (issue [#97](https://github.com/russoedu/open.craw/issues/97))
- **Basis:** a reading of the code and docs (`work-item.contract.ts`, `worker-mode.md`,
  `azure-durable.md`, the dedupe and resume options). Nothing here was measured on a cluster.

## Recommendation

**Do not build a distributed frontier.** Document the pattern that already works (disjoint slices of a
known list, one pool per machine), and add one small thing only if a real user asks for it: a
`WorkSource` adapter for a shared queue. Revisit when a recipe exists that cannot be expressed as a
bounded list of work items.

## 1. Is a shared frontier the right model?

Scrapy's frontier exists because link-discovery crawls have an unbounded URL set that no one can list in
advance. OpenCraw recipes mostly do not: a `forEach` or `paginate` walks a route the author described, and
the "work" a team wants to spread out is already a list (one report per date, region and filter set, as
`worker-mode.md` describes). For that, the missing piece is not a frontier but a way for several machines
to take items from one list without taking the same item. `WorkSource.next/done/failed` is exactly that
seam, and its own doc says claiming is the source's job.

An open-ended crawl that discovers new targets as it runs is the case a frontier serves. The engine has no
such recipe shape today (`paginate` and `forEach` run inside one run, over what that run's pages show), so there is nothing to feed it.

## 2. If one were needed, what would be shared

All three of the visited set, the dedupe key set and a priority queue, plus per-host politeness, because
`throttle` and `limits.delayMs` are per process: ten machines on one host each obey the limit and together
exceed it. That is four shared things, each with its own failure modes, which is the cost of "a real
frontier".

## 3. What `azure-durable` covers, and where it stops

It fans out one activity per pushed item and bounds concurrency through `host.json` and the scale limit; a Function App scaled to several instances has one pool per instance for the same crawl id (`azure-durable.md` §4). It
does not stop two callers, or one caller retrying a timed-out request, from running the same item twice.
Avoiding that is the caller's job (an idempotent item id and a queue that claims), the same as for any
worker pool.

## 4. What cross-machine dedupe would cost

Two honest options, with different guarantees:

| Option | Guarantee | Cost |
|---|---|---|
| A central key store checked before each write | No duplicate records | A network round trip per record; the store is now a dependency to run |
| Local dedupe, then one reconcile pass on the merged output | Duplicates may be written first, removed after | No new infrastructure; correct only after the pass; the sinks must tolerate it |

Today's `resume` (skip keys the sink already has) already gives the second option for a single sink that
all machines can read. For disjoint slices of a list, it is rarely needed, because the same key does not
appear in two slices unless the list itself repeats it.

## 5. Is this core's job?

Not as a subsystem. A frontier service is something OpenCraw would have to own, secure and operate, for a
need that a partitioned list meets. The recommendation by option:

| Option | Verdict |
|---|---|
| Build nothing beyond docs | **Do this now.** Add a section to `worker-mode.md`: partition the list by a stable hash or range, run one pool per machine, give each its own sink path or table, merge afterwards. Name the one trap: per-host politeness is not shared. |
| A shared-queue `WorkSource` adapter | **On demand.** One package per queue technology (a SQL table with leases, Azure Storage queues, Redis), each implementing `next/done/failed`. Core stays as it is. |
| A real distributed frontier | **No**, until a recipe needs open-ended discovery across machines and the partitioned list is shown not to fit. |

## Follow-ups if this is accepted

1. The `worker-mode.md` section above (docs only).
2. A note in `azure-durable.md` that two callers can run the same item, and what an idempotent item id is.
3. A decision, per user request, on which queue the first adapter targets.
