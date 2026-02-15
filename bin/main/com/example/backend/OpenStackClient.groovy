package com.example.backend

import com.morpheusdata.model.Cloud
import com.morpheusdata.model.Account
import groovy.json.JsonSlurper
import groovy.json.JsonOutput
import groovy.util.logging.Slf4j
import java.util.concurrent.ConcurrentHashMap

/**
 * Handles OpenStack Keystone v3 Authentication.
 * Manages token lifecycle and scoping per tenant/project.
 */
@Slf4j
class OpenStackClient {

    private final Cloud cloud
    private final String authUrl

    // Cache tokens key: "projectId" -> { token: "...", expires: long }
    private static final Map<String, Map> tokenCache = new ConcurrentHashMap<>()

    OpenStackClient(Cloud cloud) {
        this.cloud = cloud
        // Ensure v3 URL
        def url = cloud.serviceUrl
        if (url && !url.endsWith('/v3')) {
             url = url.endsWith('/') ? url + 'v3' : url + '/v3'
        }
        this.authUrl = url
    }

    /**
     * Authenticate and return the scoped token + Octavia endpoint.
     * Returns a Map: [token: "...", endpoint: "https://..."]
     */
    Map getSession(String projectId) {
        def cacheKey = "${cloud.id}:${projectId}"
        def cached = tokenCache[cacheKey]
        if (cached && System.currentTimeMillis() < cached.expires) {
            return cached
        }

        log.info("Requesting new scoped session for Cloud: ${cloud.name}, Project: ${projectId}")
        return authenticate(projectId, cacheKey)
    }

    private Map authenticate(String projectId, String cacheKey) {
        def config = cloud.configMap
        // Credentials - prioritize AccountCredential object if linked
        def username = cloud.accountCredential?.data?.username ?: config.username
        def password = cloud.accountCredential?.data?.password ?: config.password
        def domain = config.domain ?: 'default' 

        // Payload for Scoped Auth
        def payload = [
            auth: [
                identity: [
                    methods: ['password'],
                    password: [
                        user: [
                            name: username,
                            domain: [id: domain], 
                            password: password
                        ]
                    ]
                ],
                scope: [
                    project: [
                        id: projectId // Scope: Project ID
                    ]
                ]
            ]
        ]
        
        // Handle domain name vs ID ambiguity 
        if(domain != 'default') {
             payload.auth.identity.password.user.domain = [name: domain]
        }

        def url = "${authUrl}/auth/tokens"
        def conn = new URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = 'POST'
        conn.setRequestProperty('Content-Type', 'application/json')
        conn.doOutput = true
        conn.outputStream.withWriter { it.write(JsonOutput.toJson(payload)) }

        if (conn.responseCode == 201) {
            String token = conn.getHeaderField('X-Subject-Token')
            def resp = new JsonSlurper().parse(conn.inputStream)
            
            // 1. Expiration
            String expiresStr = resp.token.expires_at
            // Cache for 20 mins or parse simpler
            long expiresAt = System.currentTimeMillis() + (20 * 60 * 1000) 

            // 2. Service Catalog -> Endpoints
            def catalog = resp.token.catalog
            
            // Octavia (load-balancer)
            def octaviaSvc = catalog.find { it.type == 'load-balancer' }
            if (!octaviaSvc) throw new RuntimeException("Octavia (load-balancer) service not found in Keystone catalog")
            def octaviaEp = octaviaSvc.endpoints.find { it.interface == 'public' } ?: octaviaSvc.endpoints[0]
            
            // Neutron (network)
            def neutronSvc = catalog.find { it.type == 'network' }
            if (!neutronSvc) throw new RuntimeException("Neutron (network) service not found in Keystone catalog")
            def neutronEp = neutronSvc.endpoints.find { it.interface == 'public' } ?: neutronSvc.endpoints[0]

            def session = [
                token: token, 
                endpoint: octaviaEp?.url, 
                networkEndpoint: neutronEp?.url,
                expires: expiresAt
            ]
            tokenCache[cacheKey] = session
            return session
        } else {
            def err = conn.errorStream?.text
            log.error("Keystone Auth Failed: ${conn.responseCode} - ${err}")
            throw new RuntimeException("Authentication failed: ${conn.responseMessage}")
        }
    }
}
