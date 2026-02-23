package com.example.backend

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.Plugin
import com.morpheusdata.model.Permission
import com.morpheusdata.web.PluginController
import com.morpheusdata.web.Route
import com.morpheusdata.views.JsonResponse
import com.morpheusdata.views.ViewModel
import groovy.json.JsonSlurper
import groovy.util.logging.Slf4j

import com.example.octavia.service.OctaviaLoadBalancerService
import com.example.octavia.service.OctaviaPoolService
import com.example.octavia.service.OctaviaNetworkingService
import com.example.octavia.service.MockOctaviaService
import com.example.octavia.service.OctaviaAuthService

/**
 * Production Octavia controller — integrates real Octavia API services
 * with MockOctaviaService fallback when OCTAVIA_MOCK=true.
 *
 * Route URL convention: Route.build(url, methodName, permission)
 * The url is the exact path the browser calls.
 * Frontend (Api.jsx) calls /plugin/octavia1234/{methodName}.
 */
@Slf4j
class OctaviaController implements PluginController {

    Plugin plugin
    MorpheusContext morpheusContext

    // Services — initialized lazily
    private OctaviaLoadBalancerService lbService
    private OctaviaPoolService poolService
    private OctaviaNetworkingService networkingService
    private MockOctaviaService mockService
    private MorpheusLookupService lookupService
    private OctaviaAuthService authService

    // Cache map: "cloudId:tenantName" -> lastSyncTimeMs
    private static Map<String, Long> lastSyncTimes = [:]
    private static final long SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

    OctaviaController(Plugin plugin, MorpheusContext morpheusContext) {
        this.plugin = plugin
        this.morpheusContext = morpheusContext
        initServices(morpheusContext)
        log.info("OctaviaController instantiated with real + mock service integration")
    }

    private void initServices(MorpheusContext ctx) {
        this.lbService = new OctaviaLoadBalancerService(ctx)
        this.poolService = new OctaviaPoolService()
        this.networkingService = new OctaviaNetworkingService()
        this.mockService = new MockOctaviaService()
        this.lookupService = ctx ? new MorpheusLookupService(ctx) : null
        this.authService = ctx ? new OctaviaAuthService(ctx) : null
    }

    // ── PluginController required methods ────────────────────────
    @Override String getCode() { 'octavia-controller' }
    @Override String getName() { 'Octavia Controller' }
    @Override MorpheusContext getMorpheus() { morpheusContext }
    @Override Plugin getPlugin() { plugin }

    // ── Routes ──────────────────────────────────────────────────
    // Using documented pattern: Route.build("/prefix/action", "methodName", perm)
    // Docs example: Route.build("/myPrefix/example", "html", ...)
    // BigIP example: Route.build("/bigIpPlugin/certInfo", "json", ...)
    @Override
    List<Route> getRoutes() {
        // Use standard built-in Morpheus permission that a System Admin inherently has
        // This prevents the Dispatcher from returning silent 404s due to unassigned custom roles!
        def perm = Permission.build("infrastructure-networks", "full")

        def routes = [
            // Diagnostic endpoint - minimal test case
            Route.build("/octavia1234/ping",               "ping",                perm),
            Route.build("/octavia1234/debugInstances",     "debugInstances",      perm),
            Route.build("/octavia1234/debugNetwork",       "debugNetwork",        perm),
            Route.build("/octavia1234/debugCloud",         "debugCloud",          perm),

            // Primary routes using {pluginCode}/{action} format (like BigIP pattern)
            Route.build("/octavia1234/loadbalancers",      "loadbalancers",       perm),
            Route.build("/octavia1234/loadbalancersCreate", "loadbalancersCreate", perm),
            Route.build("/octavia1234/loadbalancersDelete", "loadbalancersDelete", perm),
            Route.build("/octavia1234/loadbalancerDetails", "loadbalancerDetails", perm),
            Route.build("/octavia1234/loadbalancerUpdate",  "loadbalancerUpdate",  perm),
            Route.build("/octavia1234/floatingipAttach",    "floatingipAttach",    perm),
            Route.build("/octavia1234/floatingipDetach",    "floatingipDetach",    perm),
            Route.build("/octavia1234/optionProjects",      "optionProjects",      perm),
            Route.build("/octavia1234/optionSubnets",       "optionSubnets",       perm),
            Route.build("/octavia1234/optionInstances",     "optionInstances",     perm),
            Route.build("/octavia1234/optionFloatingIpPools", "optionFloatingIpPools", perm),
        ]
        log.info("OctaviaController.getRoutes() called — returning {} routes: {}", routes.size(), routes.collect { it.url })
        return routes
    }

