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

---

## 8. GET loadbalancersFromDb (list from Morpheus DB)

This endpoint returns load balancers from the **Morpheus database** (synced from Octavia). Use the Morpheus base URL and auth (session cookie or API token).

**Tenant scoping (token):**

- **Master tenant:** With no params, returns **all** load balancers across **all tenancies**. Use `accountid` to filter by a specific tenant (e.g. `?accountid=5`).
- **Regular tenant:** With no params, returns only **that tenant’s** LBs. If they pass `accountid` for another tenant, the API returns **error** (access denied). Their token does not allow seeing other tenants’ LBs.

**Query parameters (all optional):**

| Param       | Description |
|------------|--------------|
| **accountid** | Morpheus account id to filter by. **Master only:** allowed to filter by any tenant. **Regular tenant:** ignored or error if different from own account. |
| **cloud**     | Morpheus cloud id (e.g. `cloud=4`) to filter by a single cloud. |
| **network**   | Network **id or name** to derive cloud + project from (also accepts `networkId`). |
| **instance**  | Instance **id or name** to derive cloud + project from (also accepts `instanceId`). |
| **project**   | Resource pool id, pool name, or OpenStack project name (internalId) to filter by. |
| **max**       | Maximum number of LBs to return (reduces load when many LBs per tenancy). Optional. |
| **offset**    | Number of LBs to **skip** before returning the next `max` items (pagination). Optional, default 0. Example: with `max=4`, use `offset=0` for page 1, `offset=4` for page 2, `offset=8` for page 3. |

When **max** is used, the response includes **total** (total count before pagination) so clients can build "Page X of Y". **Names** are supported for `network`, `instance`, and `project` (resolved to ids / tenant name where applicable).

**Base URL:** your Morpheus server, e.g. `https://morpheus.example.com`. Path: `/plugin/octavia1234/loadbalancersFromDb`.

### Authentication: use Bearer token (recommended)

