package com.example.octavia.client

import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.core.util.HttpApiClient.RequestOptions
import com.morpheusdata.response.ServiceResponse
import groovy.json.JsonSlurper
import groovy.util.logging.Slf4j
import org.apache.http.entity.ContentType

@Slf4j
class OctaviaApiClient {

    HttpApiClient client
    String baseUrl
    String token
    
    public OctaviaApiClient(HttpApiClient client, String baseUrl, String token) {
        this.client = client
        this.baseUrl = baseUrl
        this.token = token
    }

    /**
     * Generic GET request
     */
    ServiceResponse get(String path) {
        return call('GET', path, null)
    }

    /**
     * Generic POST request
     */
    ServiceResponse post(String path, Map body) {
        return call('POST', path, body)
    }

    /**
     * Generic PUT request
     */
    ServiceResponse put(String path, Map body) {
        return call('PUT', path, body)
    }

    /**
     * Generic DELETE request
     */
    ServiceResponse delete(String path) {
        return call('DELETE', path, null)
    }

    /**
     * Internal call helper
     */
    private ServiceResponse call(String method, String path, Map body) {
        RequestOptions opts = new RequestOptions()
        opts.headers = ['X-Auth-Token': this.token]
        opts.contentType = ContentType.APPLICATION_JSON.toString()
        
        if(body) {
            opts.body = body
        }

        // Handle path having leading slash or not
        String fullPath = path.startsWith(this.baseUrl) ? path : "${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}"
        
        // Log for debug (remove sensitive data in prod)
        log.debug("OctaviaApiClient calling ${method} ${fullPath}")

        return client.callJsonApi(fullPath, null,  opts, method)
    }
}