    /** Diagnostic endpoint displaying context resolution details */
    def ping(ViewModel<Map> model) {
        log.info("ping() handler called")
        try {
            def ctx = resolveContext(model)
            def networkIdStr = getParam(model, 'networkId')
            def instanceIdStr = getParam(model, 'instanceId')
            
            def info = [
                status: 'ok',
                mockMode: isMockMode(),
                networkIdParam: networkIdStr,
                instanceIdParam: instanceIdStr,
                resolvedContext: [
                    hasNetwork: ctx?.network != null,
                    networkId: ctx?.network?.id,
                    networkName: ctx?.network?.name,
                    hasProject: ctx?.project != null,
                    projectId: ctx?.project?.id,
                    projectName: ctx?.project?.name,
                    hasCloud: ctx?.cloud != null,
                    cloudId: ctx?.cloud?.id,
                    cloudName: ctx?.cloud?.name
                ]
            ]
            return JsonResponse.of(info)
        } catch (Exception ex) {
            log.error("ping() failed: {}", ex.message, ex)
            return JsonResponse.of([status: 'error', message: ex.message])
        }
    }

    def debugInstances(ViewModel<Map> model) {
        log.info("debugInstances endpoint called")
        try {
            def userIdentity = model.user  // Get current user
            def accountId = userIdentity?.account?.id  // Get their account/tenant
            
            def query = new com.morpheusdata.core.data.DataQuery(userIdentity)
            query.max = 5000000L
            query.withJoin("server")  // Join to ComputeServer
            query.withJoin("instance")  // Join to Instance
            
            def workloads = lookupService.morpheus.async.workload.list(query).toList().blockingGet() ?: []
            
            return JsonResponse.of([
                message: "Fetched ${workloads.size()} instances for account ${accountId}",
                instances: workloads*.properties
            ])
        } catch (Exception ex) {
            log.error("Error in debugInstances", ex)
            return JsonResponse.of([error: ex.message])
        }
    }

    def debugNetwork(ViewModel<Map> model) {
        log.info("debugNetwork endpoint called")
        try {
            def networkIdStr = getParam(model, 'networkId')
            if (!networkIdStr) {
                def query = new com.morpheusdata.core.data.DataQuery()
                query.max = 50L
                def allNetworks = lookupService.morpheus.async.network.list(query).toList().blockingGet() ?: []
                return JsonResponse.of([
                    message: "Pass ?networkId=XXX to debug a specific network. Here are the first 50:",
                    availableNetworks: allNetworks.collect { [id: it.id, name: it.name, cloudId: it.cloud?.id] }
                ])
            }
            
            def networkId = networkIdStr.toLong()
            def network = lookupService.morpheus.async.network.get(networkId).blockingGet()
            
            if (network) {
                // Get subnets for the SPECIFIC network by passing the network object
                def subnets = lookupService.morpheus.async.network.subnet.listIdentityProjections(network).toList().blockingGet() ?: []
                
                // Or use DataQuery to filter by networkId
                def subnetQuery = new com.morpheusdata.core.data.DataQuery()
                subnetQuery.withFilter("network.id", networkId)
                def subnetsAlt = lookupService.morpheus.async.network.subnet.list(subnetQuery).toList().blockingGet() ?: []
                
                return JsonResponse.of([
                    network: network, 
                    subnets: subnets.collect { [id: it.id, name: it.name, cidr: it.cidr] }
                ])
            }
            return JsonResponse.of([error: "Network not found"])
        } catch (Exception ex) {
            log.error("Error in debugNetwork", ex)
            return JsonResponse.of([error: ex.message])
        }
    }
    
    def debugCloud(ViewModel<Map> model) {
        try {
            def cloudIdStr = getParam(model, 'cloudId')
            if (!cloudIdStr) {
                def allClouds = lookupService.morpheus.async.cloud.list(new com.morpheusdata.core.data.DataQuery()).toList().blockingGet()
                return JsonResponse.of([
                    message: "Pass ?cloudId=XXX to debug a specific cloud.",
                    availableClouds: allClouds.collect { [id: it.id, name: it.name, code: it.code] }
                ])
            }
            
            def cloudId = cloudIdStr.toLong()
            def cloud = lookupService.morpheus.async.cloud.get(cloudId).blockingGet()
            if (!cloud) return JsonResponse.of([error: "Cloud not found"])
            
            def auth = this.authService.authenticate(cloud)
            return JsonResponse.of([
                cloudName: cloud.name,
                cloudId: cloud.id,
                cloudCode: cloud.code,
                authValid: auth.success,
                authError: auth.msg ?: "None"
            ])
        } catch (Exception ex) {
            return JsonResponse.of([error: ex.message])
        }
    }