The **recommended** way to call Morpheus APIs is with a **Bearer token** in the `Authorization` header. See [Morpheus API – Authentication](https://apidocs.morpheusdata.com/docs/authentication_doc).

- **Header:** `Authorization: Bearer <your-access-token>`
- Obtain the token from Morpheus (e.g. **Account** → **API** → create an access token, or use the token returned by the login API).

Plugin routes may be served in one of these ways depending on your Morpheus version and deployment:

- **Under `/api/`** (e.g. `/api/plugin/octavia1234/loadbalancersFromDb`): often uses the same token auth as the REST API — use **Bearer token**.
- **Under `/plugin/`** (e.g. `/plugin/octavia1234/loadbalancersFromDb`): some setups use the same session as the UI here, so **Bearer** may work if your instance is configured to accept it for plugin routes; otherwise you may get a redirect to login and need to use a session cookie (see below).

If you get **302 to login** when using Bearer on `/plugin/...`, try the **session cookie** approach below, or ask your Morpheus admin whether plugin endpoints are exposed under a path that accepts API tokens (e.g. `/api/plugin/...`).

### 302 redirect to login when using Bearer token

Many Morpheus setups protect **plugin** routes (`/plugin/...`) with the same **session-based auth** as the web UI. A request with only `Authorization: Bearer <token>` may get **HTTP 302** with `Location: .../login/auth` and no JSON body.

**Session cookie:** If you try the cookie approach, the cookie must be from an **authenticated** session — i.e. copy **JSESSIONID** from the browser **after** you have logged in to Morpheus in that browser. Do **not** use the cookie value from the 302 response body/headers; that is an unauthenticated session and will still redirect to login. Steps:

1. Log in to Morpheus in a browser (e.g. https://console.cloud.mtn.ng).
2. After login, open DevTools → Application (or Storage) → Cookies → select your Morpheus host.
3. Copy the value of **JSESSIONID**.
4. Use that cookie in curl (see examples below).

If plugin routes still return 302 even with an authenticated cookie (e.g. different domain, load balancer, or security policy), API access for plugin endpoints may need to be addressed later (e.g. platform config or proxy to accept Bearer on a dedicated path).

### Example: all LBs (no params)

```bash
export MORPHEUS_URL="https://morpheus.example.com"
export API_TOKEN="your-morpheus-api-token"

# Master tenant: all LBs across all tenancies
# Regular tenant: only that tenant's LBs (all clouds)
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb" | jq .
```

### Example: filter by cloud

```bash
# Only LBs on Morpheus cloud id 4
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?cloud=4" | jq .
```

### Example: by network (id or name)

```bash
# By network id
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?network=274" | jq .

# By network name (human-readable)
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?network=My%20VLAN%20Name" | jq .
```

### Example: by instance (id or name)

```bash
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?instance=12345" | jq .
```

### Example: by project (pool id, pool name, or OpenStack project name)

```bash
# OpenStack project name (internalId)
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?project=MTNNG_MASTER_TENANT" | jq .

# Resource pool id (e.g. 5)
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?project=5" | jq .
```

### Example: combine filters (cloud + project)

```bash
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?cloud=4&project=MTNNG_MASTER_TENANT" | jq .
```

### Example: with session cookie (use when Bearer returns 302)

**Bash (Linux/macOS):**
```bash
curl -k -s -X GET \
  -H "Cookie: JSESSIONID=your-jsessionid-value" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb" | jq .
```

**Windows CMD** (e.g. for https://console.cloud.mtn.ng):
```cmd
set MORPHEUS_URL=https://console.cloud.mtn.ng
set COOKIE=JSESSIONID=your-jsessionid-value

curl -k -s -X GET -H "Cookie: %COOKIE%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancersFromDb"
```

Replace `your-jsessionid-value` with the cookie value from the browser after logging in. If your Morpheus uses a different cookie name (e.g. `PHPSESSID`), use that instead of `JSESSIONID`.

### Example: master tenant filtering by tenant (accountid)

```bash
# Only LBs belonging to account/tenant id 5
curl -k -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Accept: application/json" \
  "$MORPHEUS_URL/plugin/octavia1234/loadbalancersFromDb?accountid=5" | jq .
```

**Response:** `{ "loadbalancers": [ ... ] }`. If the user is **not** master and passes `accountid` for another tenant, response is `{ "success": false, "loadbalancers": [], "error": "Access denied: you can only list load balancers for your own tenant" }`. If account context is missing: `{ "success": false, "error": "Account context required for tenant scoping" }`.

---

## 9. Windows CMD — curl examples (copy-paste)

Use **Bearer token** when your Morpheus accepts it for plugin routes. If you get a 302 redirect, use the **session cookie** block instead.

**Set variables (edit values):**
```cmd
set MORPHEUS_URL=https://console.cloud.mtn.ng
set API_TOKEN=your-morpheus-access-token
set NETWORK_ID=274
set COOKIE=JSESSIONID=your-jsessionid-value
```

**List LBs from plugin (Octavia list) — requires network or instance context:**
```cmd
curl -k -s -X GET -H "Authorization: Bearer %API_TOKEN%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancers?networkId=%NETWORK_ID%"
```

**List LBs from plugin with pagination (max and offset):**
```cmd
curl -k -s -X GET -H "Authorization: Bearer %API_TOKEN%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancers?networkId=%NETWORK_ID%&max=4&offset=0"
```

**List LBs from DB (loadbalancersFromDb) — no params:**
```cmd
curl -k -s -X GET -H "Authorization: Bearer %API_TOKEN%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancersFromDb"
```

**List LBs from DB with pagination (max and offset):**
```cmd
curl -k -s -X GET -H "Authorization: Bearer %API_TOKEN%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancersFromDb?max=4&offset=0"
```

**List LBs from DB filtered by cloud:**
```cmd
curl -k -s -X GET -H "Authorization: Bearer %API_TOKEN%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancersFromDb?cloud=4"
```

**List LBs from DB filtered by account (master tenant only):**
```cmd
curl -k -s -X GET -H "Authorization: Bearer %API_TOKEN%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancersFromDb?accountid=5"
```

**If Bearer returns 302 — use session cookie instead:**
```cmd
curl -k -s -X GET -H "Cookie: %COOKIE%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancersFromDb"
```

**With pagination (cookie):**
```cmd
curl -k -s -X GET -H "Cookie: %COOKIE%" -H "Accept: application/json" "%MORPHEUS_URL%/plugin/octavia1234/loadbalancersFromDb?max=4&offset=0"
```

Remove `-s` from curl if you want to see progress; append `| more` or redirect to a file if the response is large.
