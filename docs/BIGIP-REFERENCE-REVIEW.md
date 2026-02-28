# BigIP Load Balancer Plugin – Reference Review for Octavia Integration

This document summarizes the **morpheus-bigip-loadbalancer-plugin** (reference at `example plugin/morpheus-bigip-loadbalancer-plugin`) as the implementation reference for the Octavia Load Balancer integration. Use it alongside **docs/LOADBALANCER-INTEGRATION.md** and **.agent/knowledge/reference-plugin-patterns.md**.

---

## 1. Plugin layout and registration

**Path:** `example plugin/morpheus-bigip-loadbalancer-plugin/morpheus-bigip-loadbalancer-plugin/`

| File | Purpose |
|------|---------|
| `BigIpPlugin.groovy` | Entry point; registers **LoadBalancerProvider** and **OptionSourceProvider** via `pluginProviders.put()`. No controllers. |
| `BigIpProvider.groovy` | Implements **LoadBalancerProvider** (~4700 lines): types, option types, validate, refresh, all CRUD and addInstance/removeInstance. |
| `BigIpOptionSourceProvider.groovy` | **OptionSourceProvider** with `getMethodNames()` listing 19 option-source methods (partitions, pools, nodes, monitors, balance modes, etc.). |
| `BigIpUtility.groovy` | Constants (BALANCE_MODE, protocols, etc.) and helpers (category, externalId parsing). |
| `sync/BigIPEntitySync.groovy` | Abstract base: `loadBalancer`, `morpheusContext`, `plugin`, `shouldExecute()`. |
| `sync/PoolSync.groovy`, `NodesSync.groovy`, `HealthMonitorSync.groovy`, etc. | Per-entity sync using **SyncTask**; called from `refresh()` in dependency order. |

**Registration (BigIpPlugin.initialize()):**
```groovy
BigIpProvider bigipProvider = new BigIpProvider(this, morpheus)
BigIpOptionSourceProvider bigIpOptionSourceProvider = new BigIpOptionSourceProvider(this, morpheus)
this.pluginProviders.put(bigipProvider.code, bigipProvider)
this.pluginProviders.put(bigIpOptionSourceProvider.code, bigIpOptionSourceProvider)
this.setName("BigIp")
```
- Provider **code** is used as the load balancer type code (`BigIpProvider.PROVIDER_CODE = 'bigip'`).
- No `controllers.add()` in BigIP; the plugin is LB-only (no custom tab/controller).

---

## 2. LoadBalancerProvider – core methods

### 2.1 Identity and metadata
- **getCode()** → `PROVIDER_CODE` (e.g. `'bigip'`); use `'octavia'` for Octavia.
- **getName()**, **getDescription()**, **getIcon()** – display in “Add integration” and lists.

### 2.2 getOptionTypes()
Returns **Collection&lt;OptionType&gt;** for the “Add Load Balancer Integration” form. BigIP uses:
- **Host** (sshHost), **Port** (apiPort), **Credentials** (CREDENTIAL), **Username**, **Password**.
- `fieldContext: 'domain'` or `'credential'`.
- `code` unique per field (e.g. `plugin.bigip.host`).

For Octavia you’d have: Keystone URL, Octavia base URL, Neutron base URL, Cloud (or tenant/project mapping), Credentials (or username/password), etc.

### 2.3 getLoadBalancerTypes()
Returns **Collection&lt;NetworkLoadBalancerType&gt;** (single type in BigIP). The type drives:
- **Capability flags:** `hasVirtualServers`, `hasPools`, `hasNodes`, `hasMonitors`, `creatable`, `editable`, `removable`, `createVirtualServers`, `createPools`, `createNodes`, `createMonitors`, `createPricePlans`, `supportsCerts`, `supportsSticky`, `supportsBalancing`, `supportsVip`, etc.
- **Option type sets:** `optionTypes` (integration form), `vipOptionTypes`, `poolOptionTypes`, `nodeOptionTypes`, `monitorOptionTypes`, `instanceOptionTypes`, and optionally `policyOptionTypes`, `profileOptionTypes`, etc.
- **Other:** `createType: 'multi'`, `format: 'external'`, `viewSet`, `nameEditable`, etc.

Set only what Octavia supports (e.g. no F5-specific policies/scripts/profiles unless you map L7 policies).

### 2.4 validate(NetworkLoadBalancer, Map opts)
- Resolve API URL from load balancer config (e.g. `getApiUrl(loadBalancer)`).
- **Connection:** e.g. `ConnectionUtils.testHostConnectivity(apiHost, apiPort, ...)`.
- **Auth:** call `getConnectionBase(loadBalancer)` and ensure `authToken` (or equivalent) is obtained.
- Return **ServiceResponse** with success/errors; used when user clicks “Validate” or on save.

### 2.5 initializeLoadBalancer(NetworkLoadBalancer, Map opts)
- BigIP returns `null` (optional).
- Use for: initial auth check, one-time setup, or first sync.