    // ── Helpers ─────────────────────────────────────────────────

    /** Check if running in mock mode */
    private boolean isMockMode() {
        return MockOctaviaService.isMockMode()
    }

    /** Parse JSON body from POST request */
    private Map parseRequestBody(ViewModel<Map> model) {
        try {
            def request = model.object?.request
            if (request) {
                def body = request.inputStream?.text
                if (body) {
                    return new groovy.json.JsonSlurper().parseText(body) as Map
                }
            }
            // If body is empty, Morpheus might have already parsed it into the model object properties natively
            if (model.object instanceof Map) {
                // Avoid extracting Grails/Spring injected variables
                return model.object.findAll { k, v -> 
                    !(k in ['action', 'controller', 'plugin', 'request', 'response', 'flash', 'session', 'morpheusContext']) 
                }
            }
        } catch (Exception ex) {
            log.debug("Could not parse request body: {}", ex.message)
        }
        return [:]
    }

    /** Get query parameter from ViewModel */
    private String getParam(ViewModel<Map> model, String name) {
        try {
            def val = model.object?.get(name)
            if (val != null) return val.toString()
            def reqVal = model.object?.request?.getParameter(name)
            log.debug("getParam('{}') resolved to '{}' from model.object.request", name, reqVal)
            return reqVal
        } catch (Exception ex) {
            log.debug("Could not get param {}: {}", name, ex.message)
            return null
        }
    }

    /** Resolve OpenStack context (cloud, project) from networkId or instanceId */
    private Map resolveContext(ViewModel<Map> model) {
        def networkIdStr = getParam(model, 'networkId')
        def instanceIdStr = getParam(model, 'instanceId')
        log.info("resolveContext -> networkId: [{}], instanceId: [{}]", networkIdStr, instanceIdStr)
        
        Map ctx = [:]
        try {
            if (networkIdStr) {
                def id = Long.parseLong(networkIdStr)
                ctx = lookupService.getNetworkContext(id)
                log.info("resolveContext -> Resolved network context for id {}: {}", id, !!ctx?.network)
                ctx.networkId = networkIdStr
            } else if (instanceIdStr) {
                def id = Long.parseLong(instanceIdStr)
                ctx = lookupService.getInstanceContext(id)
                log.info("resolveContext -> Resolved instance context for id {}: {}", id, !!ctx?.instance)
                ctx.instanceId = instanceIdStr
            } else {
                log.warn("resolveContext -> No networkId or instanceId provided")
            }
        } catch (Exception ex) {
            log.warn("resolveContext failed: {}", ex.message, ex)
        }
        return ctx
    }

    // ── Load Balancer Handlers ──────────────────────────────────

