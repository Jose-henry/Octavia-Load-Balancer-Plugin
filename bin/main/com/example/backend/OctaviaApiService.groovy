package com.example.backend

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.model.Network
import groovy.transform.Immutable
import groovy.util.logging.Slf4j

/**
 * Service layer dealing with Octavia API integration.
 * Transforms UI payloads into OpenStack JSON structures.
 */
@Slf4j
class OctaviaApiService {
    private final MorpheusContext morpheus
    private final MorpheusLookupService lookup
    
    OctaviaApiService(MorpheusContext morpheus) {
        this.morpheus = morpheus
        this.lookup = new MorpheusLookupService(morpheus)
    }

    /**
     * Create a Load Balancer with Listener, Pool, and Members (Cascading).
     */
    ApiResult createLoadBalancer(Map ctx, Map payload) {
        try {
            def client = getClient(ctx)
            
            // Transform UI payload -> Octavia Cascading JSON
            def lbJson = [
                loadbalancer: [
                    name: payload.name,
                    description: payload.description,
                    vip_subnet_id: payload.vipSubnetId,
                    project_id: ctx.project?.id, // Ensure ownership
                    admin_state_up: true
                ]
            ]

            // If we have listener details, add them (Cascading)
            if (payload.protocol && payload.port) {
                def pool = [
                    protocol: payload.protocol, // HTTP, TCP, etc.
                    lb_algorithm: payload.algorithm ?: 'ROUND_ROBIN',
                    members: (payload.members ?: []).collect { memberIp ->
                        [
                            address: memberIp,
                            protocol_port: payload.port as Integer,
                            subnet_id: payload.vipSubnetId // Usually same subnet for members
                        ]
                    }
                ]
                
                // Add Health Monitor if configured
                if (payload.monitorType) {
                    pool.healthmonitor = [
                        type: payload.monitorType,
                        delay: (payload.monitorDelay ?: 5) as Integer,
                        timeout: (payload.monitorTimeout ?: 3) as Integer,
                        max_retries: (payload.monitorRetries ?: 3) as Integer
                    ]
                }

                def listener = [
                    protocol: payload.protocol,
                    protocol_port: payload.port as Integer,
                    default_pool: pool
                ]
                
                lbJson.loadbalancer.listeners = [listener]
            }

            log.info("Creating Octavia LB with payload: ${lbJson}")
            def result = client.createLoadBalancer(lbJson)
            return ApiResult.ok(result)

        } catch (Exception ex) {
            log.error("Error creating LB: ${ex.message}", ex)
            return ApiResult.fail(ex.message)
        }
    }

    ApiResult deleteLoadBalancer(Map ctx, String lbId) {
        try {
            def client = getClient(ctx)
            client.deleteLoadBalancer(lbId, true) // Cascade delete
            return ApiResult.ok([deleted: lbId])
        } catch (Exception ex) {
            log.error("Error deleting LB: ${ex.message}", ex)
            return ApiResult.fail(ex.message)
        }
    }

    ApiResult getLoadBalancer(Map ctx, String lbId) {
        try {
            def client = getClient(ctx)
            def result = client.getLoadBalancer(lbId)
            return ApiResult.ok(result)
        } catch (Exception ex) {
            return ApiResult.fail(ex.message)
        }
    }

    ApiResult updateLoadBalancer(Map ctx, String lbId, Map payload) {
        try {
            def client = getClient(ctx)
            
            // 1. Update LB basic props
            def lbUpdates = [:]
            if (payload.name) lbUpdates.name = payload.name
            if (payload.description != null) lbUpdates.description = payload.description
            if (payload.admin_state_up != null) lbUpdates.admin_state_up = payload.admin_state_up
            
            if (lbUpdates) {
                client.updateLoadBalancer(lbId, lbUpdates)
            }
            
            // 2. Helper to find IDs if updating nested resources
            if (payload.listenerName || payload.poolName || payload.connectionLimit) {
                def lb = client.getLoadBalancer(lbId).loadbalancer
                
                // Update First Listener
                if (lb.listeners) {
                    def lisId = lb.listeners[0].id
                    def lisUpdates = [:]
                    if (payload.listenerName) lisUpdates.name = payload.listenerName
                    if (payload.connectionLimit != null) lisUpdates.connection_limit = payload.connectionLimit
                    if (lisUpdates) client.updateListener(lisId, lisUpdates)
                }

                // Update First Pool
                if (lb.pools) {
                    def poolId = lb.pools[0].id
                    def poolUpdates = [:]
                    if (payload.poolName) poolUpdates.name = payload.poolName
                    if (payload.poolAlgorithm) poolUpdates.lb_algorithm = payload.poolAlgorithm
                    if (poolUpdates) client.updatePool(poolId, poolUpdates)
                }
            }
            
            return ApiResult.ok([success:true])
        } catch (Exception ex) {
            log.error("Error updating LB: ${ex.message}", ex)
            return ApiResult.fail(ex.message)
        }
    }

