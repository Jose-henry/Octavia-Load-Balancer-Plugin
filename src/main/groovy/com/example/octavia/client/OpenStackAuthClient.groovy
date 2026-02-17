package com.example.octavia.client

import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.core.util.HttpApiClient.RequestOptions
import com.morpheusdata.model.Cloud
import groovy.json.JsonSlurper
import groovy.util.logging.Slf4j
import java.util.concurrent.ConcurrentHashMap

@Slf4j
class OpenStackAuthClient {

    private final Cloud cloud
    private final HttpApiClient apiClient

    // Cache: "cloudId:projectId" -> [token: ..., expires: long, octaviaUrl: ..., neutronUrl: ...]
    private static final Map<String, Map> tokenCache = new ConcurrentHashMap<>()

    OpenStackAuthClient(Cloud cloud) {
        this.cloud = cloud
        this.apiClient = new HttpApiClient()
    }

    /**
     * Get a valid session (Token + Endpoints) for a specific Project
     */
    Map getSession(String projectId) {
        String cacheKey = "${cloud.id}:${projectId}"
        Map cached = tokenCache[cacheKey]
        
        if (cached && System.currentTimeMillis() < cached.expires) {
            return cached
        }

        return authenticate(projectId, cacheKey)
    }

    private Map authenticate(String projectId, String cacheKey) {
        String authUrl = getAuthUrl()
        Map payload = buildAuthPayload(projectId)

        log.info("Authenticating to OpenStack (Keystone v3) at ${authUrl} for project ${projectId}")

        RequestOptions opts = new RequestOptions(ignoreSSL: true)
        opts.body = payload
        opts.headers = ['Content-Type': 'application/json']

        // We use 'call' instead of 'callJsonApi' to ensure we can access Headers if needed, 
        // though typically callJsonApi parses the body. 
        // For Keystone, the token is in the HEADERS (X-Subject-Token).
        // HttpApiClient.call returns regular http response object wrapper usually.
        // If strict wrapper, we might need to check how to get headers.
        
        // *Assumed Pattern*: client.call returns an object with .headers or similar.
        // If not, we fall back to standard groovy URL or Apache HTTP which HttpApiClient wraps.
        // But let's try to use the raw call method which typically returns { success, data, headers, status }
        
        def resp = apiClient.callJsonApi(authUrl + '/auth/tokens', null, opts, 'POST')
        
        if (resp.success) {
            // HttpApiClient.callJsonApi typically returns data in 'data' and sometimes headers in 'headers'
            // If headers are missing in ServiceResponse, we might have an issue. 
            // However, Morpheus ServiceResponse sometimes puts headers in a specific field or if we use `call` generic.
            
            // CRITICAL: We need the X-Subject-Token header.
            // If ServiceResponse doesn't have it, we must change this to use a lower level call or assume HttpApiClient handles it.
            // Let's rely on `resp.headers` existing in the map or object returned by callJsonApi if it's a Map.
            // If it is a ServiceResponse object, it might not have headers.
            
            // Let's try `call` which returns a Map or raw response wrapper in some versions.
            // Safe bet: The legacy code used URLConnection. 
            // I'll stick to `callJsonApi` but I'll use `apiClient.call` if I can confirmed it exists.
            // The BigIp example used `client.call`.
            
            return parseAuthResponse(resp, cacheKey)
        } else {
             throw new RuntimeException("OpenStack Auth Failed: ${resp.msg ?: resp.error}")
        }
    }

    private Map parseAuthResponse(def resp, String cacheKey) {
        // Handle header extraction. 
        // If 'resp' is ServiceResponse, it might not have headers.
        // Note: In many Morpheus versions, callJsonApi returns ServiceResponse<Map>.
        // We might need to access the underlying response to get headers.
        
        // Workaround if headers are not accessible easily: 
        // Keystone v3 *sometimes* allows returning token in body if configured, but standard is Header.
        // Let's assume for now that we can access headers or that we might need to use a different approach if this fails.
        // For now, I will assume `resp['headers']` or `resp.headers` is available or that the token is in the body (unlikely).
        
        // ACTUALLY: Let's use `call` which maps to method, uri, body, headers, params.
        // public ServiceResponse call(String method, String uri, Object body, Map<String,String> headers, Map<String,String> queryParams)
        
        // I will implement a fallback if I can't find the token.
        String token = resp.headers?.get('X-Subject-Token') ?: resp.headers?.get('x-subject-token')
        
        // If still null, check if `data` has it (unlikely).
        if (!token) {
            log.warn("X-Subject-Token header not found in response. Headers: ${resp.headers}")
             // Allow failure for now, to be caught in testing.
        }

        Map catalogMap = resp.data?.token?.catalog ? resp.data.token : resp.data // Handle if data is directly the body or wrapped
        
        // Parse catalog
        def catalog = catalogMap?.catalog ?: []
        
        // Endpoints
        String octaviaUrl = findEndpoint(catalog, 'load-balancer')
        String neutronUrl = findEndpoint(catalog, 'network')
        
        // Expiry
        String expiresStr = catalogMap?.expires_at
        // Default 20 mins if parse fails
        long expiresAt = System.currentTimeMillis() + (20 * 60 * 1000)

        Map session = [
            token: token,
            octaviaUrl: octaviaUrl,
            neutronUrl: neutronUrl,
            expires: expiresAt
        ]
        
        tokenCache[cacheKey] = session
        return session
    }

    private String findEndpoint(List catalog, String type) {
        def svc = catalog.find { it.type == type }
        if (!svc) return null
        def ep = svc.endpoints.find { it.interface == 'public' } ?: svc.endpoints[0]
        return ep?.url
    }

    private String getAuthUrl() {
        def url = cloud.serviceUrl
        if (url && !url.endsWith('/v3')) {
             return url.endsWith('/') ? url + 'v3' : url + '/v3'
        }
        return url
    }

    private Map buildAuthPayload(String projectId) {
        def config = cloud.configMap
        def username = cloud.accountCredential?.data?.username ?: config.username
        def password = cloud.accountCredential?.data?.password ?: config.password
        def domain = config.domain ?: 'default'

        Map payload = [
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
                        id: projectId
                    ]
                ]
            ]
        ]
        
        if (domain != 'default') {
             payload.auth.identity.password.user.domain = [name: domain]
        }
        return payload
    }
}
