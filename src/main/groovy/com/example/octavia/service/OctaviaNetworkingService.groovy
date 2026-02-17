package com.example.octavia.service

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.model.Cloud
import com.morpheusdata.response.ServiceResponse
import com.example.octavia.client.OctaviaApiClient
import com.example.octavia.client.OpenStackAuthClient
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaNetworkingService {

    MorpheusContext morpheusContext
    
    OctaviaNetworkingService(MorpheusContext morpheusContext) {
        this.morpheusContext = morpheusContext
    }

    /**
     * List Floating IPs.
     * @param filters - e.g. [status: 'DOWN', floating_network_id: '...']
     */
    ServiceResponse<List<Map>> listFloatingIps(Cloud cloud, String projectId, Map filters = [:]) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            
            // Build query string
            String query = filters.collect { k, v -> "${k}=${v}" }.join('&')
            String path = "/v2.0/floatingips" + (query ? "?${query}" : "")
            
            ServiceResponse response = client.get(path)
            
            if (response.success) {
                return ServiceResponse.success(response.data?.floatingips ?: [])
            } else {
                return ServiceResponse.error("List Floating IPs failed: ${response.msg ?: response.error}")
            }
        } catch (Exception e) {
            log.error("Error listing floating IPs: ${e.message}", e)
            return ServiceResponse.error("Error listing floating IPs: ${e.message}")
        }
    }

    /**
     * Associate a Floating IP with a Port.
     */
    ServiceResponse associateFloatingIp(Cloud cloud, String projectId, String fipId, String portId) {
        return updateFloatingIp(cloud, projectId, fipId, [port_id: portId])
    }

    /**
     * Disassociate a Floating IP.
     */
    ServiceResponse disassociateFloatingIp(Cloud cloud, String projectId, String fipId) {
        return updateFloatingIp(cloud, projectId, fipId, [port_id: null])
    }
    
    /**
     * Update Floating IP (Generic).
     */
    ServiceResponse updateFloatingIp(Cloud cloud, String projectId, String fipId, Map updates) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            
            Map payload = [floatingip: updates]
            ServiceResponse response = client.put("/v2.0/floatingips/${fipId}", payload)
            
            if (response.success) {
                return ServiceResponse.success(response.data?.floatingip)
            } else {
                return ServiceResponse.error("Update Floating IP failed: ${response.msg ?: response.error}")
            }
        } catch (Exception e) {
            log.error("Error updating floating IP: ${e.message}", e)
            return ServiceResponse.error("Error updating floating IP: ${e.message}")
        }
    }

    private OctaviaApiClient getClient(Cloud cloud, String projectId) {
        OpenStackAuthClient auth = new OpenStackAuthClient(cloud)
        Map session = auth.getSession(projectId)
        
        String endpoint = session.neutronUrl
        if (!endpoint) {
             throw new RuntimeException("No Neutron endpoint found in Keystone catalog")
        }
        
        return new OctaviaApiClient(new HttpApiClient(), endpoint, session.token)
    }
}
