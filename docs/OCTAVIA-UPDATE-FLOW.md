# Octavia Load Balancer Update Flow — When We GET the LB and When We Don’t

## Why we didn’t store IDs before (and why the modal doesn’t add loading)

When the Edit modal opens, it **already** fetches details (listeners, pools, monitor) via `loadbalancerDetails?id=${lbId}`. That’s one call that returns the loadbalancer plus nested listeners/pools; the health monitor is derived from the same or a similar flow. So:

- **No extra loading or blocking:** We’re not adding new requests. We just started **storing** `listenerId`, `poolId`, `healthmonitorId` from the **same** response we were already using to fill the form (names, ports, etc.). The only change is putting those IDs into `data` and sending them on Save.
- **Why we didn’t store IDs earlier:** The backend used to **always** call GET loadbalancer before any listener/pool/monitor update, and it got the IDs from that response. So the frontend only needed to send “what to change” (e.g. `listenerName`, `poolName`), not the resource IDs. Storing and sending IDs was added when we optimized the backend to **skip** that GET when the client provides the IDs. So it wasn’t that we couldn’t store them before — we just didn’t need to until we wanted to avoid the extra GET.

## IDs in the URL as well as the body

The update API accepts `listenerId`, `poolId`, and `healthmonitorId` in **either** the request **body** or the **query string**. So the frontend can pass them in the URL (e.g. `.../loadbalancerUpdate?listenerId=...&poolId=...&healthmonitorId=...`) and the backend will use them if the body doesn’t already provide them. That keeps a single contract: “IDs can come from the URL or the body.”

---

## Short answer: do we run GET loadbalancer for any update?

**No.** We only call **GET loadbalancer** when we need listener/pool/monitor IDs and they are **not** all present in the request payload. In the normal case (Edit modal in the UI), the frontend sends those IDs, so we **do not** run GET loadbalancer.

---

## 1. High-level decision tree

```
Update request arrives
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│ Only LB-level fields? (name, description, admin_state_up)           │
│ No listener / pool / monitor / members in payload                  │
└───────────────────────────────────────────────────────────────────┘
        │ YES → doNested = false
        │       • No GET loadbalancer
        │       • Single PUT loadbalancer
        │
        ▼ NO (we have listener/pool/monitor/members)
        │
        │ doNested = true. We need listener/pool/monitor IDs.
        │
        ├─ FAST PATH (single section): listener only / pool only / monitor only
        │       • Uses payload.listenerId, payload.poolId, payload.healthmonitorId
        │       • No GET loadbalancer
        │       • Pool-only may do: GET pool members (light) + PUT pool + member sync
        │
        └─ FULL PATH (multi-section or not “single”)
                │
                │ canSkipGet = we have every ID we need in the payload:
                │   • listener update? → need payload.listenerId
                │   • pool/monitor/members? → need payload.poolId
                │   • monitor update? → need payload.healthmonitorId
                │
                ├─ canSkipGet = true (IDs in payload)
                │       • No GET loadbalancer
                │       • resolvedLisId / resolvedPoolId / resolvedHmId from payload
                │       • Run listener/pool/monitor/member PUTs (and member GET when needed)
                │
                └─ canSkipGet = false (missing at least one ID)
                        • GET loadbalancer
                        • Optionally GET listeners / GET pools / GET pool (for healthmonitor_id)
                        • resolved* IDs from API response
                        • Same listener/pool/monitor/member logic
```

So: **GET loadbalancer runs only when `doNested` is true and `canSkipGet` is false** (i.e. we need nested IDs and the payload doesn’t supply them all).

---

## 2. When does the frontend have the IDs?

The **Edit Load Balancer** modal is the main source of update requests. It:

1. Opens with the LB (you already have `lb.id`).
2. Calls `Api.listListeners(lb.id)`, `Api.listPools(lb.id)`, `Api.getHealthMonitor(lb.id)` and gets **details** (including listener/pool/monitor objects with `id`).
3. In `useEffect`, when `details` is set, it merges into `data`:
   - `details.listeners[0].id` → `data.listenerId`
   - `details.pools[0].id` → `data.poolId`
   - `details.monitor.id` → `data.healthmonitorId`
4. On **Save**, it sends `Api.updateLoadBalancer(lb.id, { ...data, updatedSections })`, so the payload includes `listenerId`, `poolId`, `healthmonitorId` whenever the modal had listeners, pools, and a monitor.

So for the normal Edit flow:

- **Listener/pool/monitor IDs are stored in `data` and sent with every save** once the form is shown.
- The Edit modal shows a **loading spinner** until details have finished loading. The user cannot click Save until the form is shown, so by the time they can save, details (and IDs) are already in state. **For the UI flow, the backend always receives the IDs** and does not need to call GET loadbalancer.

---

## 3. When might the backend NOT get the IDs?

For the **Edit modal**, the user can’t save before data loads (loading UI blocks the form), so when they click Save the frontend always has and sends the IDs. GET loadbalancer is only needed in these cases:

| Scenario | Why IDs can be missing | Backend behavior |
|----------|------------------------|-------------------|
| **API / script / other client** | A client other than the Edit modal (e.g. curl, script, or another UI) calls the update API without sending `listenerId`, `poolId`, `healthmonitorId`. | Backend uses GET loadbalancer to resolve IDs. |
| **LB has no listener / pool / monitor** | The LB doesn’t have that resource yet (e.g. no monitor). Frontend doesn’t set that ID. | Backend may need GET to discover the resource is missing, or the update logic simply skips that section when the ID is absent. |
| **Different entry point** | Some other screen or flow opens an “edit” form that doesn’t load listener/pool/monitor details or doesn’t pass IDs in the payload. | Again, missing IDs → `canSkipGet` false → GET loadbalancer. |

So: **whenever the request needs listener/pool/monitor IDs and doesn’t send them all, we run GET loadbalancer** (and any extra GETs needed to fill in listener/pool/healthmonitor IDs).

---

## 4. Summary table

| Update type | GET loadbalancer? | Why |
|-------------|-------------------|-----|
| **LB only** (name, description, admin_state_up) | **No** | We only need `lbId` (in URL); no nested IDs. |
| **Listener / pool / monitor / members** with **all IDs in payload** (normal Edit modal after details loaded) | **No** | We use `payload.listenerId`, `payload.poolId`, `payload.healthmonitorId`. |
| **Listener / pool / monitor / members** with **any ID missing** (e.g. API/script that doesn’t send IDs, or LB missing that resource) | **Yes** | We need to resolve IDs; GET loadbalancer (and optional GET listeners/pools/pool) is used. |

So we do **not** run GET loadbalancer for every update — only when we’re doing nested updates and the payload doesn’t already contain the required IDs.