### 2.6 refresh(NetworkLoadBalancer)
- **Connectivity:** same as validate (host + auth).
- **Sync order:** run sync classes in dependency order, e.g.:
  1. PartitionSync (if applicable)
  2. NodesSync
  3. HealthMonitorSync
  4. PoolSync (may depend on nodes/monitors)
  5. PolicySync, ProfileSync, CertificateSync, PersistenceSync, IRuleSync (F5-specific)
  6. InstanceSync (virtual servers)
- **Status:** on success `morpheusContext.async.loadBalancer.updateLoadBalancerStatus(loadBalancer, 'ok', null)` and `clearLoadBalancerAlarm`; on failure `updateLoadBalancerStatus(loadBalancer, 'offline', msg)`.
- Return **ServiceResponse**.

For Octavia: no partitions; sync order could be LBs → Listeners (virtual servers) → Pools → Members (nodes) → Monitors. Reuse or extend your existing **OctaviaLoadBalancerSync** and add listener/pool/member/monitor sync.

---

## 3. Connection and API pattern

### getConnectionBase(NetworkLoadBalancer lb, Map opts = null)
- Ensures credentials loaded: `morpheus.async.loadBalancer.loadLoadBalancerCredentials(lb)` if needed.
- Builds map: `url`, `path`, `username`, `password`, `authToken` (from opts or getAuthToken).
- **Octavia:** You already have **OctaviaAuthService** (Keystone token, loadBalancerApi, networkApi). For the provider, resolve cloud/tenant from the **NetworkLoadBalancer** (e.g. from option types or linked cloud/group) and call your auth service to get token + endpoints.

### getApiUrl(NetworkLoadBalancer)
- Used for validation and logging; e.g. `'https://' + loadBalancer.sshHost + ':' + loadBalancer.apiPort + '/mgmt'`.

### callApi(Map params, String method)
- Adds auth (e.g. `X-F5-Auth-Token`), uses **HttpApiClient**, handles body/query params.
- **Octavia:** You already use **OctaviaApiClient** and **OctaviaNetworkingService**; the provider will call your existing services (OctaviaLoadBalancerService, OctaviaPoolService, etc.) rather than a generic callApi.

---

## 4. Sync pattern (SyncTask)

**BigIPEntitySync:**
- Holds `loadBalancer`, `morpheusContext`, `plugin`.
- **shouldExecute():** check load balancer still exists (e.g. `morpheusContext.async.loadBalancer.getLoadBalancerById(loadBalancer.id).blockingGet()`).

**PoolSync (example):**
- **Domain source:** `svc.listSyncProjections(loadBalancer.id)` (Observable).
- **API source:** `plugin.provider.listPools(loadBalancer)` → list of maps (e.g. `fullPath`, `name`, …).
- **SyncTask&lt;Projection, Map, Entity&gt;:**
  - `addMatchFunction { domainItem, cloudItem -> domainItem.externalId == cloudItem.fullPath }`
  - `withLoadObjectDetails` to load full entities for updates.
  - **onAdd:** build `NetworkLoadBalancerPool` (and sync members if needed); `svc.create(adds).blockingGet()`.
  - **onUpdate:** compare and update (BigIP leaves empty in the snippet).
  - **onDelete:** `svc.remove(removeItems).blockingGet()`.
- **start()** to run.

For Octavia:
- **List methods:** e.g. `listLoadBalancers`, `listListeners`, `listPools`, `listMembers`, `listHealthMonitors` (you have these in OctaviaLoadBalancerService / OctaviaPoolService).
- **Match:** e.g. `existing.externalId == apiItem.id` (Octavia UUIDs).
- Create Morpheus entities (NetworkLoadBalancerInstance for listeners, NetworkLoadBalancerPool, NetworkLoadBalancerNode, NetworkLoadBalancerMonitor) with correct `externalId` and category/internalId as needed.

---

## 5. CRUD and instance lifecycle

### createLoadBalancerVirtualServer(NetworkLoadBalancerInstance)
- Build config from `loadBalancerInstance` and `getConfigMap()` (name, protocol, port, destination, pool, policies, profiles, persistence, etc.).
- Call internal `createVirtualServer(virtualServerConfig)` → F5 API.
- Set `loadBalancerInstance.externalId = results.virtualServer?.fullPath`.
- Return **ServiceResponse** with success/data/errors.

**Octavia:** Map to Octavia **Listener** (and optionally default pool). Use **OctaviaLoadBalancerService** (or equivalent) to create listener; set `externalId` to listener id.

### createLoadBalancerPool(NetworkLoadBalancerPool)
- Build config (name, port, description, partition, loadBalancingMode, monitors).
- Call internal `createPool(poolConfig)`; then if `pool.members`, call `addPoolMembers`.
- Set `pool.externalId = results.pool?.fullPath`.
- Return **ServiceResponse**.

**Octavia:** Map to Octavia pool (algorithm, protocol); then create members via pool member API.

### createLoadBalancerNode(NetworkLoadBalancerNode)
- Create “node” on device (F5 node), then associate to pool if needed.
**Octavia:** Map to pool member (address, protocol_port, weight, etc.).