    def loadbalancers(ViewModel<Map> model) {
        log.info("loadbalancers endpoint called")
        try {
            if (isMockMode()) {
                def networkId = getParam(model, 'networkId')
                def result = mockService.listLoadBalancers(networkId)
                return JsonResponse.of(result)
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def pool = ctx.pool
            def project = ctx.project
            
            // In Morpheus, OpenStack Projects map EXACTLY to Resource Pools (CloudPool).
            // The Morpheus generic Tenant (project) has no relation to the OpenStack project name.
            String tenantName = pool?.externalId ?: pool?.name
            
            if (!cloud) {
                log.warn("No cloud context found, returning empty list")
                return JsonResponse.of([loadbalancers: []])
            }

            // 1. Trigger background sync if 5 minutes have elapsed
            String cacheKey = "${cloud.id}:${tenantName}"
            long lastSync = lastSyncTimes[cacheKey] ?: 0
            if (System.currentTimeMillis() - lastSync > SYNC_INTERVAL_MS) {
                log.info("Sync interval exceeded for {}. Starting background SyncTask.", cacheKey)
                lastSyncTimes[cacheKey] = System.currentTimeMillis()
                Thread.start {
                    try {
                        def apiResult = lbService.list(cloud, tenantName)
                        def apiList = apiResult.success ? (apiResult.data ?: []) : []
                        new OctaviaLoadBalancerSync(morpheusContext, cloud, tenantName).execute(apiList)
                    } catch (Exception e) {
                        log.error("Background sync failed for ${cacheKey}", e)
                        lastSyncTimes.remove(cacheKey) // allow retry on next refresh
                    }
                }
            }

            // 2. Instantly fetch the cached list from Morpheus DB
            def query = new com.morpheusdata.core.data.DataQuery()
                .withFilter('cloud.id', cloud.id)
                .withFilter('internalId', tenantName)
            
            def dbLbs = morpheusContext.async.loadBalancer.list(query).toList().blockingGet()

            // 3. Map DB entities back to the Octavia JSON format expected by the React UI
            def mappedLbs = dbLbs.collect { lb ->
                [
                    id: lb.externalId,
                    name: lb.name,
                    vip_address: lb.internalIp,
                    provisioning_status: mapMorpheusStatusToOctavia(lb.status),
                    description: lb.description,
                    provider: lb.type?.code ?: "octavia",
                    members: [] // Members count will be zero in list view, lazy loaded on Edit
                ]
            }

            // Return instantly (< 0.05 seconds)
            return JsonResponse.of([loadbalancers: mappedLbs])
        } catch (Exception ex) {
            log.error("loadbalancers() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    private String mapMorpheusStatusToOctavia(String morpheusStatus) {
        switch (morpheusStatus) {
            case 'ok': return 'ACTIVE'
            case 'error': return 'ERROR'
            case 'provisioning': return 'PENDING_CREATE'
            case 'syncing': return 'PENDING_UPDATE'
            case 'offline': return 'DELETED'
            default: return 'UNKNOWN'
        }
    }

    def loadbalancersCreate(ViewModel<Map> model) {
        log.info("create load balancer called")
        try {
            def payload = parseRequestBody(model)

            if (isMockMode()) {
                def result = mockService.createLoadBalancer(payload)
                return JsonResponse.of(result)
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def pool = ctx.pool
            def project = ctx.project
            
            // In Morpheus, OpenStack Projects map EXACTLY to Resource Pools (CloudPool).
            // The Morpheus generic Tenant (project) has no relation to the OpenStack project name.
            String tenantName = pool?.externalId ?: pool?.name
            
            if (!cloud) {
                return JsonResponse.of([success: false, error: 'Cloud context not found'])
            }

            log.info("Creating LB Payload:\n{}", groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(payload)))

            def result = lbService.create(cloud, tenantName, payload)
            if (result.success) {
                try {
                    // Synchronously update the Morpheus DB so the UI table immediately shows the new LB
                    def apiResult = lbService.list(cloud, tenantName)
                    def apiList = apiResult.success ? (apiResult.data ?: []) : []
                    new OctaviaLoadBalancerSync(morpheusContext, cloud, tenantName).execute(apiList)
                } catch (Exception syncEx) {
                    log.error("Inline sync failed after create: {}", syncEx.message)
                }
                lastSyncTimes[("${cloud.id}:${tenantName}".toString())] = System.currentTimeMillis()
            }
            return JsonResponse.of(result)
        } catch (Exception ex) {
            log.error("loadbalancersCreate() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    def loadbalancersDelete(ViewModel<Map> model) {
        log.info("delete load balancer called")
        try {
            def payload = parseRequestBody(model)
            def lbId = payload.lbId ?: payload.id

            if (isMockMode()) {
                def result = mockService.deleteLoadBalancer(lbId)
                return JsonResponse.of(result)
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def pool = ctx.pool
            def project = ctx.project
            
            // In Morpheus, OpenStack Projects map EXACTLY to Resource Pools (CloudPool).
            // The Morpheus generic Tenant (project) has no relation to the OpenStack project name.
            String tenantName = pool?.externalId ?: pool?.name
            
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing cloud context or LB id'])
            }

            def result = lbService.delete(cloud, tenantName, lbId)
            if (result.success) {
                try {
                    // Synchronously update the Morpheus DB so the UI table immediately removes the LB
                    def apiResult = lbService.list(cloud, tenantName)
                    def apiList = apiResult.success ? (apiResult.data ?: []) : []
                    new OctaviaLoadBalancerSync(morpheusContext, cloud, tenantName).execute(apiList)
                } catch (Exception syncEx) {
                    log.error("Inline sync failed after delete: {}", syncEx.message)
                }
                lastSyncTimes[("${cloud.id}:${tenantName}".toString())] = System.currentTimeMillis()
            }
            return JsonResponse.of(result)
        } catch (Exception ex) {
            log.error("loadbalancersDelete() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    def loadbalancerDetails(ViewModel<Map> model) {
        def lbId = getParam(model, 'id')
        log.info("Details requested for LB {}", lbId)
        try {
            if (isMockMode()) {
                def result = mockService.getLoadBalancer(lbId)
                return JsonResponse.of(result)
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def pool = ctx.pool
            def project = ctx.project
            
            // In Morpheus, OpenStack Projects map EXACTLY to Resource Pools (CloudPool).
            // The Morpheus generic Tenant (project) has no relation to the OpenStack project name.
            String tenantName = pool?.externalId ?: pool?.name
            
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing cloud context or LB id'])
            }

            // Fetch the LB details via the list endpoint with filter, or individual get
            // Since OctaviaLoadBalancerService.list returns all, filter client-side
            def allResult = lbService.list(cloud, tenantName)
            def lbs = allResult.data ?: []
            def lb = lbs.find { it.id == lbId }
            if (lb) {
                return JsonResponse.of([success: true, loadbalancer: lb])
            } else {
                return JsonResponse.of([success: false, error: "Load Balancer ${lbId} not found"])
            }
        } catch (Exception ex) {
            log.error("loadbalancerDetails() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    def loadbalancerUpdate(ViewModel<Map> model) {
        log.info("update load balancer called")
        try {
            def payload = parseRequestBody(model)
            def lbId = payload.id

            if (isMockMode()) {
                def result = mockService.updateLoadBalancer(lbId, payload)
                return JsonResponse.of(result)
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def pool = ctx.pool
            def project = ctx.project
            
            // In Morpheus, OpenStack Projects map EXACTLY to Resource Pools (CloudPool).
            // The Morpheus generic Tenant (project) has no relation to the OpenStack project name.
            String tenantName = pool?.externalId ?: pool?.name
            
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing cloud context or LB id'])
            }

            def result = lbService.update(cloud, tenantName, lbId, payload)
            if (result.success) {
                lastSyncTimes.remove("${cloud.id}:${tenantName}".toString())
            }
            return JsonResponse.of(result)
        } catch (Exception ex) {
            log.error("loadbalancerUpdate() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    // ── Floating IP Handlers ────────────────────────────────────

    def floatingipAttach(ViewModel<Map> model) {
        log.info("floatingipAttach() handler called")
        try {
            def payload = parseRequestBody(model)
            def lbId = payload.lbId
            def fipPoolId = payload.floatingIpPoolId

            if (isMockMode()) {
                return JsonResponse.of([success: true, message: 'Floating IP attached (mock)'])
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def project = ctx.project
            if (!cloud || !lbId || !fipPoolId) {
                return JsonResponse.of([success: false, error: 'Missing required parameters'])
            }

            // Get the LB's VIP port to associate the floating IP
            def result = networkingService.associateFloatingIp(cloud, project?.externalId, lbId, fipPoolId)
            return JsonResponse.of(result)
        } catch (Exception ex) {
            log.error("floatingipAttach() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    def floatingipDetach(ViewModel<Map> model) {
        log.info("floatingipDetach() handler called")
        try {
            def payload = parseRequestBody(model)
            def lbId = payload.lbId

            if (isMockMode()) {
                return JsonResponse.of([success: true, message: 'Floating IP detached (mock)'])
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def project = ctx.project
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing required parameters'])
            }

            def result = networkingService.disassociateFloatingIp(cloud, project?.externalId, lbId)
            return JsonResponse.of(result)
        } catch (Exception ex) {
            log.error("floatingipDetach() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    // ── Option Handlers (dropdowns for Create Wizard) ───────────

    def optionProjects(ViewModel<Map> model) {
        log.info("optionProjects() handler called")
        try {
            if (isMockMode()) {
                return JsonResponse.of([data: [[name: 'Mock Project', value: 'mock-project-id']], optionClouds: [[name: 'Mock Cloud', value: 'mock-cloud-id']], resourcePools: [[name: 'Mock Pool', value: 'mock-pool-id']]])
            }

            def ctx = resolveContext(model)
            def project = ctx.project
            def pool = ctx.pool 
            def cloud = ctx.cloud
            
            // === AUTHENTICATION TEST ===
            if (cloud && authService) {
                log.info("--- TRIGGERING KEYSTONE AUTH TEST ---")
                
                // In Morpheus, OpenStack Projects map EXACTLY to Resource Pools (CloudPool).
                // The Morpheus generic Tenant (project) has no relation to the OpenStack project name.
                def tenantName = pool?.name ?: pool?.externalId
                
                def authMap = authService.getAuthToken(cloud, tenantName)
                if (authMap.success) {
                    log.info("Auth Test SUCCESS! Token acquired for Load Balancer API: {}", authMap.loadBalancerApi)
                    // We don't return the token to the UI for security, but now we know it works!
                } else {
                    log.error("Auth Test FAILED: {}", authMap.error)
                }
                log.info("-------------------------------------")
            }
            
            def data = []
            if (project) {
                data << [name: project.name ?: 'Default', value: project.externalId ?: project.id?.toString()]
            }
            
            def optionClouds = []
            if (cloud) {
                optionClouds << [name: cloud.name ?: 'Default', value: cloud.id?.toString()]
            }
            
            def resourcePools = []
            if (pool) {
                resourcePools << [name: pool.name ?: 'Default', value: pool.id?.toString()]
            }
            
            return JsonResponse.of([data: data, optionClouds: optionClouds, resourcePools: resourcePools])
        } catch (Exception ex) {
            log.error("optionProjects() failed: {}", ex.message, ex)
            return JsonResponse.of([data: [], optionClouds: [], resourcePools: []])
        }
    }

    def optionSubnets(ViewModel<Map> model) {
        log.info("optionSubnets() handler called")
        try {
            if (isMockMode()) {
                return JsonResponse.of([data: [[name: 'mock-subnet (192.168.1.0/24)', value: 'subnet-mock-001', cidr: '192.168.1.0/24']]])
            }

            def ctx = resolveContext(model)
            def subnetsList = ctx.subnets
            
            if (subnetsList) {
                log.info("Mapping {} subnets for network ID: {}", subnetsList.size(), ctx.network?.id)
                def subnets = subnetsList.collect { sub ->
                    // Use the explicit sub model getters
                    [name: sub.getName() ?: sub.getExternalId(), value: sub.getExternalId() ?: sub.getId()?.toString(), cidr: sub.getCidr()]
                }
                return JsonResponse.of([data: subnets])
            } else if (ctx.network) {
                log.warn("No subnets found for network ID {}, falling back to Network itself", ctx.network.id)
                def net = ctx.network
                def subnets = [[name: net.getName() ?: 'Network', value: net.getExternalId(), cidr: net.getCidr()]]
                return JsonResponse.of([data: subnets])
            }
            
            log.warn("network was null in ctx in optionSubnets()")
            return JsonResponse.of([data: []])
        } catch (Exception ex) {
            log.error("optionSubnets() failed: {}", ex.message, ex)
            return JsonResponse.of([data: []])
        }
    }

    def optionInstances(ViewModel<Map> model) {
        log.info("optionInstances() handler called")
        try {
            if (isMockMode()) {
                return JsonResponse.of([data: [[name: 'mock-instance-1', value: 'inst-001'], [name: 'mock-instance-2', value: 'inst-002']]])
            }

            def ctx = resolveContext(model)
            if (ctx && (ctx.network || ctx.project)) {
                def instances = lookupService.listInstances(ctx)
                return JsonResponse.of([data: instances])
            }
            return JsonResponse.of([data: []])
        } catch (Exception ex) {
            log.error("optionInstances() failed: {}", ex.message, ex)
            return JsonResponse.of([data: []])
        }
    }

    def optionFloatingIpPools(ViewModel<Map> model) {
        log.info("optionFloatingIpPools() handler called")
        try {
            if (isMockMode()) {
                return JsonResponse.of([floatingIpPools: [[name: 'ext-net', value: 'ext-net-1']]])
            }

            def networkIdStr = getParam(model, 'networkId')
            if (networkIdStr) {
                def pools = lookupService.listFloatingIpPools(Long.parseLong(networkIdStr))
                return JsonResponse.of([floatingIpPools: pools])
            }
            return JsonResponse.of([floatingIpPools: []])
        } catch (Exception ex) {
            log.error("optionFloatingIpPools() failed: {}", ex.message, ex)
            return JsonResponse.of([floatingIpPools: []])
        }
    }
}
