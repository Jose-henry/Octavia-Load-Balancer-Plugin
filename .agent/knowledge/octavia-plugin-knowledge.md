# Octavia Load Balancer Plugin - Knowledge Base

## Project Overview

This is a **Morpheus Plugin** that provides a custom UI and backend services for managing **OpenStack Octavia Load Balancers** within the Morpheus cloud management platform.

### Target Environment
- **Morpheus Platform**: v8.0.0+ (minimum appliance version)
- **OpenStack**: Keystone authentication via MTN Nigeria cloud infrastructure
- **Octavia API**: OpenStack Load Balancer as a Service (LBaaS v2)

---

## What the Plugin Does

### Core Functionality
1. **Adds "Octavia Load Balancer" tabs** to:
   - Network detail pages (`Infrastructure > Networks > [network] > Octavia Load Balancer`)
   - Instance detail pages (`Provisioning > Instances > [instance] > Octavia Load Balancer`)

2. **Provides CRUD operations** for Octavia load balancers:
   - List load balancers by network or instance
   - Create load balancers with full configuration (listener, pool, members, health monitor)
   - Update/edit existing load balancers
   - Delete load balancers
   - Attach/detach floating IPs

3. **Integrates with OpenStack Octavia API** via Keystone authentication

---

## Architecture

### Backend (Groovy/Java)

```
src/main/groovy/com/example/
├── CustomOctaviaLoadBalancerUiPlugin.groovy  # Main plugin entry point
├── backend/
│   ├── OctaviaController.groovy              # REST API endpoints for AJAX
│   ├── OctaviaApiService.groovy              # Octavia API client facade
│   ├── MorpheusLookupService.groovy          # Morpheus data lookups
│   └── PersistenceService.groovy             # In-memory storage (mock mode)
└── providers/
    ├── OctaviaNetworkTabProvider.groovy      # Network tab extension
    ├── OctaviaInstanceTabProvider.groovy     # Instance tab extension
    └── OctaviaOptionSourceProvider.groovy    # Dropdown data provider
```

### Frontend (React/JSX)

```
src/assets/js/
└── octavia-loadbalancer-ui.jsx               # React SPA for the UI
```

### Templates

```
src/main/resources/renderer/hbs/
└── octavia.hbs                               # Handlebars template mounting React
```

---

## UI User Flow

### From Network Tab
1. User navigates to `Infrastructure > Networks > [select network]`
2. Clicks "Octavia Load Balancer" tab
3. Sees list of load balancers on this network
4. Can "Create Load Balancer" or manage existing ones

### From Instance Tab
1. User navigates to `Provisioning > Instances > [select instance]`
2. Clicks "Octavia Load Balancer" tab
3. Sees load balancers where this instance is a pool member
4. Can view/navigate to those load balancers

### Create Load Balancer Wizard (5 Steps)
Based on the UI screenshots, the wizard has these sections:

1. **Load Balancer Details**
   - Name, IP address, Description
   - Availability Zone, Flavour, Subnet
   - Admin State Up (Yes/No)

2. **Listener Details**
   - Name, Description, Protocol, Port
   - Timeouts (Client Data, TCP Inspect, Member Connect, Member Data)
   - Connection Limit, Allowed CIDRs
   - Admin State Up

3. **Pool Details**
   - Name, Description, Algorithm
   - Session Persistence, TLS Enabled
   - Admin State Up

4. **Pool Members**
   - Allocated Members table (IP, Subnet, Port, Weight)
   - Available Instances list with "Add" buttons
   - Add External Member option

5. **Monitor Details**
   - Name, Type, Max Retries Down
   - Delay, Max Retries, Timeout
   - Admin State Up

---

## Roles & Permissions

### Tab Visibility
Controlled by `show()` method in tab providers:
- **Network Tab**: Requires `network:read` permission
- **Instance Tab**: Requires `instance:read` permission

### API Endpoints
Defined in `OctaviaController.getRoutes()`:
- **Read operations** (`/loadbalancers`, `/options/*`): `network:read`
- **Write operations** (`/loadbalancers/create`, `/loadbalancers/delete`, `/floatingip/*`): `network:manage`

---

## Current Implementation State

### Completed ✅
- Plugin skeleton and registration
- Network and Instance tab providers
- Basic React UI with list/create/delete
- Mock mode with in-memory persistence
- Option source provider for dropdowns
- Controller with REST endpoints

### Not Yet Implemented ❌
- **Real Octavia API integration** (currently mock only)
- **Full wizard UI** (only basic create form exists)
- **Edit/Update functionality**
- **Listener/Pool/Member individual CRUD**
- **Health monitor configuration**
- **Status polling and display**
- **Proper Keystonetauthentication flow**

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `CustomOctaviaLoadBalancerUiPlugin.groovy` | Main plugin class, registers all providers |
| `OctaviaController.groovy` | REST API endpoints called by React UI |
| `OctaviaApiService.groovy` | Octavia API client (needs real implementation) |
| `MorpheusLookupService.groovy` | Queries Morpheus for networks/instances |
| `octavia-loadbalancer-ui.jsx` | React frontend application |
| `octavia.hbs` | Handlebars template that mounts React |
| `build.gradle` | Build configuration with plugin metadata |

---

## OpenStack Octavia Concepts

### Load Balancer Hierarchy
```
Load Balancer (VIP on a subnet)
└── Listener (protocol + port)
    └── Pool (backend group with algorithm)
        ├── Members (instances with IP:port:weight)
        └── Health Monitor (health check config)
```

### Key Octavia Resources
- **Load Balancer**: The main resource with a VIP address
- **Listener**: Listens on a protocol:port for incoming connections
- **Pool**: Collection of backend members with load balancing algorithm
- **Member**: A backend instance (IP:port) in the pool
- **Health Monitor**: Periodic health checks for pool members
- **Floating IP**: Public IP that can be attached to the VIP

### Algorithms
- `ROUND_ROBIN` - Rotate through members
- `LEAST_CONNECTIONS` - Send to least busy member
- `SOURCE_IP` - Sticky sessions by client IP

### Session Persistence
- `APP_COOKIE` - Application-level cookie
- `HTTP_COOKIE` - HTTP cookie
- `SOURCE_IP` - Client IP-based

---

## API Endpoints

### Plugin Controller Routes
```
GET  /plugin/octavia1234/loadbalancers?networkId=X
GET  /plugin/octavia1234/loadbalancers?instanceId=X
POST /plugin/octavia1234/loadbalancers/create
POST /plugin/octavia1234/loadbalancers/delete
POST /plugin/octavia1234/floatingip/attach
POST /plugin/octavia1234/floatingip/detach
GET  /plugin/octavia1234/options/:type?networkId=X
```

### Octavia API (to be implemented)
```
GET/POST   /v2/lbaas/loadbalancers
GET/PUT/DELETE /v2/lbaas/loadbalancers/{lb_id}
GET/POST   /v2/lbaas/listeners
GET/POST   /v2/lbaas/pools
GET/POST   /v2/lbaas/pools/{pool_id}/members
GET/POST   /v2/lbaas/healthmonitors
```

---

## Build & Deploy

### Build Command
```powershell
.\gradlew.bat shadowJar
```

### Output
`build/libs/Octavia-Load-Balancer-Plugin-0.1.0-all.jar`

### Deploy
Copy JAR to Morpheus plugins directory and restart or hot-reload.

---

## Environment Variables
- `OCTAVIA_MOCK=true|false` - Enable/disable mock mode (default: true)
- Alternative: `-Doctavia.mock=false` JVM property
