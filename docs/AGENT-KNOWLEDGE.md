# Octavia Load Balancer Plugin – Agent Knowledge & Best Practices

This document captures conventions, gotchas, bugs we fixed, and rules learned while building the plugin. Use it for onboarding, code review, and AI/agent context.

---

## 1. Project overview

- **What it is:** A Morpheus UI plugin that manages OpenStack Octavia load balancers from a Network detail tab (and optionally Instance tab). It talks to Octavia (LB API) and Neutron (networking: subnets, floating IPs).
- **Stack:** Groovy backend (Morpheus plugin API), React JSX frontend (no build step; assets compiled by Gradle), OpenStack Keystone + Octavia + Neutron APIs.
- **Key entry:** `CustomOctaviaLoadBalancerUiPlugin.groovy` registers providers and `OctaviaController`; UI is rendered by `OctaviaNetworkTabProvider` / `OctaviaInstanceTabProvider`.

---

## 2. Backend conventions

### 2.1 Context and auth

- **Network scope:** Most operations are scoped by `networkId` (Morpheus network ID). `resolveContext(model)` turns that into `cloud`, `pool`, `project`, `network`, and **tenantName** = `pool?.externalId ?: pool?.name` (OpenStack project/tenant).
- **Auth:** `OctaviaAuthService.getAuthToken(cloud, tenantName)` returns `token`, `loadBalancerApi`, `networkApi`. Cache key is `"${cloud.id}:${tenantName}"`. Use **loadBalancerApi** for Octavia, **networkApi** for Neutron (floating IPs, subnets).
- **Never** assume `Cloud` type is on the classpath in the controller; use `def` for cloud parameters in private methods to avoid compilation errors.

### 2.2 API clients

- **OctaviaApiClient:** baseUrl = Octavia endpoint, used for `/v2.0/lbaas/loadbalancers`, listeners, pools, members, health monitors.
- **OctaviaNetworkingService** uses the **same** `OctaviaApiClient` but with **networkApi** as baseUrl (Neutron). So Neutron calls are `GET/PUT/POST /v2.0/floatingips`, `GET /v2.0/subnets/{id}`.
- All API calls use `X-Auth-Token` from Keystone; no separate API keys.

### 2.3 Subnet and VIP display

- **Octavia** only returns `vip_subnet_id` (UUID). It does **not** return subnet name or CIDR.
- To show "SubnetName (CIDR)" in the **edit** modal, the backend must resolve the UUID via **Neutron**: `GET /v2.0/subnets/{subnet_id}` → use `name` and `cidr`. Do this in **loadbalancerDetails** only (not in list), to avoid blocking the list endpoint.
- **Create** wizard uses Morpheus `optionSubnets` (from `optionSubnets` endpoint); that returns name/value/cidr from the Morpheus network context. Do **not** change create to use Neutron for subnets; create stays Morpheus-based.

### 2.4 Floating IPs

- Floating IPs are **Neutron** resources. To detach: `PUT /v2.0/floatingips/{id}` with body `{"floatingip": {"port_id": null}}`. There is no separate "release" in that step; the IP stays in the project for reuse.
- **Always** disassociate any floating IP from the LB’s VIP port **before** calling Octavia’s cascade delete on the load balancer. Otherwise the floating IP is left orphaned (still allocated, no port). Do this in `loadbalancersDelete` before `lbService.delete()`.

### 2.5 Sync to Morpheus DB

- `OctaviaLoadBalancerSync` writes to Morpheus `NetworkLoadBalancer` (via `morpheus.async.loadBalancer.create/save/remove`). Match key is `existing.externalId == apiItem.id` (Octavia LB UUID). `internalId` is set to `tenantName` for filtering.
- Sync runs: (1) in background after list, (2) synchronously after create, (3) synchronously after delete. Do **not** add Neutron subnet lookups inside the list sync path; it would block the UI.

---

## 3. Frontend conventions

### 3.1 Data flow

