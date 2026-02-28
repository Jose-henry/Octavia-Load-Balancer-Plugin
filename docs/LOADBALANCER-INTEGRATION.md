# Load Balancer Integration – Full Guide

This document describes how to evolve the Octavia plugin into a full **Morpheus Load Balancer integration**: Infrastructure > Load Balancers, pricing, sync, multi-tenant visibility, permissions, and detail tabs (listeners, pools, members). It is based on the Morpheus Plugin API, official docs, and the F5 BigIP integration pattern.

---

## 1. Current state vs. full integration

| Aspect | Current (network tab) | Full integration (LoadBalancerProvider) |
|--------|------------------------|----------------------------------------|
| **Where LBs appear** | Plugin tab on Network detail only | **Infrastructure > Load Balancers** (first-class) |
| **DB records** | We sync `NetworkLoadBalancer` via `OctaviaLoadBalancerSync` | Same; provider tells Morpheus *how* to manage them |
| **Who configures** | User in network context (one cloud/tenant per network) | **Master Tenant** adds integration once (global config); **Sub-tenants** see it and create virtual servers scoped to their tenancy |
| **Pricing** | Not wired | **Load Balancer** and **Load Balancer Virtual Server** price types in Plans & Pricing |
| **Detail UI** | Single edit modal (one listener, one pool, members, monitor) | Native Morpheus LB detail with **tabs**: Virtual Servers (listeners), Pools, Nodes, Monitors, Policies, etc. |
| **Virtual servers** | One listener per LB in our UI | **Multiple virtual servers (listeners)** per LB; each with VIP port, protocol, optional default pool |

---

## 2. Features the load balancer integration already has (platform)

Once you implement a **LoadBalancerProvider**, Morpheus provides the following out of the box (no custom React needed for the main LB UI).

### 2.1 Infrastructure placement and sync

- **Infrastructure > Load Balancers**: List and add integrations by type (e.g. “Octavia”).
- **Add integration**: User fills **OptionTypes** (e.g. API URL, cloud, credentials). Your provider’s `getOptionTypes()` defines these fields.
- **refresh(NetworkLoadBalancer)**: Morpheus calls this to sync state from the provider (e.g. Octavia). You pull LBs (and optionally virtual servers, pools, nodes, monitors) and update Morpheus DB. Can be triggered on a schedule or on demand.
- **initializeLoadBalancer(NetworkLoadBalancer, opts)**: Called when an integration is first added; use for auth check and initial sync.

### 2.2 Virtual servers (listeners), pools, members, monitors

- **Virtual Servers** = in Octavia terms, **Listeners** (VIP + port + protocol). One load balancer can have **multiple** virtual servers (listeners).
- **Pools**: Each pool has balance mode, protocol, **members** (nodes), and optional **health monitor**.
- **Nodes**: Backend members (IP + port); can be created/deleted via provider.
- **Monitors**: Health checks (HTTP, TCP, etc.); create/delete via provider.

Provider methods (from Plugin API):

- `createLoadBalancerVirtualServer` / `deleteLoadBalancerVirtualServer`
- `createLoadBalancerPool` / `deleteLoadBalancerPool`
- `createLoadBalancerNode` / `deleteLoadBalancerNode`
- `createLoadBalancerHealthMonitor` / `deleteLoadBalancerHealthMonitor`
- `addInstance` / `removeInstance` (Morpheus instance → pool member)

Morpheus builds the **detail page** with tabs (Virtual Servers, Pools, Nodes, Monitors, Policies, etc.) from these entities; you implement the CRUD that backs them.

### 2.3 Pricing

- **NetworkLoadBalancerType** has a boolean **createPricePlans**. When true, the type supports **Load Balancer Price Plans** in Administration > Plans & Pricing.
- **Price set types**: “Load Balancer” (base) and “Load Balancer Virtual Server” (per virtual server). Units: minute, hour, day, month, year, etc.
- Price sets can be scoped (e.g. by region, cloud, resource pool). Morpheus uses them for costing and showback.

