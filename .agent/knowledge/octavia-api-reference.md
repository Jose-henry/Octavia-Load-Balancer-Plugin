# OpenStack Octavia API v2 Reference

> **Source**: https://docs.openstack.org/api-ref/load-balancer/v2/index.html
> **Purpose**: API reference for implementing real Octavia integration

---

## Base URL
```
/v2/lbaas/
```

## Authentication
Uses Keystone token: `X-Auth-Token: <token>`

---

## Status Codes

### Operating Status
| Code | Description |
|------|-------------|
| `ONLINE` | Entity operating normally, all members healthy |
| `DRAINING` | Member not accepting new connections |
| `OFFLINE` | Entity administratively disabled |
| `DEGRADED` | One or more components in ERROR |
| `ERROR` | Entity failed, member failing health checks |
| `NO_MONITOR` | No health monitor configured |

### Provisioning Status
| Code | Description |
|------|-------------|
| `ACTIVE` | Successfully provisioned |
| `DELETED` | Successfully deleted |
| `ERROR` | Provisioning failed |
| `PENDING_CREATE` | Being created |
| `PENDING_UPDATE` | Being updated |
| `PENDING_DELETE` | Being deleted |

> **Note**: Entities in `PENDING_*` status are immutable.

---

## Load Balancers

### Endpoints
```
GET    /v2/lbaas/loadbalancers
POST   /v2/lbaas/loadbalancers
GET    /v2/lbaas/loadbalancers/{lb_id}
PUT    /v2/lbaas/loadbalancers/{lb_id}
DELETE /v2/lbaas/loadbalancers/{lb_id}
GET    /v2/lbaas/loadbalancers/{lb_id}/status
GET    /v2/lbaas/loadbalancers/{lb_id}/stats
```

### Key Fields
| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Load balancer ID |
| `name` | string | Display name |
| `description` | string | Description |
| `vip_address` | string | Virtual IP address |
| `vip_subnet_id` | uuid | Subnet for VIP |
| `vip_network_id` | uuid | Network for VIP |
| `vip_port_id` | uuid | Neutron port for VIP |
| `admin_state_up` | boolean | Administrative state |
| `provisioning_status` | string | Provisioning status |
| `operating_status` | string | Operating status |
| `provider` | string | Provider name (e.g., "octavia") |
| `flavor_id` | uuid | Flavor ID (optional) |
| `availability_zone` | string | AZ name (optional) |
| `listeners` | array | Associated listener IDs |
| `pools` | array | Associated pool IDs |
| `project_id` | uuid | Project/tenant ID |

### Create Request Example
```json
{
  "loadbalancer": {
    "name": "my-lb",
    "description": "My load balancer",
    "vip_subnet_id": "subnet-uuid-here",
    "admin_state_up": true
  }
}
```

---

## Listeners

### Endpoints
```
GET    /v2/lbaas/listeners
POST   /v2/lbaas/listeners
GET    /v2/lbaas/listeners/{listener_id}
PUT    /v2/lbaas/listeners/{listener_id}
DELETE /v2/lbaas/listeners/{listener_id}
```

### Key Fields
| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Listener ID |
| `name` | string | Display name |
| `protocol` | string | HTTP, HTTPS, TCP, UDP, TERMINATED_HTTPS |
| `protocol_port` | integer | Port number (1-65535) |
| `default_pool_id` | uuid | Default backend pool |
| `loadbalancer_id` | uuid | Parent load balancer |
| `connection_limit` | integer | Max connections (-1 = unlimited) |
| `allowed_cidrs` | array | Allowed source CIDRs |
| `timeout_client_data` | integer | Client data timeout (ms) |
| `timeout_member_connect` | integer | Member connect timeout (ms) |
| `timeout_member_data` | integer | Member data timeout (ms) |
| `timeout_tcp_inspect` | integer | TCP inspect timeout (ms) |

### Protocol Valid Combinations
| Listener | Pool (Valid) |
|----------|--------------|
| HTTP | HTTP, PROXY, PROXYV2 |
| HTTPS | HTTPS, TCP, PROXY, PROXYV2 |
| TCP | TCP, PROXY, PROXYV2 |
| UDP | UDP |
| TERMINATED_HTTPS | HTTP, PROXY |

---

## Pools

### Endpoints
```
GET    /v2/lbaas/pools
POST   /v2/lbaas/pools
GET    /v2/lbaas/pools/{pool_id}
PUT    /v2/lbaas/pools/{pool_id}
DELETE /v2/lbaas/pools/{pool_id}
```

