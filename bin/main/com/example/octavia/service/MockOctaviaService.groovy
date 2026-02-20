package com.example.octavia.service

import com.morpheusdata.response.ServiceResponse
import groovy.util.logging.Slf4j
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * In-memory mock backend for Octavia LB operations.
 * Activated by setting env var OCTAVIA_MOCK=true.
 * Provides realistic Octavia-shaped responses without any real API calls.
 */
@Slf4j
class MockOctaviaService {

    private static final AtomicInteger idCounter = new AtomicInteger(1000)
    // key = lbId, value = full LB map (including nested listeners, pools, members, monitors)
    private static final Map<String, Map> loadBalancers = new ConcurrentHashMap<>()

    static boolean isMockMode() {
        return System.getenv("OCTAVIA_MOCK")?.toLowerCase() == 'true' ||
               System.getProperty("OCTAVIA_MOCK")?.toLowerCase() == 'true'
    }

    // ─── Load Balancers ─────────────────────────────────────────────

    ServiceResponse<List<Map>> listLoadBalancers(String projectId) {
        def lbs = loadBalancers.values().findAll { it.project_id == projectId || projectId == null }
        log.debug("Mock listLoadBalancers: returning {} items", lbs.size())
        return ServiceResponse.success(lbs.collect { sanitizeLb(it) })
    }

    ServiceResponse<Map> getLoadBalancer(String lbId) {
        Map lb = loadBalancers[lbId]
        if (!lb) return ServiceResponse.error("Load Balancer ${lbId} not found")
        return ServiceResponse.success(sanitizeLb(lb))
    }

    ServiceResponse<Map> createLoadBalancer(String projectId, Map config) {
        String lbId = nextId('lb')
        Map lb = [
            id: lbId,
            name: config.name ?: "lb-${lbId}",
            description: config.description ?: '',
            vip_subnet_id: config.subnetId ?: config.vip_subnet_id ?: 'subnet-mock',
            vip_address: config.vipAddress ?: "10.0.0.${idCounter.get() % 255}",
            vip_port_id: nextId('port'),
            project_id: projectId,
            provisioning_status: 'ACTIVE',
            operating_status: 'ONLINE',
            admin_state_up: true,
            provider: 'octavia',
            created_at: new Date().format("yyyy-MM-dd'T'HH:mm:ss"),
            updated_at: new Date().format("yyyy-MM-dd'T'HH:mm:ss"),
            listeners: [],
            pools: []
        ]

        // Build nested resources if provided
        if (config.createListener) {
            Map listener = createListenerMap(lbId, config)
            lb.listeners << listener

            if (config.createPool) {
                Map pool = createPoolMap(lbId, listener.id, config)
                lb.pools << pool
                listener.default_pool_id = pool.id

                // Members
                if (config.members) {
                    config.members.each { m ->
                        pool.members << createMemberMap(pool.id, m)
                    }
                }

                // Health Monitor
                if (config.createMonitor) {
                    Map hm = createHealthMonitorMap(pool.id, config)
                    pool.healthmonitor = hm
                    pool.healthmonitor_id = hm.id
                }
            }
        }

        loadBalancers[lbId] = lb
        log.info("Mock createLoadBalancer: created ${lb.name} (${lbId})")
        return ServiceResponse.success(sanitizeLb(lb))
    }

    ServiceResponse updateLoadBalancer(String lbId, Map updates) {
        Map lb = loadBalancers[lbId]
        if (!lb) return ServiceResponse.error("Load Balancer ${lbId} not found")
        if (updates.name) lb.name = updates.name
        if (updates.description != null) lb.description = updates.description
        if (updates.admin_state_up != null) lb.admin_state_up = updates.admin_state_up
        lb.updated_at = new Date().format("yyyy-MM-dd'T'HH:mm:ss")
        log.info("Mock updateLoadBalancer: updated ${lbId}")
        return ServiceResponse.success(sanitizeLb(lb))
    }

    ServiceResponse deleteLoadBalancer(String lbId) {
        Map removed = loadBalancers.remove(lbId)
        if (!removed) return ServiceResponse.error("Load Balancer ${lbId} not found")
        log.info("Mock deleteLoadBalancer: deleted ${lbId}")
        return ServiceResponse.success()
    }

    // ─── Floating IPs ───────────────────────────────────────────────

