package com.example.backend

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.util.logging.Slf4j

/**
 * OpenStack Networking (Neutron) API Client.
 * Handles Floating IPs and Port interactions.
 */
@Slf4j
class NetworkingClient {

    private final String endpoint
    private final String token

    NetworkingClient(Map session) {
        this.endpoint = session.networkEndpoint
        this.token = session.token
        // remove trailing slash if present
        if (this.endpoint.endsWith('/')) {
             this.endpoint = this.endpoint.substring(0, this.endpoint.length() - 1)
        }
    }

    /**
     * List Floating IPs for the current project.
     * Optionally filter by status (e.g. 'DOWN' for available) or network/pool.
     */
    Map listFloatingIps(Map filters = [:]) {
        def query = filters.collect { k, v -> "${k}=${v}" }.join('&')
        def path = "/v2.0/floatingips"
        if (query) path += "?${query}"
        return get(path)
    }

    /**
     * Update a Floating IP (Associate/Disassociate).
     * To Associate: port_id = "uuid"
     * To Disassociate: port_id = null
     */
    Map updateFloatingIp(String fipId, String portId) {
        def body = [
            floatingip: [
                port_id: portId
            ]
        ]
        return put("/v2.0/floatingips/${fipId}", body)
    }

    /**
     * Create a new Floating IP in a specific public network (pool).
     */
    Map createFloatingIp(String publicNetworkId) {
         def body = [
            floatingip: [
                floating_network_id: publicNetworkId
            ]
        ]
        return post("/v2.0/floatingips", body)
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

    private Map call(String method, String path, Map body) {
        def urlStr = "${endpoint}${path}"
        log.debug("Neutron request: ${method} ${urlStr}")
        
        def conn = new URL(urlStr).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.setRequestProperty('X-Auth-Token', token)
        conn.setRequestProperty('Accept', 'application/json')
        conn.setRequestProperty('Content-Type', 'application/json')
        
        if (body != null) {
            conn.doOutput = true
            conn.outputStream.withWriter { it.write(JsonOutput.toJson(body)) }
        }

        def status = conn.responseCode
        if (status >= 200 && status < 300) {
            if (status == 204) return [:] 
            return new JsonSlurper().parse(conn.inputStream) as Map
        } else {
            def err = conn.errorStream?.text
            log.error("Neutron Error ${status}: ${err}")
            throw new RuntimeException("Networking API Error (${status})")
        }
    }
}