### Key Fields
| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Pool ID |
| `name` | string | Display name |
| `protocol` | string | HTTP, HTTPS, PROXY, PROXYV2, TCP, UDP |
| `lb_algorithm` | string | Load balancing algorithm |
| `listener_id` | uuid | Parent listener (if not using default_pool) |
| `loadbalancer_id` | uuid | Parent load balancer |
| `healthmonitor_id` | uuid | Associated health monitor |
| `session_persistence` | object | Session persistence config |
| `tls_enabled` | boolean | Enable TLS to backends |
| `members` | array | Member IDs |

### Load Balancing Algorithms
| Algorithm | Description |
|-----------|-------------|
| `ROUND_ROBIN` | Rotate through members evenly |
| `LEAST_CONNECTIONS` | Send to member with fewest connections |
| `SOURCE_IP` | Hash client IP for sticky sessions |
| `SOURCE_IP_PORT` | Hash client IP and port |

### Session Persistence Types
```json
{
  "session_persistence": {
    "type": "APP_COOKIE",
    "cookie_name": "MY_COOKIE"
  }
}
```
- `SOURCE_IP` - Persist by client IP
- `HTTP_COOKIE` - Use Octavia-generated cookie
- `APP_COOKIE` - Use application cookie (requires `cookie_name`)

---

## Members

### Endpoints
```
GET    /v2/lbaas/pools/{pool_id}/members
POST   /v2/lbaas/pools/{pool_id}/members
GET    /v2/lbaas/pools/{pool_id}/members/{member_id}
PUT    /v2/lbaas/pools/{pool_id}/members/{member_id}
DELETE /v2/lbaas/pools/{pool_id}/members/{member_id}
PUT    /v2/lbaas/pools/{pool_id}/members  (batch update)
```

### Key Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | **Yes** | Backend IP address |
| `protocol_port` | integer | **Yes** | Backend port |
| `name` | string | No | Display name |
| `weight` | integer | No | Weight 0-256 (default: 1) |
| `subnet_id` | uuid | No | Member subnet |
| `admin_state_up` | boolean | No | Admin state (default: true) |
| `backup` | boolean | No | Backup member (default: false) |
| `monitor_address` | string | No | Alternate health check IP |
| `monitor_port` | integer | No | Alternate health check port |

### Create Member Example
```json
{
  "member": {
    "name": "web-server-1",
    "address": "192.168.1.10",
    "protocol_port": 80,
    "weight": 10,
    "subnet_id": "subnet-uuid"
  }
}
```

---

## Health Monitors

### Endpoints
```
GET    /v2/lbaas/healthmonitors
POST   /v2/lbaas/healthmonitors
GET    /v2/lbaas/healthmonitors/{healthmonitor_id}
PUT    /v2/lbaas/healthmonitors/{healthmonitor_id}
DELETE /v2/lbaas/healthmonitors/{healthmonitor_id}
```

### Key Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pool_id` | uuid | **Yes** | Pool to monitor |
| `type` | string | **Yes** | HTTP, HTTPS, TCP, TLS-HELLO, UDP-CONNECT, PING |
| `delay` | integer | **Yes** | Seconds between probes |
| `timeout` | integer | **Yes** | Probe timeout seconds |
| `max_retries` | integer | **Yes** | Successes before ONLINE (1-10) |
| `max_retries_down` | integer | No | Failures before ERROR (1-10) |
| `http_method` | string | No | GET, POST, etc. |
| `url_path` | string | No | HTTP check path |
| `expected_codes` | string | No | "200", "200,202", "200-204" |

### Monitor Types
| Type | Protocol | Description |
|------|----------|-------------|
| `HTTP` | HTTP/HTTPS | HTTP request check |
| `HTTPS` | HTTPS | HTTPS request check |
| `TCP` | TCP | TCP connection check |
| `TLS-HELLO` | TCP w/TLS | TLS handshake check |
| `UDP-CONNECT` | UDP | UDP check |
| `PING` | ICMP | ICMP ping check |

### Create Health Monitor Example
```json
{
  "healthmonitor": {
    "pool_id": "pool-uuid",
    "type": "HTTP",
    "delay": 5,
    "timeout": 3,
    "max_retries": 3,
    "url_path": "/health",
    "expected_codes": "200"
  }
}
```

---

## Floating IPs (via Neutron)

Attaching floating IP to load balancer VIP:
```
PUT /v2.0/floatingips/{floatingip_id}
{
  "floatingip": {
    "port_id": "<vip_port_id from load balancer>"
  }
}
```

Detaching:
```
PUT /v2.0/floatingips/{floatingip_id}
{
  "floatingip": {
    "port_id": null
  }
}
```
