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
     * Create a new Load Balancer.
     */
    ServiceResponse create(Cloud cloud, String projectId, Map lbConfig) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            
            // Construct payload strictly for Octavia
            Map payload = [
                loadbalancer: [
                    name: lbConfig.name,
                    description: lbConfig.description,
                    vip_subnet_id: lbConfig.subnetId,
                    project_id: projectId,
                    admin_state_up: true
                ]
            ]
            
            ServiceResponse response = client.post("/v2.0/lbaas/loadbalancers", payload)
            
            if (response.success) {
                return ServiceResponse.success(response.data?.loadbalancer)
            } else {
                return ServiceResponse.error("Create Load Balancer failed: ${response.msg ?: response.error}")
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
                return ServiceResponse.error("Get Load Balancer failed: ${response.msg ?: response.error}")
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
            
            // 2. Update Nested (Listener/Pool) - Fetch current state first
            // Note: This logic assumes single listener/pool for now as per UI
            if (payload.listenerName || payload.poolName || payload.connectionLimit) {
                 ServiceResponse getResp = get(cloud, projectId, lbId)
                 if (getResp.success) {
                      def lb = getResp.data
                      
                      // Update Listener
                      if (payload.listenerName || payload.connectionLimit) {
                          def listeners = lb.listeners
                          if (listeners) {
                              String lisId = listeners[0].id
                              Map lisUpdates = [:]
                              if (payload.listenerName) lisUpdates.name = payload.listenerName
                              if (payload.connectionLimit != null) lisUpdates.connection_limit = payload.connectionLimit
                              
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
                      if (payload.poolName) {
                          def pools = lb.pools
                          if (pools) {
                              String poolId = pools[0].id
                              ServiceResponse pResp = client.put("/v2.0/lbaas/pools/${poolId}", [pool: [name: payload.poolName]])
                              if (!pResp.success) {
                                  success = false
                                  errors << "Pool Update: ${pResp.msg ?: pResp.error}"
                              }
                          }
                      }
                 }
            }

            if (success) {
                return ServiceResponse.success()
            } else {
                return ServiceResponse.error("Update failed: ${errors.join(', ')}")
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
                 return ServiceResponse.error("Delete Load Balancer failed: ${response.msg ?: response.error}")
             }
        } catch (Exception e) {
             log.error("Error deleting load balancer: ${e.message}", e)
             return ServiceResponse.error("Error deleting load balancer: ${e.message}")
        }
    }

    /**
     * Helper to instantiate an authenticated client
     */
    private OctaviaApiClient getClient(Cloud cloud, String projectId) {
        OpenStackAuthClient auth = new OpenStackAuthClient(cloud)
        Map session = auth.getSession(projectId)
        
        // Use the 'endpoint' from session which is the public Octavia URL
        String endpoint = session.endpoint
        if (!endpoint) {
             throw new RuntimeException("No Octavia endpoint found in Keystone catalog")
        }
        
        return new OctaviaApiClient(new HttpApiClient(), endpoint, session.token)
    }
}
