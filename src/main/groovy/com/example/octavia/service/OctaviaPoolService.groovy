package com.example.octavia.service

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.model.Cloud
import com.morpheusdata.response.ServiceResponse
import com.example.octavia.client.OctaviaApiClient
import com.example.octavia.client.OpenStackAuthClient
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaPoolService {

    MorpheusContext morpheusContext
    
    OctaviaPoolService(MorpheusContext morpheusContext) {
        this.morpheusContext = morpheusContext
    }

    /**
     * Update a Pool.
     */
    ServiceResponse updatePool(Cloud cloud, String projectId, String poolId, Map updates) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            
            Map payload = [pool: updates]
            ServiceResponse response = client.put("/v2.0/lbaas/pools/${poolId}", payload)
            
            if (response.success) {
                return ServiceResponse.success(response.data?.pool)
            } else {
                return ServiceResponse.error("Update Pool failed: ${response.msg ?: response.error}")
            }
        } catch (Exception e) {
            log.error("Error updating pool: ${e.message}", e)
            return ServiceResponse.error("Error updating pool: ${e.message}")
        }
    }

    /**
     * Update a Listener.
     */
    ServiceResponse updateListener(Cloud cloud, String projectId, String listenerId, Map updates) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            
            Map payload = [listener: updates]
            ServiceResponse response = client.put("/v2.0/lbaas/listeners/${listenerId}", payload)
            
            if (response.success) {
                return ServiceResponse.success(response.data?.listener)
            } else {
                 return ServiceResponse.error("Update Listener failed: ${response.msg ?: response.error}")
            }
        } catch (Exception e) {
            log.error("Error updating listener: ${e.message}", e)
            return ServiceResponse.error("Error updating listener: ${e.message}")
        }
    }

    private OctaviaApiClient getClient(Cloud cloud, String projectId) {
        OpenStackAuthClient auth = new OpenStackAuthClient(cloud)
        Map session = auth.getSession(projectId)
        
        String endpoint = session.endpoint
        if (!endpoint) {
             throw new RuntimeException("No Octavia endpoint found in Keystone catalog")
        }
        
        return new OctaviaApiClient(new HttpApiClient(), endpoint, session.token)
    }
}