    /**
     * List all LBs for the project associated with the network.
     */
    ApiResult listLoadBalancers(Map ctx) {
        try {
            def client = getClient(ctx)
            // Octavia lists all LBs visible to the token's project scope
            def result = client.listLoadBalancers()

            // Sync to Morpheus
            try {
                def cloud = ctx.cloud ?: ctx.network?.cloud
                if (cloud && result.loadbalancers) {
                   new OctaviaLoadBalancerSync(morpheus, cloud).execute(result.loadbalancers)
                }
            } catch (e) {
                log.error("Sync error: ${e.message}")
            }

            return ApiResult.ok(result) 
        } catch (Exception ex) {
             log.error("Error listing LBs: ${ex.message}", ex)
             // Return empty list on error to not break UI completely
             return ApiResult.ok([loadbalancers: []]) 
        }
    }

    /**
     * Attach a Floating IP to the Load Balancer.
     * 1. Get LB VIP Port ID.
     * 2. Find available FIP in the pool OR create a new one.
     * 3. Associate FIP with VIP Port.
     */
    ApiResult attachFloatingIp(Map ctx, String lbId, String poolId) {
        try {
            def client = getClient(ctx)
            def netClient = getNetClient(ctx) // Networking Client

            // 1. Get LB VIP Port
            def lb = client.getLoadBalancer(lbId)
            def vipPortId = lb.vip_port_id
            if (!vipPortId) return ApiResult.fail("Load Balancer has no VIP Port")

            // 2. Find or Create FIP
            def fip = findFreeFip(netClient, poolId)
            if (!fip) {
                log.info("No free FIP found in pool ${poolId}, creating new one...")
                fip = netClient.createFloatingIp(poolId)
            }
            
            // 3. Associate
            log.info("Associating FIP ${fip.floating_ip_address} (${fip.id}) with Port ${vipPortId}")
            def updated = netClient.updateFloatingIp(fip.id, vipPortId)

            return ApiResult.ok([floatingIp: updated.floatingip])
        } catch (Exception ex) {
            log.error("Error attaching FIP: ${ex.message}", ex)
            return ApiResult.fail(ex.message)
        }
    }

    /**
     * Detach Floating IP from Load Balancer.
     * Disassociates the FIP (sets port_id to null).
     */
    ApiResult detachFloatingIp(Map ctx, String lbId) {
        try {
            def client = getClient(ctx)
            def netClient = getNetClient(ctx)

            // We need to find the FIP associated with this LB's VIP
            def lb = client.getLoadBalancer(lbId)
            def vipPortId = lb.vip_port_id
            if (!vipPortId) return ApiResult.fail("LB has no VIP Port")

            // List FIPs associated with this port
            def fips = netClient.listFloatingIps([port_id: vipPortId])?.floatingips
            if (!fips) return ApiResult.ok([message: "No Floating IPs attached"])

            // Disassociate all (usually just one)
            fips.each { fip ->
                log.info("Disassociating FIP ${fip.floating_ip_address} from port ${vipPortId}")
                netClient.updateFloatingIp(fip.id, null)
            }

            return ApiResult.ok([detached: true])
        } catch (Exception ex) {
            log.error("Error detaching FIP: ${ex.message}", ex)
            return ApiResult.fail(ex.message)
        }
    }

    // --- Helpers ---

    private Map findFreeFip(NetworkingClient client, String poolId) {
        // List FIPs in this pool (network) that have no port_id (status DOWN/Active but unattached)
        // Neutron filtering might vary, but iterating is safe for typical sizes
        def allFips = client.listFloatingIps([floating_network_id: poolId, status: 'DOWN'])
        // Double check for null port_id to be safe
        return allFips?.floatingips?.find { it.port_id == null }
    }

    private NetworkingClient getNetClient(Map ctx) {
         def network = ctx.network
         def cloud = network.cloud
         def project = network.project
         
         if (!cloud || !project) throw new RuntimeException("Missing context")

         def osClient = new OpenStackClient(cloud)
         def session = osClient.getSession(project.id)
         return new NetworkingClient(session)
    }

    private OctaviaClient getClient(Map ctx) {
        def cloud = ctx.cloud
        def project = ctx.project

        // Fallback: extract from network if present and explicit one missing
        if ((!cloud || !project) && ctx.network) {
            cloud = cloud ?: ctx.network.cloud
            project = project ?: ctx.network.project
        }
        
        if (!cloud || !project) {
             throw new RuntimeException("Context must include Cloud and Project")
        }
        
        def osClient = new OpenStackClient(cloud)
        def session = osClient.getSession(project.id) // Get scoped token + endpoint
        
        return new OctaviaClient(session)
    }

    @Immutable
    static class ApiResult {
        boolean success
        String message
        Map data

        static ApiResult ok(Map data = [:]) {
            new ApiResult(true, null, data)
        }

        static ApiResult fail(String msg) {
            new ApiResult(false, msg, [:])
        }
        
        Map toMap() {
            def out = [success: success]
            if (message) out.message = message
            if (data) out.putAll(data)
            return out
        }
    }
}
