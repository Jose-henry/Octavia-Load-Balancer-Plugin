package com.example.octavia.service

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.model.Cloud
import groovy.json.JsonOutput
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
 * Auth service used only by the loadbalancersFromDb API route when expand=octavia.
 * Fetches cloud by ID from query param, loads credentials from AccountCredential,
 * and always authenticates with the admin project. Does not touch or replace
 * OctaviaAuthService used for UI create/update/delete and other routes.
 */
@Slf4j
class OctaviaExpandAuthService {

    private static final String ADMIN_PROJECT = 'admin'

    private final MorpheusContext morpheus

    OctaviaExpandAuthService(MorpheusContext morpheus) {
        this.morpheus = morpheus
    }

    /**
     * Get Keystone token and endpoints for the given cloud using admin project.
     * @param cloudId Morpheus cloud ID (from query param e.g. cloud=4)
     * @return [success: boolean, token: String, loadBalancerApi: String, networkApi: String, error: String]
     */
    Map getAuthToken(Long cloudId) {
        if (!cloudId) {
            return [success: false, error: 'Cloud ID is required']
        }

        try {
            Cloud cloud = morpheus.async.cloud.getCloudById(cloudId)?.blockingGet()
            if (!cloud) {
                return [success: false, error: "Cloud with ID ${cloudId} not found"]
            }

            log.info("OctaviaExpandAuthService: authenticating for cloud '{}' (ID: {}) with project '{}'", cloud.name, cloud.id, ADMIN_PROJECT)

            Map config = cloud.getConfigMap() ?: [:]
            String identityApi = config.get("identityApi")
            String loadBalancerApi = config.get("loadBalancerApi")
            String networkApi = config.get("networkApi")
            String domainId = config.get("domainId")

            if (!identityApi || !loadBalancerApi) {
                return [success: false, error: "Cloud ${cloudId} missing identityApi or loadBalancerApi"]
            }

            // Load credential from AccountCredential (not from cloud.getAccountCredentialData() which may be empty when cloud is from API context)
            def loadedCreds = morpheus.async.cloud.loadCredentials(cloud.id)?.blockingGet()
            if (!loadedCreds) {
                return [success: false, error: "No credentials found for cloud ${cloudId}"]
            }

            Map credData = [:]
            try {
                if (loadedCreds.metaClass.respondsTo(loadedCreds, 'getCredentialData')) {
                    def data = loadedCreds.getCredentialData()
                    if (data instanceof Map) credData = data
                }
            } catch (Exception e) {
                log.debug("getCredentialData from AccountCredential: {}", e.message)
            }
            if (!credData) {
                credData = cloud.getAccountCredentialData() ?: [:]
            }
            String username = credData.get("username") ?: cloud.getServiceUsername()
            String password = credData.get("password") ?: cloud.getServicePassword()

            if (!username || !password) {
                return [success: false, error: "Cloud credentials (username or password) are missing or blank for cloud ${cloudId}. Configure OpenStack credentials on the cloud in Morpheus."]
            }

            Map creds = [
                identityApi: identityApi,
                loadBalancerApi: loadBalancerApi,
                networkApi: networkApi,
                domainId: domainId,
                projectName: ADMIN_PROJECT,
                username: username,
                password: password
            ]

            Map tokenResponse = requestKeystoneToken(creds)
            if (tokenResponse.success) {
                log.info("OctaviaExpandAuthService: acquired token for cloud {} (admin project)", cloudId)
                return [
                    success: true,
                    token: tokenResponse.token,
                    loadBalancerApi: loadBalancerApi,
                    networkApi: networkApi ?: loadBalancerApi
                ]
            }
            return [success: false, error: tokenResponse.error]
        } catch (Exception ex) {
            log.error("OctaviaExpandAuthService getAuthToken failed: {}", ex.message, ex)
            return [success: false, error: "Expand auth failed: ${ex.message}"]
        }
    }

    private Map requestKeystoneToken(Map creds) {
        CloseableHttpClient client = createInsecureHttpClient()
        CloseableHttpResponse response = null
        try {
            String authUrl = creds.identityApi
            if (!authUrl.endsWith("/auth/tokens")) {
                authUrl = authUrl.replaceAll(/\/$/, "") + "/auth/tokens"
            }

            HttpPost post = new HttpPost(authUrl)
            post.setHeader("Content-Type", "application/json")

            def payloadMap = [
                auth: [
                    identity: [
                        methods: ["password"],
                        password: [
                            user: [
                                domain: [id: creds.domainId ?: "default"],
                                name: creds.username,
                                password: creds.password
                            ]
                        ]
                    ],
                    scope: [
                        project: [
                            domain: [id: creds.domainId ?: "default"]
                        ]
                    ]
                ]
            ]
            if (creds.projectName?.replaceAll("-", "")?.matches("^[0-9a-fA-F]{32}\$")) {
                payloadMap.auth.scope.project.id = creds.projectName
            } else {
                payloadMap.auth.scope.project.name = creds.projectName
            }

            post.setEntity(new StringEntity(JsonOutput.toJson(payloadMap)))
            response = client.execute(post)
            int statusCode = response.getStatusLine().getStatusCode()
            String responseBody = EntityUtils.toString(response.getEntity())

            if (statusCode == 201) {
                def tokenHeader = response.getFirstHeader("X-Subject-Token")
                if (tokenHeader?.getValue()) {
                    return [success: true, token: tokenHeader.getValue()]
                }
                return [success: false, error: "X-Subject-Token header missing in Keystone response"]
            }
            return [success: false, error: "Keystone auth failed HTTP ${statusCode}: ${responseBody}"]
        } catch (Exception ex) {
            log.error("Keystone request failed: {}", ex.message)
            return [success: false, error: "Keystone request failed: ${ex.message}"]
        } finally {
            response?.close()
            client?.close()
        }
    }

    private static CloseableHttpClient createInsecureHttpClient() {
        TrustStrategy acceptingTrustStrategy = new TrustStrategy() {
            @Override
            boolean isTrusted(X509Certificate[] chain, String authType) { true }
        }
        SSLContext sslContext = SSLContexts.custom().loadTrustMaterial(null, acceptingTrustStrategy).build()
        def csf = new SSLConnectionSocketFactory(sslContext, NoopHostnameVerifier.INSTANCE)
        return HttpClients.custom().setSSLSocketFactory(csf).build()
    }
}
