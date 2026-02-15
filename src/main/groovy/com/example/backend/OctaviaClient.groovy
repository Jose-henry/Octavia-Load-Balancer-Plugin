package com.example.backend

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.util.logging.Slf4j

/**
 * Octavia v2.0 API Client.
 * Uses a valid execution session (token + endpoint) to call Octavia.
 */
@Slf4j
class OctaviaClient {

    private final String endpoint
    private final String token

    OctaviaClient(Map session) {
        this.endpoint = session.endpoint
        this.token = session.token
        // remove trailing slash if present
        if (this.endpoint.endsWith('/')) {
             this.endpoint = this.endpoint.substring(0, this.endpoint.length() - 1)
        }
    }

    /**
     * List Load Balancers.
     * @return List of LB maps
     */
    Map listLoadBalancers() {
        return get("/v2.0/lbaas/loadbalancers")
    }

    /**
     * Get details of a single Load Balancer.
     */
    Map getLoadBalancer(String lbId) {
        return get("/v2.0/lbaas/loadbalancers/${lbId}")
    }

    /**
     * Create a Load Balancer (Cascading).
     * The payload should be the full tree: loadbalancer: { ..., listeners: [ { ..., default_pool: { ... } } ] }
     */
    Map createLoadBalancer(Map payload) {
        return post("/v2.0/lbaas/loadbalancers", payload)
    }

    /**
     * Delete a Load Balancer.
     * @param cascade If true, deletes all child resources (listeners, pools, etc.)
     */
    void deleteLoadBalancer(String lbId, boolean cascade = true) {
        delete("/v2.0/lbaas/loadbalancers/${lbId}?cascade=${cascade}")
    }
    
    /**
     * Update Load Balancer attributes (name, description, admin_state_up).
     */
    Map updateLoadBalancer(String lbId, Map attributes) {
        return put("/v2.0/lbaas/loadbalancers/${lbId}", [loadbalancer: attributes])
    }

    /**
     * Update Listener attributes.
     */
    Map updateListener(String listenerId, Map attributes) {
        return put("/v2.0/lbaas/listeners/${listenerId}", [listener: attributes])
    }

    /**
     * Update Pool attributes.
     */
    Map updatePool(String poolId, Map attributes) {
        return put("/v2.0/lbaas/pools/${poolId}", [pool: attributes])
    }

    /**
     * Update Health Monitor attributes.
     */
    Map updateHealthMonitor(String monitorId, Map attributes) {
        return put("/v2.0/lbaas/healthmonitors/${monitorId}", [healthmonitor: attributes])
    }
    
    // --- HTTP Helpers ---

    private Map get(String path) {
        return call("GET", path, null)
    }

    private Map post(String path, Map body) {
        return call("POST", path, body)
    }

    private Map put(String path, Map body) {
        return call("PUT", path, body)
    }
    
    private void delete(String path) {
        call("DELETE", path, null)
    }

    private Map call(String method, String path, Map body) {
        def urlStr = "${endpoint}${path}"
        log.debug("Octavia request: ${method} ${urlStr}")
        
        def conn = new URL(urlStr).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.setRequestProperty('X-Auth-Token', token)
        conn.setRequestProperty('Accept', 'application/json')
        
        if (body != null) {
            conn.setRequestProperty('Content-Type', 'application/json')
            conn.doOutput = true
            conn.outputStream.withWriter { it.write(JsonOutput.toJson(body)) }
        }

        def status = conn.responseCode
        if (status >= 200 && status < 300) {
            if (status == 204) return [:] // No content
            return new JsonSlurper().parse(conn.inputStream) as Map
        } else {
            def err = conn.errorStream?.text
            log.error("Octavia Error ${status}: ${err}")
            throw new RuntimeException("Octavia API Error (${status})")
        }
    }
}