### 2.4 Capability flags (NetworkLoadBalancerType)

Your provider returns one or more **NetworkLoadBalancerType** from `getLoadBalancerTypes()`. Flags tell Morpheus what the integration supports and what to show:

- **creatable**, **editable**, **removable**: Can add/edit/remove integrations.
- **hasVirtualServers**, **createVirtualServers**: Multiple listeners/virtual servers per LB.
- **hasPools**, **createPools**: Pools with balance mode.
- **hasNodes**, **createNodes**: Pool members (nodes).
- **supportsMonitor**, **createMonitors**: Health monitors.
- **createPolicies**, **createRules**: L7 policies/rules (Octavia supports these).
- **createProfiles**: e.g. SSL/TLS profiles.
- **supportsFloatingIp**, **supportsSticky**, **supportsCerts**, **supportsBalancing**, etc.

Set these to match Octavia’s capabilities so the UI and workflows are correct.

### 2.5 Provisioning wizard and instance-detail integration

With a proper **LoadBalancerProvider**, the same integration participates in **instance provisioning** and in the **native load balancer view on the instance details page**. No extra custom UI is required for these flows.

#### Load balancer in the instance provisioning wizard

- During **Provisioning > Instances > + ADD**, the wizard includes an **Automation** (or similar) section where **Load Balancer** can be configured.
- The **Load Balancer** dropdown lists integrations that are available in the selected cloud/group and visible to the tenant. Once the Octavia type is registered and an Octavia integration is added under Infrastructure > Load Balancers (and assigned to the right groups/tenants), it will appear in this dropdown.
- The user can set **VIP address**, **VIP port**, **VIP hostname**, **balance mode** (e.g. Round Robin, Least Connections), **sticky mode**, **SSL** options, and **backend addressing** (internal/external). These map to creating or using a virtual server (listener) and pool on the load balancer.
- **After the instance is provisioned**, Morpheus calls your provider’s **addInstance(NetworkLoadBalancerInstance)**. Your implementation adds that instance as a **pool member** on the load balancer (e.g. create an Octavia pool member with the instance’s IP and the configured port). So the flow is: user picks an Octavia integration and config in the wizard → instance is created → **addInstance** runs → your provider adds the new VM to the chosen Octavia pool (or creates listener/pool/member as needed).

**Prerequisites for the LB option to show in the wizard:**

- The **Instance Type** must have **“Enable Scaling (Horizontal)”** (or equivalent) enabled.
- The **Node Type** used by that instance must have an **LB port** defined.

If these are not set, the Load Balancer section may not appear or may be empty.

#### Native load balancer view on the instance details page

- On **Provisioning > Instances > [instance]**, Morpheus provides a **Load Balancer** section (or tab). This is the **native** view; it is not built by your plugin.
- It shows **load balancers attached to that instance**: virtual servers, pools, and pool members (nodes) that include this instance. So:
  - **Attached during provisioning**: If the user configured a load balancer in the provisioning wizard, after **addInstance** runs, that LB (and its virtual server/pool) appears here.
  - **Attached from the load balancer side**: If an admin created a virtual server and pool under Infrastructure > Load Balancers and added this instance as a node (or it was added via your provider’s node/instance APIs), that attachment also appears here.
  - **Attached post-provisioning**: Users can **add** a load balancer to an existing instance from this area; Morpheus will again call **addInstance** so your provider can add the instance as a pool member.
- From this view, users can see **status**, **links to virtual servers/services/servers** on the load balancer, and in many cases **remove** the instance from a load balancer (which triggers **removeInstance**).

So with the load balancer integration in place:

- The **provisioning flow** can include “add to Octavia load balancer” and your provider handles it via **addInstance**.
- The **instance details page** shows all LBs attached to that instance (whether they were created from the LB side, during provisioning, or added later) and allows adding/removing attachments; your provider’s **addInstance** / **removeInstance** back that behavior.

