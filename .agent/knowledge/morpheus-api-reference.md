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


## Core Interfaces

### `LoadBalancerProvider`
Central interface for Load Balancer plugins.
- **Package**: `com.morpheusdata.core.network.loadbalancer`
- **Key Methods**:
    - `validate(NetworkLoadBalancer lb, Map opts)`: Validates configuration before save.
    - `initializeLoadBalancer(NetworkLoadBalancer lb, Map opts)`: Initial setup (e.g. initial sync).
    - `refresh(NetworkLoadBalancer lb)`: Syncs status and objects (Pools, Virtual Servers) from the device.
    - `addLoadBalancer(NetworkLoadBalancer lb)`: Creates the LB record (rarely calls API if mapping to existing).
    - `createLoadBalancerPool(NetworkLoadBalancerPool pool, Map opts)`: Creates a backend pool.

### `HttpApiClient`
Robust HTTP client for API integrations.
- **Package**: `com.morpheusdata.core.util`
- **Usage**:
  ```groovy
  HttpApiClient client = new HttpApiClient()
  RequestOptions opts = new RequestOptions(ignoreSSL: true)
  opts.headers = ['X-Auth-Token': token]
  opts.queryParams = ['limit': '10']
  opts.body = [some: 'json']
  
  ServiceResponse resp = client.callJsonApi('https://api.example.com', '/v1/resource', opts, 'POST')
  // resp.success (boolean)
  // resp.data (parsed JSON Map/List)
  // resp.msg (String error)
  ```

### `NetworkLoadBalancer` (Model)
The main model representing the device.
- **Methods**:
    - `getSshHost()`: Hostname/IP.
    - `getApiPort()`: Port for API interactions.
    - `getCredentialData()`: Map containing `username` and `password` if using stored credentials.
    - `getCloud()`: Reference to the parent Cloud.


