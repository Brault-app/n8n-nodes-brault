# Finding: the idempotency key is not caller-controlled

> Raised 2026-09-13 from `brault-support-automation`, the first real workflow program built on
> this node. Affects `n8n-nodes-brault@0.1.5`. Not yet fixed.

## What the node does today

`transport/request.ts` sets the header on every create:

```ts
if (opts.idempotent && opts.method === 'POST') headers['Idempotency-Key'] = newIdempotencyKey();
```

and `transport/idempotency.ts` is, in full:

```ts
export function newIdempotencyKey(): string {
  return randomUUID();
}
```

A fresh UUID is minted **inside each `braultRequest` call**. The same request object is reused
when a `429` is retried, so the key does hold across that retry. Nothing else.

## Why that is a problem

The Public API's idempotency keys exist so a caller can **replay a whole operation safely**.
That is the case every queue-driven workflow has: a message is deleted only after the work
succeeded, so a crash halfway through replays it, and the second run must not create a second
page, comment or block.

With a random key per call the node offers no protection there at all. Two runs over the same
input produce two pages. The key is doing work for the one case the node retries internally and
none for the case the feature is actually for.

The connector is hiding a capability the API has, and hiding it in a way that reads as present:
a user who knows the API will reasonably assume that a node which sends `Idempotency-Key` lets
them control it.

## What the support program did instead

It stopped relying on the header. Ticket codes are now **derived** from a stable per-message
identifier (`lib/ticket-code.mjs`, `deriveTicketCode`): the SQS `MessageId` for a queued ticket,
the email `Message-ID` for a reply. A replayed message mints the same code, the board query finds
the card that already exists, and the workflow skips creation. That works, and is arguably better
than a header because it is visible in the data, but it is a workaround for a gap in this node.

It does not cover everything. `page: appendBlocks` and `comment: create` have no natural
"already done?" query that is cheap, so a replay can still duplicate a block or a comment. Those
are exactly the calls where a caller-supplied key would be one field.

## The fix

Add an optional **Idempotency Key** field to every `POST` operation, in `Additional Fields`, and
use it when present:

```ts
if (opts.idempotent && opts.method === 'POST') {
  headers['Idempotency-Key'] = opts.idempotencyKey ?? newIdempotencyKey();
}
```

Defaulting to a random UUID keeps today's behaviour for anyone who leaves it blank, so this is
additive and breaks nothing. The field belongs in `catalogue/common-params.ts` as a shared
factory, added to the `fields` of each creating operation, next to where `build-properties.ts`
already assembles the collection.

Worth pairing with a line in the node's README: an idempotency key is how you make a workflow
safe to replay, and here is where to put one.