- **List:** `Api.listLoadBalancers({ networkId })` → controller returns `loadbalancers` (with `vip_subnet_id` but not `vip_subnet_display` in list). Table shows NAME, VIP, DESCRIPTION, STATUS, OPERATING, MEMBERS, ACTIONS.
- **Create:** Wizard collects data; `Api.createLoadBalancer(data)` POSTs to `loadbalancersCreate`. Payload uses `vipSubnetId`, `vipAddress` (optional), `name`, listener/pool/monitor/members nested as per Octavia single-call create.
- **Edit:** Modal opens with `lb` from list; details (listeners, pools, members, monitor) loaded via `listListeners`, `listPools`, `getHealthMonitor`. VIP subnet **display** comes from details response `vip_subnet_display` (backend resolved via Neutron). Show it in a read-only field; no dropdown.

### 3.2 Create vs edit

- **Create:** Subnet is a **dropdown** from `optionSubnets` (Morpheus). VIP address is optional (auto-assign); if provided, must be a valid IP, never null or the string `"None"`.
- **Edit:** Subnet and VIP are **read-only**; no changing subnet or VIP in edit. Only name, description, admin state, listener/pool/monitor/members are editable.

### 3.3 Members (pool members)

- **Same IP + port** cannot be used as a pool member on more than one load balancer at once. If the user gets "None does not appear to be an IPv4 or IPv6 address", it’s often because that IP:port is already in use on another LB. **Hint:** suggest trying a different port for that member or removing it from the other LB. Show this hint in both **Create** wizard and **Edit** modal when the error matches and the form has members.
- Member list in the edit modal comes from the pool’s `members` in the details response; the UI can add/remove members and save. Backend update must send a valid member list to Octavia (address + protocol_port; no null/empty address).

### 3.4 Styling and UX

- **Cog button** (actions dropdown): use same classes as edit/delete (`btn btn-sm btn-link btn-link-icon`). Default color black; blue only on hover. Override in CSS (e.g. `.btn-link.btn-link-icon`) so the cog isn’t always blue.
- **Delete confirmation:** Use `{' '}` in JSX between "delete" and the LB name so the space isn’t stripped by minification: `Are you sure you want to delete{' '}<strong>{lb.name}</strong>?`
- **Modals:** No tampering with create wizard subnet or create flow when adding edit-only or list-only features.

---

## 4. Bugs we hit and fixes

| Bug | Cause | Fix |
|-----|--------|-----|
| VIP Subnet shows UUID in edit modal instead of "Name (CIDR)" | Edit modal had no subnet name; Octavia only returns `vip_subnet_id`. Morpheus optionSubnets weren’t matching. | Backend: call Neutron `GET /v2.0/subnets/{id}` in **loadbalancerDetails**, set `vip_subnet_display` on the LB. Frontend: show `data.vip_subnet_display \|\| data.vip_subnet_id` in edit only. Do **not** do Neutron subnet lookup in list (keeps list fast). |
| Cog icon always blue, no hover change | Button had inline blue color; no CSS override. | Use `btn-link btn-link-icon` and add CSS: default color black, hover/focus blue. |
| "deletetest1 edit" (no space) in delete modal | Minifier removed space between text and `<strong>`. | Use JSX `{' '}` between "delete" and `<strong>{lb.name}</strong>`. |
| List response missing `vip_subnet_id` | Controller mapped list items but didn’t include `vip_subnet_id`. | Add `vip_subnet_id: lb.vip_subnet_id` to the list response map (for edit modal’s initial data). |
| Floating IP orphaned when deleting LB | Delete only called Octavia cascade delete; Neutron FIP stayed bound to the deleted port. | In `loadbalancersDelete`, before `lbService.delete()`: get LB, get vip_port_id, find FIP by port_id, call `disassociateFloatingIp` (port_id: null). Log warnings on failure but still proceed with delete. |
| Create fails: "None does not appear to be an IPv4 or IPv6 address" | User had added a member whose IP:port was already used on another LB (or null/empty address). | (1) Don’t send `vip_address` to Octavia when empty or "None". (2) Filter members to valid addresses. (3) When this error appears and form has members, show a hint: same IP+port may be in use on another LB—try a different port or remove from the other LB. Apply same hint in Edit modal on save error. |
| Build fails: Unable to delete directory `build` | Gradle daemon or another process locking files under `build/assets`. | Run `.\gradlew.bat --stop`, then remove `build` (or retry clean). On Windows, avoid holding handles on build output. |

---

## 5. Rules and best practices

### 5.1 Do

