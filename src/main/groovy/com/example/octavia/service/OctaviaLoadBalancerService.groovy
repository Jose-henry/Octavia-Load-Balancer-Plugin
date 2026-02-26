package com.example.octavia.service

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.model.Cloud
import com.morpheusdata.model.NetworkLoadBalancer
import com.morpheusdata.response.ServiceResponse
import com.example.octavia.client.OctaviaApiClient
import com.example.octavia.client.OpenStackAuthClient
import com.example.octavia.util.OctaviaUtility
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaLoadBalancerService {

    MorpheusContext morpheusContext
    
    OctaviaLoadBalancerService(MorpheusContext morpheusContext) {
        this.morpheusContext = morpheusContext
    }

    /**
     * List all Octavia Load Balancers for a given cloud and project.
     */
    ServiceResponse<List<Map>> list(Cloud cloud, String projectId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            ServiceResponse response = client.get("/v2.0/lbaas/loadbalancers")
            
            if (response.success) {
                // Octavia returns { "loadbalancers": [ ... ] }
                List lbs = response.data?.loadbalancers ?: []
                return ServiceResponse.success(lbs)
            } else {
                return ServiceResponse.error("List Load Balancers failed: ${response.msg ?: response.error}")
            }
        } catch (Exception e) {
            log.error("Error listing load balancers: ${e.message}", e)
            return ServiceResponse.error("Error listing load balancers: ${e.message}")
        }
    }

    /**
     * Create a new Load Balancer using Octavia's single-call fully populated creation.
     * Per the Octavia API v2, you can nest listeners, pools, members, and health monitors
     * in a single POST to /v2.0/lbaas/loadbalancers.
     * See: https://docs.openstack.org/api-ref/load-balancer/v2/index.html#create-a-load-balancer
     */
    ServiceResponse create(Cloud cloud, String projectId, Map config) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)

            // Build the base LB payload
            Map lbPayload = [
                name: config.name,
                description: config.description ?: '',
                vip_subnet_id: config.subnetId ?: config.vipSubnetId ?: config.vip_subnet_id,
                project_id: projectId,
                admin_state_up: true
            ]

            // Optional: specific VIP address
            if (config.vipAddress) {
                lbPayload.vip_address = config.vipAddress
            }

            // Nest listener if requested
            if (config.createListener) {
                Map listener = [
                    name: config.listenerName ?: "${config.name}-listener",
                    protocol: config.listenerProtocol ?: 'HTTP',
                    protocol_port: config.listenerPort ?: 80,
                    admin_state_up: true
                ]

                if (config.connectionLimit && config.connectionLimit != -1) {
                    listener.connection_limit = config.connectionLimit
                }
                if (config.allowedCidrs) {
                    listener.allowed_cidrs = config.allowedCidrs.toString().split(',').collect { it.trim() }.findAll { it }
                }

                // Insert headers (for HTTP/TERMINATED_HTTPS)
                Map insertHeaders = [:]
                if (config.insertXForwardedFor) insertHeaders['X-Forwarded-For'] = 'true'
                if (config.insertXForwardedPort) insertHeaders['X-Forwarded-Port'] = 'true'
                if (config.insertXForwardedProto) insertHeaders['X-Forwarded-Proto'] = 'true'
                if (insertHeaders) listener.insert_headers = insertHeaders

                // Nest pool inside listener
                if (config.createPool) {
                    Map pool = [
                        name: config.poolName ?: "${config.name}-pool",
                        protocol: config.poolProtocol ?: config.listenerProtocol ?: 'HTTP',
                        lb_algorithm: config.poolAlgorithm ?: 'ROUND_ROBIN',
                        admin_state_up: true
                    ]
                    if (config.poolDesc) pool.description = config.poolDesc

                    // Session persistence
                    if (config.sessionPersistence && config.sessionPersistence != 'None') {
                        Map sp = [type: config.sessionPersistence]
                        if (config.sessionPersistence == 'APP_COOKIE' && config.cookieName) {
                            sp.cookie_name = config.cookieName
                        }
                        pool.session_persistence = sp
                    }

                    // TLS backend re-encryption
                    if (config.poolTlsEnabled) {
                        pool.tls_enabled = true
                        if (config.poolTlsCipher) pool.tls_ciphers = config.poolTlsCipher
                    }

                    // Nest members inside pool
                    if (config.members) {
                        pool.members = config.members.collect { m ->
                            Map member = [
                                address: m.address,
                                protocol_port: m.port ?: 80,
                                weight: m.weight ?: 1
                            ]
                            if (m.subnetId) member.subnet_id = m.subnetId
                            if (m.name) member.name = m.name
                            return member
                        }
                    }

                    // Nest health monitor inside pool
                    if (config.createMonitor) {
                        Map hm = [
                            type: config.monitorType ?: 'HTTP',
                            delay: config.delay ?: 5,
                            timeout: config.timeout ?: 5,
                            max_retries: config.maxRetries ?: 3,
                            admin_state_up: true
                        ]
                        if (config.monitorName) hm.name = config.monitorName
                        if (config.maxRetriesDown) hm.max_retries_down = config.maxRetriesDown
                        if (config.monitorType in ['HTTP', 'HTTPS']) {
                            hm.http_method = config.httpMethod ?: 'GET'
                            hm.url_path = config.urlPath ?: '/'
                            hm.expected_codes = config.expectedCodes ?: '200'
                        }
                        pool.healthmonitor = hm
                    }

                    listener.default_pool = pool
                }

                lbPayload.listeners = [listener]
            }

            ServiceResponse response = client.post("/v2.0/lbaas/loadbalancers", [loadbalancer: lbPayload])

            if (response.success) {
                return ServiceResponse.success(response.data?.loadbalancer)
            } else {
                String eMsg = extractOctaviaError(response, "Create Load Balancer failed")
                log.error(eMsg)
                return ServiceResponse.error(eMsg)
            }
        } catch (Exception e) {
            log.error("Error creating load balancer: ${e.message}", e)
            return ServiceResponse.error("Error creating load balancer: ${e.message}")
        }
    }
    
    /**
     * Get a Load Balancer by ID.
     */
    ServiceResponse get(Cloud cloud, String projectId, String lbId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            ServiceResponse response = client.get("/v2.0/lbaas/loadbalancers/${lbId}")
            
            if (response.success) {
                return ServiceResponse.success(response.data?.loadbalancer)
            } else {
                String eMsg = extractOctaviaError(response, "Get Load Balancer failed")
                log.error(eMsg)
                return ServiceResponse.error(eMsg)
            }
        } catch (Exception e) {
            log.error("Error getting load balancer: ${e.message}", e)
            return ServiceResponse.error("Error getting load balancer: ${e.message}")
        }
    }
    
    /**
     * Update a Load Balancer (and optionally its first listener/pool).
     * This orchestrates updates across resources.
     */
    ServiceResponse update(Cloud cloud, String projectId, String lbId, Map payload) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            boolean success = true
            List errors = []
            
            // 1. Update LB
            Map lbUpdates = [:]
            if (payload.name) lbUpdates.name = payload.name
            if (payload.description != null) lbUpdates.description = payload.description
            if (payload.admin_state_up != null) lbUpdates.admin_state_up = payload.admin_state_up
            
            if (lbUpdates) {
                 ServiceResponse resp = client.put("/v2.0/lbaas/loadbalancers/${lbId}", [loadbalancer: lbUpdates])
                 if (!resp.success) {
                     success = false
                     errors << "LB Update: ${resp.msg ?: resp.error}"
                 }
            }
            
            // 2. Update Nested (Listener/Pool/Health Monitor) - Fetch current state first
            // Note: This logic assumes single listener/pool for now as per UI
            if (payload.listenerName || payload.poolName || payload.connectionLimit || payload.listenerAdminStateUp != null || payload.poolAdminStateUp != null || payload.monitorAdminStateUp != null) {
                 ServiceResponse getResp = get(cloud, projectId, lbId)
                 if (getResp.success) {
                      def lb = getResp.data
                      
                      // Update Listener
                      if (payload.listenerName || payload.connectionLimit != null || payload.listenerAdminStateUp != null) {
                          def listeners = lb.listeners
                          if (listeners) {
                              String lisId = listeners[0].id
                              Map lisUpdates = [:]
                              if (payload.listenerName) lisUpdates.name = payload.listenerName
                              if (payload.connectionLimit != null) lisUpdates.connection_limit = payload.connectionLimit
                              if (payload.listenerAdminStateUp != null) lisUpdates.admin_state_up = payload.listenerAdminStateUp
                              
                              if (lisUpdates) {
                                  ServiceResponse lResp = client.put("/v2.0/lbaas/listeners/${lisId}", [listener: lisUpdates])
                                  if (!lResp.success) {
                                      success = false
                                      errors << "Listener Update: ${lResp.msg ?: lResp.error}"
                                  }
                              }
                          }
                      }
                      
                      // Update Pool
                      if (payload.poolName || payload.poolAdminStateUp != null || payload.monitorAdminStateUp != null) {
                          def pools = lb.pools
                          if (pools) {
                              String poolId = pools[0].id
                              Map poolUpdates = [:]
                              if (payload.poolName) poolUpdates.name = payload.poolName
                              if (payload.poolAdminStateUp != null) poolUpdates.admin_state_up = payload.poolAdminStateUp

                              if (poolUpdates) {
                                  ServiceResponse pResp = client.put("/v2.0/lbaas/pools/${poolId}", [pool: poolUpdates])
                                  if (!pResp.success) {
                                      success = false
                                      errors << "Pool Update: ${pResp.msg ?: pResp.error}"
                                  }
                              }

                              // Update Health Monitor admin_state_up if requested
                              if (payload.monitorAdminStateUp != null && pools[0].healthmonitor_id) {
                                  String hmId = pools[0].healthmonitor_id
                                  ServiceResponse hmResp = client.put("/v2.0/lbaas/healthmonitors/${hmId}", [healthmonitor: [admin_state_up: payload.monitorAdminStateUp]])
                                  if (!hmResp.success) {
                                      success = false
                                      errors << "Health Monitor Update: ${hmResp.msg ?: hmResp.error}"
                                  }
                              }
                          }
                      }
                 }
            }

            if (success) {
                return ServiceResponse.success()
            } else {
                String fullError = "Update failed: ${errors.join(' | ')}"
                log.error(fullError)
                return ServiceResponse.error(fullError)
            }

        } catch (Exception e) {
            log.error("Error updating load balancer: ${e.message}", e)
            return ServiceResponse.error("Error updating load balancer: ${e.message}")
        }
    }
    
    /**
     * Delete a Load Balancer (Cascade).
     */
    ServiceResponse delete(Cloud cloud, String projectId, String lbId) {
        try {
             OctaviaApiClient client = getClient(cloud, projectId)
             ServiceResponse response = client.delete("/v2.0/lbaas/loadbalancers/${lbId}?cascade=true")
             
             if (response.success) {
                 return ServiceResponse.success()
             } else {
                 String eMsg = extractOctaviaError(response, "Delete Load Balancer failed")
                 log.error(eMsg)
                 return ServiceResponse.error(eMsg)
             }
        } catch (Exception e) {
             log.error("Error deleting load balancer: ${e.message}", e)
             return ServiceResponse.error("Error deleting load balancer: ${e.message}")
        }
    }

    // ── Helper ──────────────────────────────────────────────────
    
    /**
     * Extracts clear error messages from Octavia/Neutron JSON error formats.
     */
    private String extractOctaviaError(ServiceResponse response, String defaultPrefix) {
        String baseMsg = response.msg ?: response.error ?: response.content ?: "Unknown API Error"
        try {
            if (response.content) {
                def json = new groovy.json.JsonSlurper().parseText(response.content)
                if (json instanceof Map) {
                    if (json.faultstring) return "${defaultPrefix}: ${json.faultstring}"
                    if (json.NeutronError?.message) return "${defaultPrefix}: ${json.NeutronError.message}"
                    if (json.message) return "${defaultPrefix}: ${json.message}"
                    if (json.error) return "${defaultPrefix}: ${json.error}"
                }
            }
        } catch (Exception ignore) {
            // Not JSON
        }
        
        if (baseMsg.contains("<html")) {
            return "${defaultPrefix}: ${response.error ?: 'HTTP Error'}"
        }
        
        return "${defaultPrefix}: ${baseMsg}"
    }

    /**
     * Helper to instantiate an authenticated client
     */
    private OctaviaApiClient getClient(Cloud cloud, String projectId) {
        OctaviaAuthService auth = new OctaviaAuthService(morpheusContext)
        Map session = auth.getAuthToken(cloud, projectId)
        
        if (!session.success) {
            throw new RuntimeException("Octavia auth failed: ${session.error}")
        }
        
        String endpoint = session.loadBalancerApi
        if (!endpoint) {
             throw new RuntimeException("No Octavia load balancer endpoint found for cloud ${cloud.id}")
        }
        
        return new OctaviaApiClient(new HttpApiClient(), endpoint, session.token as String)
    }
}
