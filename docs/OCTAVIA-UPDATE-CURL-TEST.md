# Manual curl test for load balancer update

Use these curls to reproduce what the plugin’s **loadbalancerUpdate** flow does. That way you can tell whether the failure is from our code or from Octavia (e.g. LB not ACTIVE).

**Root cause of the error:** Octavia returns **409** with *"Load Balancer ... is immutable and cannot be updated"* when the load balancer’s **provisioning_status** is not **ACTIVE** (e.g. ERROR, PENDING_UPDATE, PENDING_CREATE). So listener/pool/healthmonitor PUTs are rejected by OpenStack until the LB is ACTIVE. Our code turns that into the message you see.

All curl commands below use **`-k`** to allow insecure SSL (skip certificate verification), for use with self-signed or internal certs.

---

## 1. Set variables

```bash
# From your Morpheus cloud config: Octavia (load balancer) API base URL, no trailing slash
export OCTAVIA_URL="https://octavia.cloud-1.ict.mtn.com.ng:9876"

# Keystone token (e.g. from Morpheus or openstack token issue)
export TOKEN="gAAAAABppY6rB458VpLz3kxuFtFB4G38nlKvE-0tCP994jIrYwIGKK3NGHuwLIg0nxDX33wxfC_WSoxGqaMKbSNuo0w-Fmw9THmJMyqUenSs4fWzU4ooajX9FLzoo2NRCp6vCiBko-ahGKMJA72Sipj-zQ9VBma4daFv-FShQ-ftz8mjMX5HvEM"

# Load balancer ID (the one that fails in the UI)
export LB_ID="a4926f19-b788-4877-aafb-9c188c7f53f3"
```

---

## 2. Check load balancer status (do this first)

If **provisioning_status** is not `ACTIVE`, Octavia will reject listener/pool/monitor updates.

```bash
curl -k -s -X GET \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  "$OCTAVIA_URL/v2.0/lbaas/loadbalancers/$LB_ID" | jq .
```

Check: `.provisioning_status` and `.operating_status`. Only when `provisioning_status == "ACTIVE"` will listener/pool/monitor PUTs succeed.

---

## 3. Get listener and pool IDs (needed for update curls)

**Listeners by load balancer:**

```bash
curl -k -s -X GET \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  "$OCTAVIA_URL/v2.0/lbaas/listeners?loadbalancer_id=$LB_ID" | jq .
```

Pick the first listener `id` → set `LISTENER_ID`.

**Pools by load balancer:**

```bash
curl -k -s -X GET \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  "$OCTAVIA_URL/v2.0/lbaas/pools?loadbalancer_id=$LB_ID" | jq .
```

Pick the first pool `id` → set `POOL_ID`. If you need the health monitor ID, get pool details:

```bash
export POOL_ID="<from above>"
curl -k -s -X GET \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  "$OCTAVIA_URL/v2.0/lbaas/pools/$POOL_ID" | jq .
```

Set `HM_ID` from `.healthmonitor_id` (if present).

---

## 4. Update calls (same as the plugin)

**4a. Update load balancer (name/description/admin_state_up)**  
*(Octavia may still return 409 “immutable” if the LB is not ACTIVE; our code ignores that and continues to listener/pool.)*

```bash
curl -k -s -w "\nHTTP_CODE:%{http_code}\n" -X PUT \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"loadbalancer":{"description":"Updated via curl"}}' \
  "$OCTAVIA_URL/v2.0/lbaas/loadbalancers/$LB_ID"
```

**4b. Update listener**  
*(This is the one that returns 409 when LB is not ACTIVE.)*

```bash
export LISTENER_ID="<from step 3>"

curl -k -s -w "\nHTTP_CODE:%{http_code}\n" -X PUT \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"listener":{"name":"my-listener-updated","connection_limit":100}}' \
  "$OCTAVIA_URL/v2.0/lbaas/listeners/$LISTENER_ID"
```

**4c. Update pool**

```bash
curl -k -s -w "\nHTTP_CODE:%{http_code}\n" -X PUT \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pool":{"name":"my-pool-updated","description":"Updated via curl"}}' \
  "$OCTAVIA_URL/v2.0/lbaas/pools/$POOL_ID"
```

**4d. Update health monitor** (optional, only if pool has a monitor)

```bash
export HM_ID="<from pool details>"

curl -k -s -w "\nHTTP_CODE:%{http_code}\n" -X PUT \
  -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"healthmonitor":{"delay":10,"timeout":5,"max_retries":3}}' \
  "$OCTAVIA_URL/v2.0/lbaas/healthmonitors/$HM_ID"
```

---

## 5. Path note (v2 vs v2.0)

Our **OctaviaLoadBalancerService.update()** uses **`/v2/lbaas/`** for listener/pool/healthmonitor (lines 233, 237, 261, 281, 297). **OctaviaPoolService** and the rest of the LB service use **`/v2.0/lbaas/`**. If your Octavia deployment only accepts `v2.0`, the update flow may be hitting the wrong path; the curls above use **`/v2.0/lbaas/`** to match the rest of the plugin. If you see 404 on listener/pool/hm, try changing to `/v2/lbaas/` in the plugin for those nested calls.

---

## 6. Curl to your plugin (full stack)

To call your plugin’s update endpoint (same as the UI), use your Morpheus base URL and a session cookie (e.g. from browser after logging in). Replace `YOUR_MORPHEUS_URL` and optionally add `-b "cookie=..."` with your session cookie.

```bash
# Minimal update payload (only listener name change) – same shape as the UI
curl -k -s -w "\nHTTP_CODE:%{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "id": "a4926f19-b788-4877-aafb-9c188c7f53f3",
    "name": "my-lb",
    "listenerName": "my-listener-updated",
    "updatedSections": ["listener"]
  }' \
  "https://console.coud.mtn.ng/plugin/octavia1234/loadbalancerUpdate"
```

If you don’t pass the same context (e.g. `networkId` or `instanceId` in the request so the plugin can resolve cloud/tenant), the plugin may return an error. From the UI it works because the request is made from the network or instance tab and the plugin infers context. For a quick “same as UI” test, use the browser’s Network tab when you click Save in the edit modal, copy the request URL and body, and replay with curl (including the same cookie).

---

## 7. How to interpret the result

- **GET loadbalancer** shows `provisioning_status`. If it is **ERROR** or **PENDING_UPDATE**, fix the LB in OpenStack (e.g. resolve the error, wait for PENDING_UPDATE to finish) until it is **ACTIVE**. Then retry the PUTs.
- If you get **409** on the **listener** or **pool** PUT with “immutable”, the **code is behaving correctly**; Octavia is refusing the update because the LB is not ACTIVE.
- If the **same** PUT works when you run it manually (LB is ACTIVE) but fails from the UI, then the problem is in our code (e.g. wrong path or payload). Use these curls to compare.