No extra plugin UI is required for these flows—Morpheus provides them once the provider is registered and the integration is available to the tenant/group.

---

## 3. Master tenant, global configuration, and sub-tenants

### 3.1 Where the integration is configured

- **Infrastructure > Load Balancers** is where integrations are **added** and listed.
- Adding a load balancer is an **Infrastructure** action. Docs indicate that **“Admin: Integrations”** (or equivalent) permission is typically required to add/edit integrations.
- The integration is configured **once** (e.g. by Master Tenant admin): choose type “Octavia”, set OptionTypes (e.g. Keystone URL, Octavia URL, Neutron URL, cloud, credentials). That creates a **NetworkLoadBalancer** record (or similar) representing the “integration” or “device”.

### 3.2 Tenant and group visibility

- Load balancers can have **tenant and group** visibility:
  - **Public**: visible to all tenants (subject to roles).
  - **Private**: visible only to **selected** tenants.
- **Sub-tenants**:
  - Do **not** see other sub-tenants’ resources.
  - **Can** see Master Tenant resources that are either **public** or **explicitly assigned** to that sub-tenant.
- So: **Master Tenant** adds the Octavia integration and can set it to **public** or assign it to specific **sub-tenants**. Sub-tenants then see that integration and can use it to create **virtual servers (listeners)** and pools **scoped to their tenancy** (e.g. their OpenStack project/tenant).

### 3.3 Scoping virtual servers to tenancy

- Morpheus uses **tenant/account** and **group** on the load balancer and on created resources. When a **sub-tenant** user creates a “virtual server” (listener) via the integration, the provider can:
  - Resolve the **current user’s tenant/account** (and optionally group) from the request/model.
  - Map that to an **OpenStack project/tenant** (e.g. via Morpheus group or tenant metadata, or resource pool).
  - Call Octavia in that project’s scope (same Keystone project scoping you use today with `tenantName`).
- So: one **integration** (one “Octavia” entry in Infrastructure > Load Balancers) can represent the **Octavia/Neutron endpoint**; **virtual servers** created through it are created in the **correct OpenStack project** per tenant/group. Your existing `resolveContext`-by-network can be adapted to resolve by **load balancer + tenant/group** when creating virtual servers from the LB UI.

### 3.4 Groups and roles

- **Groups** define which **clouds** (and by extension which load balancers) a user can see. Clouds are assigned to groups; users get access via **roles** that grant access to groups.
- So: assign the **cloud** (and the load balancer integration, if tied to that cloud) to the right **groups** so that only the intended tenants/groups can see and use the Octavia integration.

---

## 4. Permissions and plugin permissions

### 4.1 Plugin-defined permissions

- The base **Plugin** class has a **permissions** field: a list of **Permission** objects (e.g. code, name, access types). These are **custom permissions** that your plugin introduces.
- In **CustomOctaviaLoadBalancerUiPlugin** you already have something like:
  - `Permission.build('Octavia Load Balancer Integration', 'octavia-loadbalancer', [Permission.AccessType.none, Permission.AccessType.full])`
- These permissions can control **visibility of your UI providers** (e.g. who sees the network tab). They can also be used in **roles** so that “full” is required to add/edit LBs or to see the integration.

### 4.2 Admin: Integrations

- Adding/editing **integrations** (including load balancers) in Infrastructure typically requires an admin-level permission such as **“Admin: Integrations”**. This is a **Morpheus core** permission, not defined by your plugin. Users who will add the Octavia integration need this.

### 4.3 Using your plugin permission for LB actions

- You can **check** the plugin permission in your provider or controller (e.g. via `morpheusContext` or request model) and restrict create/delete/update of load balancers or virtual servers to users with `octavia-loadbalancer` full (or similar). That gives you **global configuration** (who can manage the integration) and **tenant-scoped** use (sub-tenant users create only in their tenant).

