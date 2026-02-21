package com.example.octavia.service

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.model.Cloud
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.util.logging.Slf4j
import org.apache.http.client.methods.CloseableHttpResponse
import org.apache.http.client.methods.HttpPost
import org.apache.http.entity.StringEntity
import org.apache.http.impl.client.CloseableHttpClient
import org.apache.http.impl.client.HttpClients
import org.apache.http.util.EntityUtils
import org.apache.http.conn.ssl.NoopHostnameVerifier
import org.apache.http.conn.ssl.SSLConnectionSocketFactory
import org.apache.http.ssl.SSLContexts
import org.apache.http.ssl.TrustStrategy
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext

/**
 * Service dedicated to handling authentication with OpenStack Keystone (Identity v3).
 * Extracts credentials directly from the Morpheus Cloud object and generates
 * a scoped X-Subject-Token for use with the Octavia Load Balancer API.
 */
@Slf4j
class OctaviaAuthService {

    // Simple JVM-level cache for Keystone tokens across the plugin.
    // Key: "cloudId:tenantName", Value: [token: String, loadBalancerApi: String, expiresAt: Long]
    private static Map<String, Map> tokenCache = [:]

    private final MorpheusContext morpheus

    OctaviaAuthService(MorpheusContext morpheus) {
        this.morpheus = morpheus
        log.info("OctaviaAuthService initialized")
    }

    /**
     * Core method to authenticate and return the required endpoints and active token.
     * @param cloud The Morpheus Cloud (ComputeZone) object
     * @param tenantName The tenant/project name resolved from the Network Context (optional if present in Cloud config)
     * @return Map containing: [success: boolean, token: String, loadBalancerApi: String, error: String]
     */
    Map getAuthToken(Cloud cloud, String tenantName = null) {
        if (!cloud) {
            log.error("getAuthToken failed: Cloud context is null")
            return [success: false, error: "Cloud context is null"]
        }

        try {
            log.info("Starting authentication flow for Cloud '{}' (ID: {})", cloud.name, cloud.id)

            // Check Cache First
            String cacheKey = "${cloud.id}:${tenantName ?: 'default'}"
            Map cb = tokenCache[cacheKey]
            long now = System.currentTimeMillis()
            // Keystone tokens usually last 1 hour. We cache for 50 minutes (3,000,000 ms)
            if (cb != null && cb.expiresAt > now) {
                log.debug("Using cached Keystone token for Cloud '{}', Project '{}'", cloud.name, tenantName)
                return [success: true, token: cb.token, loadBalancerApi: cb.loadBalancerApi]
            }

            // Step 1: Extract Endpoints and Credentials
            Map creds = extractCredentials(cloud, tenantName)
            if (!creds.success) {
                return creds // Bubble up the error exactly as encountered
            }

            // Step 2: Ensure we have required URLs
            if (!creds.identityApi || !creds.loadBalancerApi) {
                log.error("Missing required API endpoints in Cloud configuration. identityApi: {}, loadBalancerApi: {}", creds.identityApi, creds.loadBalancerApi)
                return [success: false, error: "Missing identityApi or loadBalancerApi in Cloud configuration"]
            }

            // Step 3: Fetch the Token from Keystone
            Map tokenResponse = requestKeystoneToken(creds)
            if (tokenResponse.success) {
                log.info("Successfully acquired Keystone token for Cloud '{}'", cloud.name)
                
                // Save to cache for 50 minutes
                tokenCache[cacheKey] = [
                    token: tokenResponse.token,
                    loadBalancerApi: creds.loadBalancerApi,
                    expiresAt: System.currentTimeMillis() + 3000000 // 50 mins
                ]

                return [
                    success: true,
                    token: tokenResponse.token,
                    loadBalancerApi: creds.loadBalancerApi
                ]
            } else {
                return tokenResponse
            }

        } catch (Exception ex) {
            log.error("getAuthToken failed unexpectedly: {}", ex.message, ex)
            return [success: false, error: "Authentication failed: ${ex.message}"]
        }
    }

    /**
     * Extracts endpoints and account credentials from the Cloud object.
     */
    private Map extractCredentials(Cloud cloud, String tenantName = null) {
        try {
            // Force load the securely linked AccountCredentials from the DB in case they aren't fully hydrated
            def loadedCreds = morpheus.async.cloud.loadCredentials(cloud.id)?.blockingGet()
            log.debug("Loaded AccountCredential ID: {}", loadedCreds?.id)

            Map config = cloud.getConfigMap() ?: [:]
            Map credData = cloud.getAccountCredentialData() ?: [:]

            String identityApi = config.get("identityApi")
            String loadBalancerApi = config.get("loadBalancerApi")

            // Keystone payload requirements
            String domainId = config.get("domainId")
            String projectName = config.get("projectName") ?: config.get("tenantName") ?: config.get("tenant") ?: tenantName ?: cloud.getAccount()?.name
            String username = credData.get("username") ?: cloud.getServiceUsername()
            String password = credData.get("password") ?: cloud.getServicePassword()

            log.debug("Extracted Credentials for Auth Payload:")
            log.debug("  identityApi: {}", identityApi)
            log.debug("  loadBalancerApi: {}", loadBalancerApi)
            log.debug("  domainId: {}", domainId)
            log.debug("  projectName (tenant): {}", projectName)
            log.debug("  username: {}", username ? "PRESENT" : "MISSING")
            log.debug("  password: {}", password ? "PRESENT" : "MISSING")

            if (!username || !password) {
                log.error("Cloud credentials (username or password) are missing or blank.")
                return [success: false, error: "Cloud credentials (username or password) are missing or blank."]
            }
            if (!projectName) {
                log.error("Cloud configuration is missing the Project (Tenant) name. Config keys available: {}", config.keySet())
                return [success: false, error: "Cloud configuration missing Project (Tenant) name."]
            }

            return [
                success: true,
                identityApi: identityApi,
                loadBalancerApi: loadBalancerApi,
                domainId: domainId,
                projectName: projectName,
                username: username,
                password: password
            ]

        } catch (Exception ex) {
            log.error("Failed to extract credentials from Cloud {}: {}", cloud.id, ex.message, ex)
            return [success: false, error: "Failed to extract credentials from Cloud: ${ex.message}"]
        }
    }

