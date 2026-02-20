package com.example.octavia.service

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.model.Cloud
import com.morpheusdata.response.ServiceResponse
import com.example.octavia.client.OctaviaApiClient
import com.example.octavia.client.OpenStackAuthClient
import groovy.util.logging.Slf4j

/**
 * Service for managing Octavia sub-resources: Listeners, Pools, Members, Health Monitors.
 * All endpoints follow the Octavia API v2 specification:
 * https://docs.openstack.org/api-ref/load-balancer/v2/index.html
 */
@Slf4j
class OctaviaPoolService {

    MorpheusContext morpheusContext

    OctaviaPoolService(MorpheusContext morpheusContext) {
        this.morpheusContext = morpheusContext
    }

    // ─── Listeners ──────────────────────────────────────────────────

    ServiceResponse<List> listListeners(Cloud cloud, String projectId, String lbId = null) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            String path = "/v2.0/lbaas/listeners"
            if (lbId) path += "?loadbalancer_id=${lbId}"
            def resp = client.get(path)
            return resp.success ? ServiceResponse.success(resp.data?.listeners ?: []) :
                ServiceResponse.error("List Listeners failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error listing listeners: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse createListener(Cloud cloud, String projectId, String lbId, Map config) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            Map payload = [
                listener: [
                    name: config.name ?: config.listenerName,
                    protocol: config.protocol ?: config.listenerProtocol ?: 'HTTP',
                    protocol_port: config.port ?: config.listenerPort ?: 80,
                    loadbalancer_id: lbId,
                    admin_state_up: true
                ]
            ]
            if (config.connectionLimit && config.connectionLimit != -1) {
                payload.listener.connection_limit = config.connectionLimit
            }
            def resp = client.post("/v2.0/lbaas/listeners", payload)
            return resp.success ? ServiceResponse.success(resp.data?.listener) :
                ServiceResponse.error("Create Listener failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error creating listener: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse updateListener(Cloud cloud, String projectId, String listenerId, Map updates) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            Map payload = [listener: [:]]
            if (updates.name) payload.listener.name = updates.name
            if (updates.connectionLimit != null) payload.listener.connection_limit = updates.connectionLimit
            if (updates.admin_state_up != null) payload.listener.admin_state_up = updates.admin_state_up
            if (updates.description != null) payload.listener.description = updates.description

            def resp = client.put("/v2.0/lbaas/listeners/${listenerId}", payload)
            return resp.success ? ServiceResponse.success(resp.data?.listener) :
                ServiceResponse.error("Update Listener failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error updating listener: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse deleteListener(Cloud cloud, String projectId, String listenerId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            def resp = client.delete("/v2.0/lbaas/listeners/${listenerId}")
            return resp.success ? ServiceResponse.success() :
                ServiceResponse.error("Delete Listener failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error deleting listener: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    // ─── Pools ──────────────────────────────────────────────────────

    ServiceResponse<List> listPools(Cloud cloud, String projectId, String lbId = null) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            String path = "/v2.0/lbaas/pools"
            if (lbId) path += "?loadbalancer_id=${lbId}"
            def resp = client.get(path)
            return resp.success ? ServiceResponse.success(resp.data?.pools ?: []) :
                ServiceResponse.error("List Pools failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error listing pools: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse createPool(Cloud cloud, String projectId, String listenerId, Map config) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            Map payload = [
                pool: [
                    name: config.name ?: config.poolName,
                    protocol: config.protocol ?: config.poolProtocol ?: 'HTTP',
                    lb_algorithm: config.algorithm ?: config.poolAlgorithm ?: 'ROUND_ROBIN',
                    listener_id: listenerId,
                    admin_state_up: true
                ]
            ]
            if (config.description) payload.pool.description = config.description
            if (config.sessionPersistence && config.sessionPersistence != 'None') {
                Map sp = [type: config.sessionPersistence]
                if (config.sessionPersistence == 'APP_COOKIE' && config.cookieName) {
                    sp.cookie_name = config.cookieName
                }
                payload.pool.session_persistence = sp
            }
            def resp = client.post("/v2.0/lbaas/pools", payload)
            return resp.success ? ServiceResponse.success(resp.data?.pool) :
                ServiceResponse.error("Create Pool failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error creating pool: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse updatePool(Cloud cloud, String projectId, String poolId, Map updates) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            Map payload = [pool: [:]]
            if (updates.name) payload.pool.name = updates.name
            if (updates.algorithm) payload.pool.lb_algorithm = updates.algorithm
            if (updates.description != null) payload.pool.description = updates.description
            if (updates.admin_state_up != null) payload.pool.admin_state_up = updates.admin_state_up

            def resp = client.put("/v2.0/lbaas/pools/${poolId}", payload)
            return resp.success ? ServiceResponse.success(resp.data?.pool) :
                ServiceResponse.error("Update Pool failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error updating pool: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse deletePool(Cloud cloud, String projectId, String poolId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            def resp = client.delete("/v2.0/lbaas/pools/${poolId}")
            return resp.success ? ServiceResponse.success() :
                ServiceResponse.error("Delete Pool failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error deleting pool: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    // ─── Members ────────────────────────────────────────────────────

    ServiceResponse<List> listMembers(Cloud cloud, String projectId, String poolId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            def resp = client.get("/v2.0/lbaas/pools/${poolId}/members")
            return resp.success ? ServiceResponse.success(resp.data?.members ?: []) :
                ServiceResponse.error("List Members failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error listing members: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse addMember(Cloud cloud, String projectId, String poolId, Map config) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            Map payload = [
                member: [
                    address: config.address,
                    protocol_port: config.port ?: 80,
                    weight: config.weight ?: 1,
                    admin_state_up: true
                ]
            ]
            if (config.subnetId) payload.member.subnet_id = config.subnetId
            if (config.name) payload.member.name = config.name
            def resp = client.post("/v2.0/lbaas/pools/${poolId}/members", payload)
            return resp.success ? ServiceResponse.success(resp.data?.member) :
                ServiceResponse.error("Add Member failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error adding member: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse removeMember(Cloud cloud, String projectId, String poolId, String memberId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            def resp = client.delete("/v2.0/lbaas/pools/${poolId}/members/${memberId}")
            return resp.success ? ServiceResponse.success() :
                ServiceResponse.error("Remove Member failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error removing member: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    // ─── Health Monitors ────────────────────────────────────────────

    ServiceResponse getHealthMonitor(Cloud cloud, String projectId, String hmId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            def resp = client.get("/v2.0/lbaas/healthmonitors/${hmId}")
            return resp.success ? ServiceResponse.success(resp.data?.healthmonitor) :
                ServiceResponse.error("Get HealthMonitor failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error getting health monitor: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse createHealthMonitor(Cloud cloud, String projectId, String poolId, Map config) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            Map payload = [
                healthmonitor: [
                    type: config.type ?: config.monitorType ?: 'HTTP',
                    delay: config.delay ?: 5,
                    timeout: config.timeout ?: 5,
                    max_retries: config.maxRetries ?: 3,
                    pool_id: poolId,
                    admin_state_up: true
                ]
            ]
            if (config.name) payload.healthmonitor.name = config.name
            if (config.maxRetriesDown) payload.healthmonitor.max_retries_down = config.maxRetriesDown
            if (config.type in ['HTTP', 'HTTPS']) {
                payload.healthmonitor.http_method = config.httpMethod ?: 'GET'
                payload.healthmonitor.url_path = config.urlPath ?: '/'
                payload.healthmonitor.expected_codes = config.expectedCodes ?: '200'
            }
            def resp = client.post("/v2.0/lbaas/healthmonitors", payload)
            return resp.success ? ServiceResponse.success(resp.data?.healthmonitor) :
                ServiceResponse.error("Create HealthMonitor failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error creating health monitor: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse updateHealthMonitor(Cloud cloud, String projectId, String hmId, Map updates) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            Map payload = [healthmonitor: [:]]
            if (updates.delay) payload.healthmonitor.delay = updates.delay
            if (updates.timeout) payload.healthmonitor.timeout = updates.timeout
            if (updates.maxRetries) payload.healthmonitor.max_retries = updates.maxRetries
            if (updates.name) payload.healthmonitor.name = updates.name

            def resp = client.put("/v2.0/lbaas/healthmonitors/${hmId}", payload)
            return resp.success ? ServiceResponse.success(resp.data?.healthmonitor) :
                ServiceResponse.error("Update HealthMonitor failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error updating health monitor: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    ServiceResponse deleteHealthMonitor(Cloud cloud, String projectId, String hmId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            def resp = client.delete("/v2.0/lbaas/healthmonitors/${hmId}")
            return resp.success ? ServiceResponse.success() :
                ServiceResponse.error("Delete HealthMonitor failed: ${resp.msg}")
        } catch (Exception e) {
            log.error("Error deleting health monitor: ${e.message}", e)
            return ServiceResponse.error(e.message)
        }
    }

    // ─── Internal ───────────────────────────────────────────────────

    private OctaviaApiClient getClient(Cloud cloud, String projectId) {
        OpenStackAuthClient auth = new OpenStackAuthClient(cloud)
        Map session = auth.getSession(projectId)

        String endpoint = session.octaviaUrl
        if (!endpoint) {
             throw new RuntimeException("No Octavia endpoint found in Keystone catalog for cloud ${cloud.id}")
        }

        return new OctaviaApiClient(new HttpApiClient(), endpoint, session.token as String)
    }
}