---

## 5. How to integrate (implementation outline)

### 5.1 Provider class

- Create a class (e.g. **OctaviaLoadBalancerProvider**) that implements **LoadBalancerProvider**.
- Implement:
  - **getLoadBalancerTypes()**: Return a **NetworkLoadBalancerType** with `code` (e.g. `"octavia"`), `name`, and all capability booleans (hasVirtualServers, createPools, createMonitors, supportsFloatingIp, createPricePlans, etc.).
  - **getOptionTypes()**: Return OptionTypes for “add integration” (e.g. API URLs, cloud, credentials). These are the **global** configuration fields.
  - **getDescription()**, **getIcon()**: For the UI.
  - **refresh(NetworkLoadBalancer)**: Load LBs from Octavia (per tenant/group if multi-tenant), sync to Morpheus (virtual servers, pools, nodes, monitors).
  - **initializeLoadBalancer(NetworkLoadBalancer, Map opts)**: Auth check + initial sync.
  - **addLoadBalancer** / **deleteLoadBalancer**: If you want “Add” in Morpheus to create a new Octavia LB, implement add; otherwise “Add” can only **discover** existing LBs via refresh.
  - **createLoadBalancerVirtualServer** / **deleteLoadBalancerVirtualServer**: Map to Octavia create/delete **listener**.
  - **createLoadBalancerPool** / **deleteLoadBalancerPool**: Map to Octavia pools.
  - **createLoadBalancerNode** / **deleteLoadBalancerNode**: Map to Octavia pool members.
  - **createLoadBalancerHealthMonitor** / **deleteLoadBalancerHealthMonitor**: Map to Octavia health monitors.
  - **addInstance** / **removeInstance**: Map Morpheus instance to Octavia pool member (IP/port from instance).

### 5.2 Registration

- In **CustomOctaviaLoadBalancerUiPlugin.initialize()**, instantiate **OctaviaLoadBalancerProvider** and add it to **pluginProviders** (same way as NetworkTabProvider). Morpheus will discover it as a load balancer type and show it under Infrastructure > Load Balancers.

### 5.3 Reuse existing services

- Reuse **OctaviaAuthService**, **OctaviaLoadBalancerService**, **OctaviaPoolService**, **OctaviaNetworkingService** for all Octavia/Neutron calls. The provider resolves **which** cloud/tenant to use from the **NetworkLoadBalancer** (and optionally from the current user’s tenant/group when creating virtual servers).

### 5.4 Sync and multiple listeners/pools

- **Octavia**: One LB has one VIP and **multiple listeners**. Each listener has protocol, port, optional default pool. Each pool has members and optional health monitor.
- In **refresh()**: For each Octavia LB, fetch listeners, then for each listener create/update a **NetworkLoadBalancerInstance** (virtual server); for each pool create/update **NetworkLoadBalancerPool** and **NetworkLoadBalancerNode** (members). Morpheus will show them in the detail tabs. Map Octavia IDs to Morpheus externalId so updates/deletes work.

### 5.5 Moving easily from current plugin

- **Keep** the existing network-tab UI as-is (create wizard, edit modal, floating IP). It remains useful for **network-scoped** creation and quick edit.
- **Add** the LoadBalancerProvider alongside it. The same **OctaviaLoadBalancerSync** logic (or an extended version) can be used inside **refresh()** to keep **NetworkLoadBalancer** records in sync; the provider adds **virtual server / pool / node / monitor** sync and CRUD.
- **Global configuration**: Stored in the integration record (OptionType values). No need to duplicate; the provider reads from the **NetworkLoadBalancer** (and its type) to get API URLs, cloud, and tenant mapping.

---

## 6. BigIP / F5 reference (what to copy and what not)