    /**
     * Crafts the Keystone v3 payload and executes the HTTP POST request.
     */
    private Map requestKeystoneToken(Map creds) {
        CloseableHttpClient client = createInsecureHttpClient()
        CloseableHttpResponse response = null
        try {
            // Append /auth/tokens if not already part of the identity API path
            String authUrl = creds.identityApi
            if (!authUrl.endsWith("/auth/tokens")) {
                authUrl = authUrl.replaceAll("/\$", "") + "/auth/tokens"
            }
            
            log.info("POSTing to Keystone Auth URL: {}", authUrl)

            HttpPost post = new HttpPost(authUrl)
            post.setHeader("Content-Type", "application/json")

            // Build the scoped Keystone Identity v3 payload
            def payloadMap = [
                auth: [
                    identity: [
                        methods: ["password"],
                        password: [
                            user: [
                                domain: [
                                    id: creds.domainId ?: "default"
                                ],
                                name: creds.username,
                                password: creds.password
                            ]
                        ]
                    ],
                    scope: [
                        project: [
                            domain: [
                                id: creds.domainId ?: "default"
                            ]
                        ]
                    ]
                ]
            ]
            
            // In Morpheus, the tenant mapping is often the OpenStack Project ID (UUID).
            // Keystone API expects UUIDs in `project.id` and string names in `project.name`.
            if (creds.projectName?.replaceAll("-", "")?.matches("^[0-9a-fA-F]{32}\$")) {
                payloadMap.auth.scope.project.id = creds.projectName
                log.info("Project identifier {} is a UUID, passing to Keystone as project.id", creds.projectName)
            } else {
                payloadMap.auth.scope.project.name = creds.projectName
                log.info("Project identifier {} is a string string, passing to Keystone as project.name", creds.projectName)
            }
            
            // You can also use domain NAME if domain ID is strictly not required, 
            // but standard openstack prefers domain ID if present.
            // Adjusting payload above since MTNNG logs show domainId: a6e978166e994a488e1d33a3a2a49cf7

            log.info("--- KEYSTONE EXACT CREDENTIALS ---")
            log.info("Username: '{}'", creds.username)
            log.info("User Domain ID: '{}'", creds.domainId)
            log.info("Project Domain ID: '{}'", creds.domainId)
            log.info("Project Name: '{}'", creds.projectName)
            log.info("Password Length: {}", creds.password?.length())
            log.info("----------------------------------")

            String jsonPayload = JsonOutput.toJson(payloadMap)
            post.setEntity(new StringEntity(jsonPayload))
            
            log.info("Keystone Auth Payload: {}", jsonPayload)
            
            // Executing the request...
            log.debug("Executing HTTP Post to Keystone...")
            response = client.execute(post)
            int statusCode = response.getStatusLine().getStatusCode()
            String responseBody = EntityUtils.toString(response.getEntity())
            
            log.info("Keystone Auth Response Code: {}", statusCode)
            
            if (statusCode == 201) {
                // The token is returned in the X-Subject-Token header
                def tokenHeader = response.getFirstHeader("X-Subject-Token")
                if (tokenHeader != null && tokenHeader.getValue()) {
                    String token = tokenHeader.getValue()
                    log.debug("Successfully extracted X-Subject-Token. (length: {})", token.length())
                    return [success: true, token: token]
                } else {
                    log.error("HTTP 201 received from Keystone, but X-Subject-Token header was missing! Headers: {}", response.getAllHeaders().collect { "${it.name}: ${it.value}" })
                    return [success: false, error: "X-Subject-Token header missing in Keystone response"]
                }
            } else {
                log.error("Keystone auth failed. Status: {}, Body: {}", statusCode, responseBody)
                return [success: false, error: "Keystone auth failed with HTTP ${statusCode}: ${responseBody}"]
            }

        } catch (Exception ex) {
            log.error("Exception during Keystone token request: {}", ex.message, ex)
            return [success: false, error: "HTTP request to Keystone failed: ${ex.message}"]
        } finally {
            if (response != null) {
                try { response.close() } catch (Exception e) {}
            }
            if (client != null) {
                try { client.close() } catch (Exception e) {}
            }
        }
    }

    /**
     * Creates an HttpClient that bypasses SSL certificate validation.
     * Necessary for communication with OpenStack instances using self-signed certs.
     */
    private CloseableHttpClient createInsecureHttpClient() {
        TrustStrategy acceptingTrustStrategy = new TrustStrategy() {
            @Override
            boolean isTrusted(X509Certificate[] chain, String authType) {
                return true
            }
        }
        SSLContext sslContext = SSLContexts.custom()
                .loadTrustMaterial(null, acceptingTrustStrategy)
                .build()
        SSLConnectionSocketFactory csf = new SSLConnectionSocketFactory(sslContext, NoopHostnameVerifier.INSTANCE)
        return HttpClients.custom().setSSLSocketFactory(csf).build()
    }
}
