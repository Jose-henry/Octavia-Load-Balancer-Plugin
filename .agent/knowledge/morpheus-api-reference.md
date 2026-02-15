# Morpheus Plugin API Reference

## Key API Documentation URLs
All of these URLs are from https://developer.morpheusdata.com/api/

### Core Provider Interfaces

| Interface | URL | Description |
|-----------|-----|-------------|
| **LoadBalancerProvider** | [Link](https://developer.morpheusdata.com/api/com/morpheusdata/core/network/loadbalancer/LoadBalancerProvider.html) | Main interface for load balancer plugins |
| **NetworkTabProvider** | [Link](https://developer.morpheusdata.com/api/com/morpheusdata/core/providers/NetworkTabProvider.html) | Tab extension for Network pages |
| **InstanceTabProvider** | [Link](https://developer.morpheusdata.com/api/com/morpheusdata/core/providers/InstanceTabProvider.html) | Tab extension for Instance pages |
| **PluginProvider** | [Link](https://developer.morpheusdata.com/api/com/morpheusdata/core/providers/PluginProvider.html) | Base provider interface |

### Load Balancer Services (MorpheusServices)

| Service | Purpose |
|---------|---------|
| `MorpheusLoadBalancerService` | Main LB data operations |
| `MorpheusLoadBalancerPoolService` | Pool CRUD |
| `MorpheusLoadBalancerNodeService` | Node/Member CRUD |
| `MorpheusLoadBalancerMonitorService` | Health monitor CRUD |
| `MorpheusLoadBalancerProfileService` | SSL/Profile CRUD |
| `MorpheusLoadBalancerCertificateService` | Certificate mgmt |

### Network Services

| Service | Purpose |
|---------|---------|
| `MorpheusNetworkService` | Network operations |
| `MorpheusNetworkSubnetService` | Subnet operations |
| `MorpheusNetworkFloatingIpService` | Floating IP mgmt |

---

## LoadBalancerProvider Interface Methods

The `LoadBalancerProvider` interface defines these key methods:

### Configuration Methods
```groovy
String getDescription()
Icon getIcon()
Collection<NetworkLoadBalancerType> getLoadBalancerTypes()
Collection<OptionType> getOptionTypes()
```

### Lifecycle & Management (Crawled)
```groovy
ServiceResponse validate(NetworkLoadBalancer loadBalancer, Map opts)
ServiceResponse initializeLoadBalancer(NetworkLoadBalancer loadBalancer, Map opts)
ServiceResponse addLoadBalancer(NetworkLoadBalancer loadBalancer)
ServiceResponse updateLoadBalancer(NetworkLoadBalancer loadBalancer)
ServiceResponse deleteLoadBalancer(NetworkLoadBalancer loadBalancer)
ServiceResponse refresh(NetworkLoadBalancer loadBalancer)
```

### Component Operations (Crawled)
```groovy
// Pools
ServiceResponse createLoadBalancerPool(NetworkLoadBalancerPool pool)
ServiceResponse updateLoadBalancerPool(NetworkLoadBalancerPool pool)
ServiceResponse deleteLoadBalancerPool(NetworkLoadBalancerPool pool)

// Nodes / Members
ServiceResponse createLoadBalancerNode(NetworkLoadBalancerNode node)
ServiceResponse updateLoadBalancerNode(NetworkLoadBalancerNode node)
ServiceResponse deleteLoadBalancerNode(NetworkLoadBalancerNode node)

// Monitors
ServiceResponse createLoadBalancerHealthMonitor(NetworkLoadBalancerMonitor monitor)
ServiceResponse updateLoadBalancerHealthMonitor(NetworkLoadBalancerMonitor monitor)
ServiceResponse deleteLoadBalancerHealthMonitor(NetworkLoadBalancerMonitor monitor)

// Virtual Servers
ServiceResponse createLoadBalancerVirtualServer(NetworkLoadBalancerVirtualServer vs)
ServiceResponse updateLoadBalancerVirtualServer(NetworkLoadBalancerVirtualServer vs)
ServiceResponse deleteLoadBalancerVirtualServer(NetworkLoadBalancerVirtualServer vs)

// Policies & Rules
ServiceResponse createLoadBalancerPolicy(NetworkLoadBalancerPolicy policy)
ServiceResponse deleteLoadBalancerPolicy(NetworkLoadBalancerPolicy policy)
ServiceResponse createLoadBalancerRule(NetworkLoadBalancerRule rule)
ServiceResponse deleteLoadBalancerRule(NetworkLoadBalancerRule rule)
```

### Instance Operations
```groovy
ServiceResponse addInstance(NetworkLoadBalancerInstance instance)
ServiceResponse updateInstance(NetworkLoadBalancerInstance instance)
ServiceResponse removeInstance(NetworkLoadBalancerInstance instance)
```

---

## Key Model Classes

### NetworkLoadBalancer
Main load balancer model with these key fields:
- `account`, `owner` - Tenant info
- `type` - NetworkLoadBalancerType
- `name`, `description` - Basic info
- `visibility` - public/private
- `internalId`, `externalId` - External system IDs
- `sshHost`, `sshPort`, `sshUsername`, `sshPassword` - SSH access
- `internalIp`, `externalIp` - IP addresses
- `status`, `statusMessage`, `statusDate` - State
- `pool` - Default pool reference
- `sslCert` - SSL certificate
- `cloud` - Associated cloud
- `monitors` - Health monitors list
- `credentialLoaded`, `credentialData` - Credentials

### NetworkLoadBalancerPool
- `name`, `description`
- `vipBalance` - Algorithm (roundrobin, leastconnections)
- `vipSticky` - Session persistence
- `members` - List of nodes

### NetworkLoadBalancerNode
- `name`, `ipAddress`, `port`
- `weight` - Load weight
- `monitorState` - Health status

### NetworkLoadBalancerMonitor
- `name`, `monitorType`
- `monitorInterval`, `monitorTimeout`
- `sendData`, `receiveData` - Check content

### NetworkLoadBalancerVirtualServer
Virtual server / Listener config:
- `name`, `description`
- `vipAddress`, `vipPort`
- `vipProtocol`
- `pool` - Backend pool reference

---

## OptionType for Form Fields

```groovy
// Text input
new OptionType(
    name:'name', 
    code:'plugin.octavia.lb.name',
    fieldName:'name',
    fieldLabel:'Name',
    displayOrder:10,
    required:true,
    inputType:OptionType.InputType.TEXT,
    fieldContext:'domain'
)

// Dropdown with option source
new OptionType(
    name:'algorithm',
    code:'plugin.octavia.pool.algorithm',
    fieldName:'vipBalance',
    fieldLabel:'Algorithm',
    displayOrder:20,
    required:true,
    inputType:OptionType.InputType.SELECT,
    optionSource:'octaviaAlgorithms'
)

// Checkbox
new OptionType(
    name:'enabled',
    code:'plugin.octavia.lb.enabled',
    fieldName:'enabled',
    fieldLabel:'Enabled',
    inputType:OptionType.InputType.CHECKBOX,
    defaultValue:'on'
)
```

### InputType Options
- `TEXT` - Single line text
- `TEXTAREA` - Multi-line text
- `NUMBER` - Numeric input
- `CHECKBOX` - Boolean toggle
- `SELECT` - Dropdown (use with optionSource)
- `MULTI_SELECT` - Multi-select dropdown
- `TYPEAHEAD` - Autocomplete single select
- `MULTI_TYPEAHEAD` - Autocomplete multi select
- `PASSWORD` - Masked input
- `HIDDEN` - Hidden field

---

## ServiceResponse Pattern

```groovy
// Success with data
ServiceResponse.success(data)

// Success without data
ServiceResponse.success()

// Error with message
ServiceResponse.error("Error message here")

// Error with errors map
ServiceResponse.error("Failed", null, [field: "error message"])
```

---

## Plugin Documentation URLs

1. **Main Plugin Docs**: https://developer.morpheusdata.com/docs
2. **API Javadocs**: https://developer.morpheusdata.com/api/index.html
3. **All Classes Index**: https://developer.morpheusdata.com/api/allclasses-index.html

### Key Documentation Sections
- UI Extensions (Tabs, Global Components)
- Network Providers
- HTTP Routing / Controllers
- Handlebars Templating
- Asset Pipeline

---

## Permission AccessType Enum

The `Permission.AccessType` enum defines the valid access levels for custom permissions.
**IMPORTANT**: Do NOT use `manage`.

| Enum Constant | Description |
|---------------|-------------|
| `none` | No access |
| `read` | Read-only access |
| `full` | Full access (Read, Create, Update, Delete) |

---

## Detailed Object Model (NotebookLM)

### Key Packages
- `com.morpheusdata.core`: Core interfaces (`Plugin`, `MorpheusContext`).
- `com.morpheusdata.model`: Database entities (`Account`, `User`, `Cloud`).
- `com.morpheusdata.core.network.loadbalancer`: LB specific interfaces (`LoadBalancerProvider`).

### NetworkLoadBalancer Hierarchy (Crawled Fields)
- **NetworkLoadBalancer**:
    - Identity: `id`, `uuid`, `name`, `description`, `type`
    - Connection: `hostAddress`, `apiPort`, `adminPort`, `username`, `password`
    - SSH: `sshUser`, `sshPassword`
    - Network: `externalIp`, `internalIp`, `sslEnabled`
    - Status: `status`, `statusMessage`, `statusDate`, `lastCheck`, `lastSync`, `lastUpdated`
    - Relations: `account`, `cloud`, `owner`
    - Proxy: `proxyHost`, `proxyPort`, `proxyUser`, `proxyPassword`
    - Config: `enabled`, `visibility`, `virtualServiceName`, `credentialData`, `rawData`
- **NetworkLoadBalancerInstance** (VIP): Represents the listener/virtual server.
    - Attributes: `vipAddress`, `vipPort`, `vipProtocol`, `sslCert`.
- **NetworkLoadBalancerPool**: Backend group.
    - Attributes: `balancingAlgorithm`, `vipBalance`.
- **NetworkLoadBalancerNode**: Pool member.
    - Attributes: `ipAddress`, `port`, `weight`.
- **NetworkLoadBalancerMonitor**: Health check.
    - Attributes: `monitorType`, `monitorInterval`.