- Resolve subnet display (name + CIDR) **only** in the details endpoint; keep list endpoint free of extra Neutron calls.
- Disassociate floating IP before deleting a load balancer when the LB has a VIP port.
- Use the same auth and client pattern for Neutron as for Octavia (token + networkApi); add new Neutron calls in `OctaviaNetworkingService`.
- Show user-friendly hints when Octavia returns the "IPv4 or IPv6 address" error and the form has pool members (suggest port conflict or different port).
- Keep create wizard and create API contract unchanged when adding edit-only or list-only behavior.
- Use `def` for Cloud in controller private methods if `Cloud` type causes compile errors.

### 5.2 Don’t

- Don’t add Neutron subnet (or other heavy) lookups in the list endpoint; it blocks the UI.
- Don’t send `vip_address` to Octavia when it’s null, empty, or the string `"None"`; omit the key for auto-assign.
- Don’t send pool members with null/empty `address` to Octavia.
- Don’t assume Morpheus subnet `value`/`id`/`externalId` match Octavia’s `vip_subnet_id` in the edit modal without backend resolution; use Neutron for display.
- Don’t change create flow or optionSubnets behavior for edit-modal or list features.

### 5.3 Testing and build

- **Build:** `.\gradlew.bat clean shadowJar` (or `jar`). If clean fails, run `.\gradlew.bat --stop` and delete `build` manually.
- **Mock mode:** Controller has an `isMockMode()` check; some endpoints return mock data. Use for UI/dev without OpenStack.
- **Logs:** Controller and services log with `log.info` / `log.warn` / `log.error`; check appliance logs for "Create Load Balancer failed", "loadbalancersDelete", "optionSubnets", etc.

---

## 6. File reference (key files)

| Path | Purpose |
|------|--------|
| `CustomOctaviaLoadBalancerUiPlugin.groovy` | Plugin entry; registers tabs, option source, controller. |
| `OctaviaController.groovy` | Routes and handlers: loadbalancers, loadbalancersCreate, loadbalancersDelete, loadbalancerDetails, loadbalancerUpdate, floatingipAttach, floatingipDetach, optionSubnets, optionProjects, optionInstances, optionFloatingIpPools. |
| `OctaviaLoadBalancerService.groovy` | Octavia API: list, get, create, update, delete (cascade). Builds nested listener/pool/member/monitor payload for create. |
| `OctaviaNetworkingService.groovy` | Neutron: listFloatingIps, associateFloatingIp, disassociateFloatingIp, updateFloatingIp, createFloatingIp, getSubnet. |
| `OctaviaLoadBalancerSync.groovy` | Syncs Octavia LBs to Morpheus NetworkLoadBalancer (create/update/delete by externalId). |
| `OctaviaAuthService.groovy` | Keystone v3 auth; returns token, loadBalancerApi, networkApi; in-memory cache. |
| `MorpheusLookupService.groovy` | Resolves networkId/instanceId to cloud, pool, project, network, subnets. |
| `NetworkView.jsx` | Main tab: list LBs, create wizard, edit modal, delete confirm, floating IP modal. |
| `CreateWizard.jsx` | Multi-step create; submit → createLoadBalancer(data); formatCreateError for IP/member hint. |
| `EditLBModal.jsx` | Edit LB; loads details; shows vip_subnet_display; formatUpdateError for IP/member hint. |
| `WizardSteps.jsx` | Step1_Details (name, vipSubnetId, vipAddress), Step2_Listener, Step3_Pool, Step4_Members, Step5_Monitor. |
| `Api.jsx` | apiFetch, createLoadBalancer, updateLoadBalancer, deleteLoadBalancer, getSubnets, listLoadBalancers, getLoadBalancer, etc. |

---

## 7. Load balancer integration (future)

- Current plugin is a **network-tab** UI; it also syncs LBs to Morpheus `NetworkLoadBalancer` records.
- To appear under **Infrastructure > Load Balancers** as a first-class integration, the codebase would need a **LoadBalancerProvider** implementation (register provider, implement refresh/create/delete and virtual server/pool/node/monitor CRUD).
- **Full guide:** See **docs/LOADBALANCER-INTEGRATION.md** for: features (pricing, sync, tabs), multiple listeners/pools/members, master tenant vs sub-tenant, global configuration, permissions, and BigIP reference. That doc consolidates everything about the integration and what the plugin API supports.

---

*Last updated from agent session; extend this doc as new bugs and patterns are discovered.*