    ServiceResponse<List<Map>> listFloatingIps(String projectId, Map filters = [:]) {
        // Return a couple of random mock FIPs
        def fips = [
            [id: 'fip-001', floating_ip_address: '203.0.113.10', status: 'DOWN', port_id: null, floating_network_id: filters.floating_network_id ?: 'ext-net-1'],
            [id: 'fip-002', floating_ip_address: '203.0.113.11', status: 'ACTIVE', port_id: 'some-port', floating_network_id: filters.floating_network_id ?: 'ext-net-1']
        ]
        if (filters.status) fips = fips.findAll { it.status == filters.status }
        if (filters.port_id) fips = fips.findAll { it.port_id == filters.port_id }
        return ServiceResponse.success(fips)
    }

    ServiceResponse associateFloatingIp(String fipId, String portId) {
        log.info("Mock associateFloatingIp: ${fipId} -> ${portId}")
        return ServiceResponse.success([id: fipId, port_id: portId, floating_ip_address: '203.0.113.10', status: 'ACTIVE'])
    }

    ServiceResponse disassociateFloatingIp(String fipId) {
        log.info("Mock disassociateFloatingIp: ${fipId}")
        return ServiceResponse.success([id: fipId, port_id: null, status: 'DOWN'])
    }

    // ─── Helper Builders ────────────────────────────────────────────

    private Map createListenerMap(String lbId, Map config) {
        String id = nextId('lis')
        return [
            id: id,
            name: config.listenerName ?: "listener-${id}",
            protocol: config.listenerProtocol ?: 'HTTP',
            protocol_port: config.listenerPort ?: 80,
            connection_limit: config.connectionLimit ?: -1,
            default_pool_id: null,
            loadbalancers: [[id: lbId]],
            provisioning_status: 'ACTIVE',
            operating_status: 'ONLINE',
            admin_state_up: true,
            allowed_cidrs: config.allowedCidrs ? config.allowedCidrs.toString().split(',').collect { it.trim() } : []
        ]
    }

    private Map createPoolMap(String lbId, String listenerId, Map config) {
        String id = nextId('pool')
        return [
            id: id,
            name: config.poolName ?: "pool-${id}",
            protocol: config.poolProtocol ?: 'HTTP',
            lb_algorithm: config.poolAlgorithm ?: 'ROUND_ROBIN',
            description: config.poolDesc ?: '',
            loadbalancers: [[id: lbId]],
            listeners: [[id: listenerId]],
            members: [],
            healthmonitor: null,
            healthmonitor_id: null,
            provisioning_status: 'ACTIVE',
            operating_status: 'ONLINE',
            admin_state_up: true,
            session_persistence: config.sessionPersistence && config.sessionPersistence != 'None' ?
                [type: config.sessionPersistence, cookie_name: config.cookieName] : null
        ]
    }

    private Map createMemberMap(String poolId, Map m) {
        String id = m.id ?: nextId('mem')
        return [
            id: id,
            name: m.name ?: "member-${id}",
            address: m.address ?: '10.0.0.1',
            protocol_port: m.port ?: 80,
            weight: m.weight ?: 1,
            subnet_id: m.subnetId ?: 'subnet-mock',
            provisioning_status: 'ACTIVE',
            operating_status: 'ONLINE',
            admin_state_up: true
        ]
    }

    private Map createHealthMonitorMap(String poolId, Map config) {
        String id = nextId('hm')
        return [
            id: id,
            name: config.monitorName ?: "hm-${id}",
            type: config.monitorType ?: 'HTTP',
            delay: config.delay ?: 5,
            timeout: config.timeout ?: 5,
            max_retries: config.maxRetries ?: 3,
            max_retries_down: config.maxRetriesDown ?: 3,
            http_method: config.httpMethod ?: 'GET',
            url_path: config.urlPath ?: '/',
            expected_codes: config.expectedCodes ?: '200',
            provisioning_status: 'ACTIVE',
            operating_status: 'ONLINE',
            admin_state_up: true,
            pools: [[id: poolId]]
        ]
    }

    private Map sanitizeLb(Map lb) {
        // Return a safe copy (no internal mutability concerns)
        return new LinkedHashMap(lb)
    }

    private static String nextId(String prefix) {
        return "${prefix}-${UUID.randomUUID().toString().take(8)}"
    }
}