- **Pattern**: F5 plugin implements LoadBalancerProvider, registers a load balancer type, implements refresh and CRUD for virtual servers, pools, nodes, monitors, policies, profiles. OptionTypes define host, port, username, password, etc.
- **Copy**: Provider structure, registration, **getLoadBalancerTypes()** and **getOptionTypes()**, **refresh()** flow, and how **createLoadBalancerVirtualServer** etc. are called by Morpheus when the user clicks “Create” in the UI.
- **Do not copy**: F5-specific concepts (iRules, partitions, F5-specific profiles). Map to Octavia concepts only (listeners, pools, members, monitors, L7 policies if you support them).

---

## 7. Summary: what is possible (from research)

| Feature | Possible? | Notes |
|--------|-----------|--------|
| Full integration under Infrastructure > Load Balancers | Yes | Implement LoadBalancerProvider and register it. |
| Pricing (Load Balancer + Virtual Server price plans) | Yes | Set **createPricePlans** on NetworkLoadBalancerType; use standard Plans & Pricing. |
| Sync (refresh) of LBs and child entities | Yes | Implement **refresh()**; call Octavia and update Morpheus DB. |
| Multiple tabs (Virtual Servers, Pools, Nodes, Monitors) | Yes | Morpheus builds tabs from synced entities; you implement CRUD. |
| Multiple listeners (virtual servers) per LB | Yes | Octavia supports multiple listeners; map to NetworkLoadBalancerInstance. |
| Multiple pools with their own members | Yes | Octavia supports multiple pools; map to NetworkLoadBalancerPool and nodes. |
| Master Tenant adds integration once (global config) | Yes | Add integration in Infrastructure > Load Balancers; OptionTypes = global config. |
| Sub-tenants see integration and create virtual servers | Yes | Use tenant/group visibility (public or assign to sub-tenant); scope Octavia calls by tenant/project when creating resources. |
| Permissions (plugin + admin) | Yes | Plugin permissions for your feature; “Admin: Integrations” for adding integrations. |
| Custom permission for “who can use Octavia LB” | Yes | Use your plugin permission in provider/controller to gate create/delete/update. |
| LB option in instance provisioning wizard | Yes | Automation section shows Load Balancer dropdown; after instance is created, addInstance adds VM as pool member. Requires Instance Type "Enable Scaling (Horizontal)" and Node Type LB port. |
| Native load balancer view on instance details | Yes | Instance details Load Balancer section shows attached LBs (from provisioning, LB side, or post-provision). addInstance/removeInstance back add/remove. No custom plugin UI needed. |

---

## 8. Feature map recap (what the framework supports vs Octavia)

When you implement a **LoadBalancerProvider**, Octavia LBs appear under **Infrastructure > Load Balancers**. Mapping of framework features to Octavia:

| Area | Morpheus feature | Octavia support |
|------|------------------|-----------------|
| **Core** | addLoadBalancer / deleteLoadBalancer | Yes – we already create/delete in Octavia |
| | initializeLoadBalancer | Yes – auth test + initial sync |
| | refresh() | Yes – re-fetch from Octavia API |
| **Virtual servers** | create/delete Virtual Server | Yes – Octavia Listeners (VIP + port + protocol) |
| **Pools** | create/delete Pool, balancing | Yes – ROUND_ROBIN, LEAST_CONNECTIONS, SOURCE_IP |
| **Nodes** | create/delete Node | Yes – Octavia pool members (IP + port) |
| **Monitors** | create/delete Health Monitor | Yes – HTTP, HTTPS, TCP, PING, TLS-HELLO |
| **Profiles** | SSL/TLS profiles | Partial – TERMINATED_HTTPS + Barbican if available |
| **Policies / rules** | L7 policies and rules | Yes – Octavia L7 policies/rules (URL path, headers) |
| **VIP / FIP** | supportsVip, supportsFloatingIp | Yes – we already handle FIP attach/detach |
| **Sticky** | supportsSticky | Yes – SOURCE_IP, APP_COOKIE, HTTP_COOKIE |
| **Pricing** | createPricePlans, LB + Virtual Server price types | Yes – enable when ready |