### createLoadBalancerHealthMonitor(NetworkLoadBalancerMonitor)
- Build monitor config (type, delay, timeout, etc.); call F5 create monitor.
**Octavia:** Map to Octavia health monitor (type, delay, timeout, max_retries, url_path, expected_codes, etc.).

### addInstance(NetworkLoadBalancerInstance)
- **Input:** Morpheus instance (and optionally server group) attached to this “virtual server” config.
- BigIP: create health monitor (if not shared), create nodes (servers), create pool, create virtual server (VIP), attach policy, profiles, etc. Uses `loadBalancerInstance.configMap.options`, `vipAddress`, `vipPort`, `vipBalance`, `servicePort`, `partition`, etc.
- Return **ServiceResponse**.

**Octavia:** Resolve instance IP (and port from config); create or find listener/pool and add member (or create LB + listener + pool + member). Reuse your existing “add instance as pool member” logic where applicable.

### removeInstance(NetworkLoadBalancerInstance)
- Tear down virtual server (or policy), pool, nodes, monitor as appropriate. BigIP has overloads for Instance vs ServerGroup.
**Octavia:** Remove member from pool; optionally delete listener/pool if no longer used.

---

## 6. OptionSourceProvider (BigIpOptionSourceProvider)

- **getMethodNames():** returns list of method names (e.g. `bigIpPluginPartitions`, `bigIpPluginBalanceModes`, `bigIpPluginNodes`, …). These are referenced in **OptionType** `optionSource` (e.g. `optionSource:'bigIpPluginPartitions'`).
- **Per-method:** accept `params` (or first element if array); resolve `loadBalancerId` from `params.domain.loadBalancerId` or `params.loadBalancer.id`, etc. Return list of `[name:, value:]` for dropdowns.
- **Static:** e.g. `BigIpUtility.BALANCE_MODE`.
- **Dynamic:** e.g. `partitionSvc.listSyncProjections(loadBalancerId, category).blockingSubscribe { options << [name: it.name, value: it.name] }`.

For Octavia’s **native** LB UI (Infrastructure > Load Balancers), option sources may be used for dropdowns in virtual server/pool/node/monitor forms. Your **network-tab** UI already uses **PluginController** for optionSubnets etc.; the provider’s option types can use option sources that call Morpheus services (and optionally your backend) for lists scoped to the selected load balancer/cloud.

---

## 7. What to copy vs adapt for Octavia

| Aspect | Copy from BigIP | Adapt for Octavia |
|--------|------------------|-------------------|
| Plugin registration | `pluginProviders.put(provider.code, provider)` | Add **OctaviaLoadBalancerProvider** alongside existing tab + option source + controller. |
| getLoadBalancerTypes() | Structure of NetworkLoadBalancerType, capability flags, option type refs | Single type `code: 'octavia'`; flags for virtual servers, pools, nodes, monitors; no F5 policies/scripts/profiles unless you map L7. |
| getOptionTypes() | OptionType list for “Add integration” | Keystone URL, Octavia URL, Neutron URL, Cloud, Credentials (or user/pass). |
| validate / refresh | Connectivity + auth then sync order + status update | Use OctaviaAuthService + existing services; sync LBs then listeners, pools, members, monitors. |
| getConnectionBase / callApi | Pattern (credentials, token, single client) | Use **OctaviaAuthService** and **OctaviaApiClient** / **OctaviaNetworkingService**; no F5 token. |
| Sync classes | SyncTask + match by externalId + onAdd/onUpdate/onDelete | Match by Octavia UUID; reuse **OctaviaLoadBalancerSync**; add ListenerSync, PoolSync, MemberSync, MonitorSync. |
| createLoadBalancer* | Build config from Morpheus model, call device API, set externalId | Map to Octavia listener/pool/member/monitor APIs; use existing Octavia*Service methods. |
| addInstance / removeInstance | Create VIP + pool + nodes + monitor; tear down | Add/remove pool member (and optionally create/delete listener/pool); use instance IP/port from config. |
| OptionSourceProvider | getMethodNames() + methods returning [name, value] | Optional for native LB forms; can reuse or mirror your existing option endpoints for cloud/subnet/instance. |

---

## 8. File reference (BigIP)

- **Plugin:** `BigIpPlugin.groovy`
- **Provider:** `BigIpProvider.groovy` (PROVIDER_CODE, getOptionTypes, getLoadBalancerTypes, validate, initializeLoadBalancer, refresh, getConnectionBase, getApiUrl, getAuthToken, callApi, list* methods, createLoadBalancer*, delete*, addInstance, removeInstance)
- **Option source:** `BigIpOptionSourceProvider.groovy`
- **Sync base:** `sync/BigIPEntitySync.groovy`
- **Sync:** `sync/PoolSync.groovy`, `sync/NodesSync.groovy`, `sync/HealthMonitorSync.groovy`, `sync/InstanceSync.groovy`, etc.
- **Utility:** `util/BigIpUtility.groovy`

Use this review together with **docs/LOADBALANCER-INTEGRATION.md** and **.agent/knowledge/important-to-knows.md** when implementing **OctaviaLoadBalancerProvider** and related sync/CRUD.