**What we do *not* copy from F5:** iRules/scripts, partitions, F5-specific profile types.

---

## 9. Design choices to confirm (before implementation)

These four decisions drive **getOptionTypes()**, **addLoadBalancer** behavior, and what to implement in the first version.

### 9.1 Add LB in Morpheus

When a user adds an “Octavia” load balancer under **Infrastructure > Load Balancers**, should that:

- **A. Sync only** – Only discover existing Octavia LBs (refresh pulls them in; “Add” in Morpheus does not create a new LB in OpenStack), or  
- **B. Create in Octavia** – “Add” in Morpheus can also create a new LB in Octavia (so the integration record is tied to a real Octavia LB).

*Decision: ________*

### 9.2 Scope of integration

Is the integration tied to:

- **A. Single cloud (and optionally tenant/project)** – One “Octavia” integration = one cloud (and one tenant/project or a fixed mapping), or  
- **B. Multi-tenant / multi-cloud** – One integration lists or manages LBs across multiple clouds/tenants (affects getOptionTypes and how we resolve cloud/tenant for API calls).

*Decision: ________*

### 9.3 Pricing

Do we need **createPricePlans** and the Load Balancer / Load Balancer Virtual Server price types in the **first version**, or is that a **later phase**?

*Decision: ________*

### 9.4 L7 policies and rules

Should we implement **createLoadBalancerPolicy** / **createLoadBalancerRule** (and delete) in the **first version**, or leave L7 policies/rules for a **later iteration**?

*Decision: ________*

---

## 10. Implementation plan (after decisions)

Once the four decisions above are set:

1. **Provider skeleton** – Add `OctaviaLoadBalancerProvider`, implement `getCode()`, `getName()`, `getDescription()`, `getIcon()`, `getLoadBalancerTypes()`, `getOptionTypes()` (based on scope and add-LB decision).
2. **Registration** – Register the provider in `CustomOctaviaLoadBalancerUiPlugin.initialize()` via `pluginProviders.put(provider.code, provider)`.
3. **Lifecycle** – Implement `validate()`, `initializeLoadBalancer()`, `refresh()` (reuse/extend `OctaviaLoadBalancerSync` + listener/pool/member/monitor sync), and `addLoadBalancer()` / `deleteLoadBalancer()` per decision 9.1.
4. **CRUD** – Implement create/delete for virtual servers (listeners), pools, nodes, health monitors; optionally policies/rules per decision 9.4.
5. **Instance attachment** – Implement `addInstance()` / `removeInstance()` so provisioning and instance-detail LB section work.
6. **Pricing** – If decision 9.3 is “yes”, set `createPricePlans: true` on the type and ensure price types are available in Plans & Pricing.

See **docs/BIGIP-REFERENCE-REVIEW.md** for BigIP patterns and method-by-method mapping.

---

## 11. References

- **Morpheus Plugin API**: [developer.morpheusdata.com](https://developer.morpheusdata.com) – LoadBalancerProvider, NetworkLoadBalancerType, MorpheusLoadBalancerService, Plugin permissions.
- **Docs**: Load Balancers (Infrastructure), Tenancy, Groups and Roles, Plans & Pricing, Configuring Multi-Tenancy.
- **F5 integration**: Docs describe F5 as an external LB type (API host, port, credentials, virtual servers, pools, nodes, monitors). Use as a behavioral reference; implement Octavia API, not F5 API.
- **BigIP reference**: `example plugin/morpheus-bigip-loadbalancer-plugin` and **docs/BIGIP-REFERENCE-REVIEW.md**.

---

*This guide is based on plugin API documentation and Morpheus docs research. Implement and test in your environment; tenant/group behavior may depend on your Morpheus version and configuration.*
