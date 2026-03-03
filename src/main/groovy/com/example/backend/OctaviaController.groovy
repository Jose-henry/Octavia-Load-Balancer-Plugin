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
        this.poolService = new OctaviaPoolService(ctx)
        this.networkingService = new OctaviaNetworkingService(ctx)
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

            // Primary routes using {pluginCode}/{action} format (like BigIP pattern)
            Route.build("/octavia1234/loadbalancers",      "loadbalancers",       perm),
            Route.build("/octavia1234/loadbalancersFromDb", "loadbalancersFromDb", perm),
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

    /**
     * True if the current user's account is the owner of the context network (Morpheus tenant).
     * Used to scope load balancer list and mutations so sub-tenants with shared network access cannot see or manage the owner's LBs.
     */
    private boolean isCurrentUserNetworkOwner(ViewModel<Map> model, Map ctx) {
        def network = ctx?.network
        if (!network) return false
        def ownerId = network.getOwner()?.getId()
        if (ownerId == null) return false
        def accountId = model?.user?.account?.id
        if (accountId == null) return false
        return ownerId == accountId
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

            // Scope by Morpheus tenant: only show load balancers when the current user's account is the network owner.
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                log.info("loadbalancers: tenant scope — current account is not network owner; returning empty list")
                return JsonResponse.of([loadbalancers: []])
            }

            // Always retrieve fresh status from Octavia so provisioning_status and operating_status are accurate.
            def apiResult = lbService.list(cloud, tenantName)
            if (!apiResult.success) {
                log.warn("Octavia list() failed for cloud {} tenant {}: {}", cloud.id, tenantName, apiResult.msg ?: apiResult.error)
                return JsonResponse.of([loadbalancers: []])
            }

            def apiList = apiResult.data ?: []

            // Map any Floating IPs to LB vip_port_id so we can display internal/external VIP in UI.
            Map<String, String> floatingIpByPortId = [:]
            try {
                def fipsResp = networkingService.listFloatingIps(cloud, tenantName, [:])
                if (fipsResp.success) {
                    def fips = fipsResp.data ?: []
                    fips.each { f ->
                        def portId = f.port_id
                        def addr = f.floating_ip_address
                        if (portId && addr) {
                            floatingIpByPortId[portId.toString()] = addr.toString()
                        }
                    }
                    log.info("loadbalancers(): mapped {} floating IP associations by port_id", floatingIpByPortId.size())
                } else {
                    log.warn("loadbalancers(): failed to list floating IPs: {}", fipsResp.msg ?: fipsResp.error)
                }
            } catch (Exception fipEx) {
                log.warn("loadbalancers(): error mapping floating IPs: {}", fipEx.message)
            }

            // Kick off background sync to Morpheus DB using the same API payload
            Thread.start {
                try {
                    new OctaviaLoadBalancerSync(morpheusContext, cloud, tenantName).execute(apiList)
                } catch (Exception e) {
                    log.error("Background sync failed during loadbalancers(): {}", e.message, e)
                }
            }

            // Filter LBs by Network if running inside a Network Tab context
            if (ctx.networkId && ctx.network) {
                def validSubnetIds = []
                if (ctx.subnets) {
                    validSubnetIds = ctx.subnets.collect { it.getExternalId() ?: it.getId()?.toString() }.findAll { it != null }
                } else {
                    def netExt = ctx.network.getExternalId()
                    if (netExt) validSubnetIds << netExt
                }

                if (validSubnetIds) {
                    log.info("Filtering LBs for Network {} by explicit subnet IDs: {}", ctx.networkId, validSubnetIds)
                    apiList = apiList.findAll { lb -> validSubnetIds.contains(lb.vip_subnet_id) }
                } else {
                    log.warn("Network {} has no externalId/subnetIds to filter LBs against", ctx.networkId)
                }
            }

            // Extract instance IPs for Instance Tab filtering
            def instanceIps = []
            if (ctx.instanceId && ctx.instance) {
                try {
                    if (ctx.instance.containers) {
                        ctx.instance.containers.each { container ->
                            if (container.server?.internalIp) instanceIps << container.server.internalIp
                            if (container.server?.externalIp) instanceIps << container.server.externalIp
                            if (container.internalIp) instanceIps << container.internalIp
                            if (container.externalIp) instanceIps << container.externalIp
                        }
                    }
                } catch(e) { log.debug("Error getting instance IPs: {}", e.message) }
                instanceIps = instanceIps.findAll { it != null && it != '0.0.0.0' }.unique()
                log.info("Instance IPs for filtering: {}", instanceIps)
            }

            // Initialize cache for resolving external network IDs to internal Morpheus Network objects (mostly for Instance tab)
            def networkCache = [:]

            def mappedLbs = []
            apiList.each { lb ->
                int memberCount = 0
                boolean isInstanceMember = false
                try {
                    def poolsResp = poolService.listPools(cloud, tenantName, lb.id)
                    if (poolsResp.success) {
                        def pools = poolsResp.data ?: []
                        pools.each { p ->
                            def poolId = p.id
                            if (poolId) {
                                def memResp = poolService.listMembers(cloud, tenantName, poolId)
                                if (memResp.success) {
                                    def members = memResp.data ?: []
                                    memberCount += members.size()
                                    if (ctx.instanceId && instanceIps) {
                                        members.each { m ->
                                            if (instanceIps.contains(m.address)) {
                                                isInstanceMember = true
                                            }
                                        }
                                    }
                                } else {
                                    log.warn("Failed to list members for pool {} of LB {}: {}", poolId, lb.id, memResp.msg ?: memResp.error)
                                }
                            }
                        }
                    } else {
                        log.warn("Failed to list pools for LB {}: {}", lb.id, poolsResp.msg ?: poolsResp.error)
                    }
                } catch (Exception memberEx) {
                    log.warn("Error while computing memberCount for LB {}: {}", lb.id, memberEx.message)
                }

                if (ctx.instanceId && !isInstanceMember) {
                    log.info("Skipping LB {} because instance is not a member", lb.name)
                    return // skips current iteration in .each closure
                }

                log.info("Mapped LB {} ({}) with provisioning_status={}, operating_status={}, memberCount={}",
                        lb.name, lb.id, lb.provisioning_status, lb.operating_status, memberCount)

                def vipPortId = (lb.vip_port_id ?: lb.vipPortId)?.toString()
                def externalVip = vipPortId ? floatingIpByPortId[vipPortId] : null
                def vipDisplay = externalVip ? "${lb.vip_address}/${externalVip}" : lb.vip_address

                def mappedNetworkId = ctx.networkId
                def mappedNetworkName = ctx.network?.name

                if (!mappedNetworkId && lb.vip_network_id) {
                    if (!networkCache.containsKey(lb.vip_network_id)) {
                        try {
                            def query = new com.morpheusdata.core.data.DataQuery().withFilter("externalId", lb.vip_network_id)
                            def netInstance = morpheusContext.async.network.list(query).firstElement().blockingGet()
                            if (netInstance) {
                                networkCache[lb.vip_network_id] = [id: netInstance.id, name: netInstance.name]
                            } else {
                                networkCache[lb.vip_network_id] = null
                            }
                        } catch (Exception cacheEx) {
                            networkCache[lb.vip_network_id] = null
                        }
                    }
                    def cachedNet = networkCache[lb.vip_network_id]
                    if (cachedNet) {
                        mappedNetworkId = cachedNet.id
                        mappedNetworkName = cachedNet.name
                    }
                }

                mappedLbs << [
                    id                 : lb.id,
                    name               : lb.name,
                    vip_address        : lb.vip_address,
                    vip_subnet_id      : lb.vip_subnet_id,
                    vip_network_id     : lb.vip_network_id,
                    vip_floating       : externalVip,
                    vip_display        : vipDisplay,
                    provisioning_status: lb.provisioning_status,
                    operating_status   : lb.operating_status,
                    description        : lb.description,
                    provider           : lb.provider ?: "octavia",
                    membersCount       : memberCount,
                    networkId          : mappedNetworkId,
                    networkName        : mappedNetworkName ?: 'View Network'
                ]
            }

            // Optional max/offset to reduce payload and load (e.g. many tenants, large LB lists)
            def maxParam = getParam(model, 'max')
            def offsetParam = getParam(model, 'offset')
            int total = mappedLbs.size()
            if (maxParam?.trim()?.isNumber()) {
                int maxVal = Math.max(1, Integer.parseInt(maxParam.trim()))
                int offsetVal = 0
                if (offsetParam?.trim()?.isNumber()) offsetVal = Math.max(0, Integer.parseInt(offsetParam.trim()))
                int from = Math.min(offsetVal, total)
                int to = Math.min(offsetVal + maxVal, total)
                mappedLbs = mappedLbs.subList(from, to)
                return JsonResponse.of([loadbalancers: mappedLbs, total: total])
            }
            return JsonResponse.of([loadbalancers: mappedLbs])
        } catch (Exception ex) {
            log.error("loadbalancers() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    /**
     * List load balancers from the Morpheus DB (synced from Octavia).
     *
     * Tenant scoping (Morpheus token):
     * - Master tenant: GET with no params returns all LBs across all tenancies. Use accountid to filter by a specific tenant.
     * - Regular tenant: GET returns only that tenant's LBs. Passing accountid for another tenant returns an error.
     *
     * Query params (all optional):
     * - accountid: Morpheus account id to filter by (master only; regular tenants cannot use it to see other tenants).
     * - cloud, network, instance, project: as before.
     */
    def loadbalancersFromDb(ViewModel<Map> model) {
        log.info("loadbalancersFromDb endpoint called")
        try {
            def currentAccountId = model?.user?.account?.id
            def isMasterTenant = model?.user?.account?.masterAccount == true
            def accountIdParam = getParam(model, 'accountid')
            def requestedAccountId = accountIdParam?.trim()?.isNumber() ? Long.parseLong(accountIdParam.trim()) : null

            if (currentAccountId == null) {
                log.warn("loadbalancersFromDb: no account context (token must have account)")
                return JsonResponse.of([success: false, loadbalancers: [], error: 'Account context required for tenant scoping'])
            }

            if (requestedAccountId != null && !isMasterTenant && requestedAccountId != currentAccountId) {
                log.warn("loadbalancersFromDb: tenant {} attempted to list LBs for account {}", currentAccountId, requestedAccountId)
                return JsonResponse.of([success: false, loadbalancers: [], error: 'Access denied: you can only list load balancers for your own tenant'])
            }

            def filterAccountId = null
            if (requestedAccountId != null) {
                filterAccountId = requestedAccountId
            } else if (!isMasterTenant) {
                filterAccountId = currentAccountId
            }
            def resolveAccountId = filterAccountId ?: currentAccountId

            def cloud = null
            String tenantName = null
            def networkParam = getParam(model, 'network') ?: getParam(model, 'networkId')
            def instanceParam = getParam(model, 'instance') ?: getParam(model, 'instanceId')
            def cloudParam = getParam(model, 'cloud')
            def projectParam = getParam(model, 'project')

            if (networkParam?.trim()) {
                def networkId = lookupService.resolveNetworkIdByIdOrName(networkParam.trim(), resolveAccountId)
                if (networkId != null) {
                    def ctx = lookupService.getNetworkContext(networkId)
                    if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                        return JsonResponse.of([loadbalancers: []])
                    }
                    cloud = cloud ?: ctx.cloud
                    if (ctx.pool) tenantName = tenantName ?: (ctx.pool.externalId ?: ctx.pool.name)
                }
            }
            if (instanceParam?.trim()) {
                def instanceId = lookupService.resolveInstanceIdByIdOrName(instanceParam.trim(), resolveAccountId)
                if (instanceId != null) {
                    def ctx = lookupService.getInstanceContext(instanceId)
                    cloud = cloud ?: ctx.cloud
                    if (ctx.pool) tenantName = tenantName ?: (ctx.pool.externalId ?: ctx.pool.name)
                }
            }
            if (cloudParam?.trim()?.isNumber()) {
                cloud = cloud ?: morpheusContext.async.cloud.getCloudById(Long.parseLong(cloudParam.trim()))?.blockingGet()
            }
            if (projectParam?.trim()) {
                tenantName = tenantName ?: lookupService.resolveProjectTenantName(projectParam.trim(), resolveAccountId)
            }

            // NetworkLoadBalancer has owner (set in OctaviaLoadBalancerSync from cloud.owner); filter by owner.id for tenant scoping.
            def query = new com.morpheusdata.core.data.DataQuery()
            if (filterAccountId != null) {
                query = query.withFilter('owner.id', filterAccountId)
            }
            if (cloud != null) {
                query = query.withFilter('cloud.id', cloud.id)
            }
            if (tenantName != null && tenantName.trim()) {
                query = query.withFilter('internalId', tenantName.trim())
            }

            def maxParam = getParam(model, 'max')
            def offsetParam = getParam(model, 'offset')
            if (maxParam?.trim()?.isNumber()) {
                try {
                    long maxVal = Math.max(1L, Long.parseLong(maxParam.trim()))
                    long offsetVal = 0L
                    if (offsetParam?.trim()?.isNumber()) offsetVal = Math.max(0L, Long.parseLong(offsetParam.trim()))
                    query = query.withMax(maxVal).withOffset(offsetVal)
                } catch (Exception e) {
                    log.debug("loadbalancersFromDb: invalid max/offset, ignoring: {}", e.message)
                }
            }

            def projections = morpheusContext.async.loadBalancer.listIdentityProjections(query).toList().blockingGet() ?: []
            def list = projections.collect { p ->
                [
                    id                  : p.id,
                    name                : p.name,
                    externalId          : p.externalId,
                    vip_address         : p.internalIp,
                    internalIp          : p.internalIp,
                    provisioning_status : mapMorpheusStatusToOctavia(p.status ?: ''),
                    status              : p.status,
                    description         : p.description,
                    internalId          : p.internalId
                ]
            }

            def result = [success: true, loadbalancers: list]
            if (maxParam?.trim()?.isNumber()) {
                def countQuery = new com.morpheusdata.core.data.DataQuery()
                if (filterAccountId != null) countQuery = countQuery.withFilter('owner.id', filterAccountId)
                if (cloud != null) countQuery = countQuery.withFilter('cloud.id', cloud.id)
                if (tenantName != null && tenantName.trim()) countQuery = countQuery.withFilter('internalId', tenantName.trim())
                def totalProjections = morpheusContext.async.loadBalancer.listIdentityProjections(countQuery).toList().blockingGet() ?: []
                result.total = totalProjections.size()
            }
            log.info("loadbalancersFromDb: master={}, filterAccountId={}, cloud={}, tenant={}, count={}", isMasterTenant, filterAccountId, cloud?.id, tenantName, list.size())
            return JsonResponse.of(result)
        } catch (Exception ex) {
            log.error("loadbalancersFromDb failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message, loadbalancers: []])
        }
    }

    /**
     * Resolve a VIP subnet UUID to a display string "SubnetName (CIDR)" via the Neutron API.
     * Results are cached in the provided map to avoid redundant calls for the same subnet.
     */
    private String resolveSubnetDisplay(def cloud, String tenantName, String subnetId, Map<String, String> cache) {
        if (!subnetId) return null
        if (cache.containsKey(subnetId)) return cache[subnetId]
        try {
            def resp = networkingService.getSubnet(cloud, tenantName, subnetId)
            if (resp.success && resp.data) {
                def name = resp.data.name ?: subnetId
                def cidr = resp.data.cidr
                def display = cidr ? "${name} (${cidr})" : name
                cache[subnetId] = display
                return display
            }
        } catch (Exception e) {
            log.warn("Failed to resolve subnet {}: {}", subnetId, e.message)
        }
        cache[subnetId] = null
        return null
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
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([success: false, error: 'Access denied: only the network owner can create load balancers'])
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
            log.info("loadbalancersDelete() request payload: {}", groovy.json.JsonOutput.toJson(payload))

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
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([success: false, error: 'Access denied: only the network owner can delete load balancers'])
            }

            // Detach any floating IP before deleting, so it doesn't become orphaned in Neutron
            try {
                def lbResp = lbService.get(cloud, tenantName, lbId.toString())
                if (lbResp.success) {
                    def vipPortId = (lbResp.data?.vip_port_id ?: lbResp.data?.vipPortId)?.toString()
                    if (vipPortId) {
                        def fipsResp = networkingService.listFloatingIps(cloud, tenantName, [:])
                        if (fipsResp.success) {
                            def fip = (fipsResp.data ?: []).find { it?.port_id?.toString() == vipPortId }
                            if (fip?.id) {
                                log.info("loadbalancersDelete(): detaching floating IP {} from port {} before delete", fip.id, vipPortId)
                                def detachResp = networkingService.disassociateFloatingIp(cloud, tenantName, fip.id.toString())
                                if (detachResp.success) {
                                    log.info("loadbalancersDelete(): floating IP {} disassociated successfully", fip.id)
                                } else {
                                    log.warn("loadbalancersDelete(): failed to disassociate floating IP {}: {}", fip.id, detachResp.msg ?: detachResp.error)
                                }
                            }
                        }
                    }
                }
            } catch (Exception fipEx) {
                log.warn("loadbalancersDelete(): error during floating IP cleanup for LB {}: {}", lbId, fipEx.message)
            }

            def result = lbService.delete(cloud, tenantName, lbId)
            log.info("loadbalancersDelete() response: success={}, msg={}, error={}", result.success, result.msg, result.error)
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
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([success: false, error: 'Access denied: only the network owner can view load balancer details'])
            }

            log.info("loadbalancerDetails() fetching LB {} details from Octavia", lbId)
            // Fetch full LB details from Octavia
            def lbResp = lbService.get(cloud, tenantName, lbId)
            if (!lbResp.success) {
                return JsonResponse.of([success: false, error: lbResp.msg ?: lbResp.error ?: "Failed to fetch load balancer ${lbId}"])
            }

            def lb = lbResp.data
            log.info("loadbalancerDetails() LB {} base response: vip_address={}, vip_subnet_id={}, listeners={}, pools={}",
                lbId, lb?.vip_address, lb?.vip_subnet_id, (lb?.listeners?.size() ?: 0), (lb?.pools?.size() ?: 0))

            // Enrich with listeners, pools, members, and health monitor where possible
            try {
                // Always pull listeners via the dedicated endpoint so the UI has full listener objects
                def listenersResp = poolService.listListeners(cloud, tenantName, lbId)
                if (listenersResp.success) {
                    def listeners = listenersResp.data ?: []
                    lb.listeners = listeners
                    log.info("loadbalancerDetails() LB {} listeners fetched: {}", lbId, listeners.size())
                } else {
                    log.warn("loadbalancerDetails: failed to list listeners for LB {}: {}", lbId, listenersResp.msg ?: listenersResp.error)
                }

                def poolsResp = poolService.listPools(cloud, tenantName, lbId)
                if (poolsResp.success) {
                    def pools = poolsResp.data ?: []
                    pools.each { p ->
                        def poolId = p.id
                        if (poolId) {
                            def memResp = poolService.listMembers(cloud, tenantName, poolId)
                            if (memResp.success) {
                                p.members = memResp.data ?: []
                                log.info("loadbalancerDetails() LB {} pool {} members fetched: {}", lbId, poolId, p.members.size())
                            } else {
                                log.warn("loadbalancerDetails: failed to list members for pool {} of LB {}: {}", poolId, lbId, memResp.msg ?: memResp.error)
                            }

                            if (p.healthmonitor_id) {
                                def hmResp = poolService.getHealthMonitor(cloud, tenantName, p.healthmonitor_id as String)
                                if (hmResp.success) {
                                    p.healthmonitor = hmResp.data
                                    log.info("loadbalancerDetails() LB {} pool {} healthmonitor fetched: {}", lbId, poolId, p.healthmonitor_id)
                                } else {
                                    log.warn("loadbalancerDetails: failed to fetch health monitor {} for pool {}: {}", p.healthmonitor_id, poolId, hmResp.msg ?: hmResp.error)
                                }
                            }
                        }
                    }
                    lb.pools = pools
                } else {
                    log.warn("loadbalancerDetails: failed to list pools for LB {}: {}", lbId, poolsResp.msg ?: poolsResp.error)
                }
            } catch (Exception ex2) {
                log.warn("loadbalancerDetails: error enriching LB {} with pools/members/monitor: {}", lbId, ex2.message)
            }

            // Resolve subnet UUID to human-readable name
            if (lb.vip_subnet_id) {
                Map<String, String> cache = [:]
                def display = resolveSubnetDisplay(cloud, tenantName, lb.vip_subnet_id as String, cache)
                if (display) {
                    lb.vip_subnet_display = display
                }
            }

            return JsonResponse.of([success: true, loadbalancer: lb])
        } catch (Exception ex) {
            log.error("loadbalancerDetails() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
        }
    }

    def loadbalancerUpdate(ViewModel<Map> model) {
        log.info("update load balancer called")
        try {
            def payload = parseRequestBody(model)
            // IDs can come from query string so clients can pass them in the URL (payload body may not have them yet)
            def request = model.object?.request
            if (request) {
                ['listenerId', 'poolId', 'healthmonitorId'].each { String name ->
                    def q = request.getParameter(name)
                    if (q != null && q.toString().trim() && payload[name] == null) payload[name] = q.toString().trim()
                }
            }
            def lbId = payload.id
            log.info("loadbalancerUpdate() request payload for LB {}: {}", lbId, groovy.json.JsonOutput.toJson(payload))

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
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([success: false, error: 'Access denied: only the network owner can update load balancers'])
            }

            def result = lbService.update(cloud, tenantName, lbId, payload)
            log.info("loadbalancerUpdate() response for LB {}: success={}, msg={}, error={}", lbId, result.success, result.msg, result.error)
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
            def selection = payload.floatingIpPoolId ?: payload.selection ?: payload.floatingSelection

            if (isMockMode()) {
                return JsonResponse.of([success: true, message: 'Floating IP attached (mock)'])
            }

            def ctx = resolveContext(model)
            def cloud = ctx.cloud
            def pool = ctx.pool
            String tenantName = pool?.externalId ?: pool?.name
            if (!cloud || !lbId || !selection) {
                return JsonResponse.of([success: false, error: 'Missing required parameters'])
            }
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([success: false, error: 'Access denied: only the network owner can attach floating IPs'])
            }

            // Resolve the LB VIP port id
            def lbResp = lbService.get(cloud, tenantName, lbId.toString())
            if (!lbResp.success) {
                return JsonResponse.of([success: false, error: lbResp.msg ?: lbResp.error ?: "Failed to fetch LB ${lbId}"])
            }
            def vipPortId = (lbResp.data?.vip_port_id ?: lbResp.data?.vipPortId)?.toString()
            if (!vipPortId) {
                return JsonResponse.of([success: false, error: "Load balancer ${lbId} has no vip_port_id; cannot attach floating IP"])
            }

            String fipId = null
            Map createdFip = null
            if (selection.toString().startsWith('pool:')) {
                def externalNetworkId = selection.toString().substring('pool:'.length())
                log.info("floatingipAttach(): creating new Floating IP in external network {}", externalNetworkId)
                def createResp = networkingService.createFloatingIp(cloud, tenantName, externalNetworkId)
                if (!createResp.success) {
                    return JsonResponse.of([success: false, error: createResp.msg ?: createResp.error ?: "Failed to create floating IP"])
                }
                createdFip = createResp.data
                fipId = createdFip?.id?.toString()
            } else if (selection.toString().startsWith('fip:')) {
                fipId = selection.toString().substring('fip:'.length())
            } else {
                // Back-compat: if UI sends a raw id assume it's a floatingip id
                fipId = selection.toString()
            }

            if (!fipId) {
                return JsonResponse.of([success: false, error: "No floating IP id resolved from selection ${selection}"])
            }

            log.info("floatingipAttach(): associating floating IP {} to port {}", fipId, vipPortId)
            def assocResp = networkingService.associateFloatingIp(cloud, tenantName, fipId, vipPortId)
            if (!assocResp.success) {
                return JsonResponse.of([success: false, error: assocResp.msg ?: assocResp.error ?: "Failed to associate floating IP"])
            }

            def attached = assocResp.data ?: createdFip
            return JsonResponse.of([success: true, floatingip: attached])
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
            def pool = ctx.pool
            String tenantName = pool?.externalId ?: pool?.name
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing required parameters'])
            }
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([success: false, error: 'Access denied: only the network owner can detach floating IPs'])
            }

            def lbResp = lbService.get(cloud, tenantName, lbId.toString())
            if (!lbResp.success) {
                return JsonResponse.of([success: false, error: lbResp.msg ?: lbResp.error ?: "Failed to fetch LB ${lbId}"])
            }
            def vipPortId = (lbResp.data?.vip_port_id ?: lbResp.data?.vipPortId)?.toString()
            if (!vipPortId) {
                return JsonResponse.of([success: true, message: "No vip_port_id on LB ${lbId}; nothing to detach"])
            }

            // Find the floating IP currently associated with this VIP port id
            def fipsResp = networkingService.listFloatingIps(cloud, tenantName, [:])
            if (!fipsResp.success) {
                return JsonResponse.of([success: false, error: fipsResp.msg ?: fipsResp.error ?: "Failed to list floating IPs"])
            }
            def fip = (fipsResp.data ?: []).find { it?.port_id?.toString() == vipPortId }
            if (!fip?.id) {
                return JsonResponse.of([success: true, message: "No floating IP attached to LB ${lbId}"])
            }
            log.info("floatingipDetach(): disassociating floating IP {} from port {}", fip.id, vipPortId)
            def result = networkingService.disassociateFloatingIp(cloud, tenantName, fip.id.toString())
            if (!result.success) {
                return JsonResponse.of([success: false, error: result.msg ?: result.error ?: "Failed to detach floating IP"])
            }
            return JsonResponse.of([success: true, floatingip: result.data])
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
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([data: [], optionClouds: [], resourcePools: []])
            }
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
            if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([data: []])
            }
            def subnetsList = ctx.subnets
            
            if (subnetsList) {
                log.info("Mapping {} subnets for network ID: {}", subnetsList.size(), ctx.network?.id)
                def subnets = subnetsList.collect { sub ->
                    // Use the explicit sub model getters
                    def externalId = sub.getExternalId()
                    def id = sub.getId()
                    [
                        name      : sub.getName() ?: externalId ?: id?.toString(),
                        value     : externalId ?: id?.toString(),
                        cidr      : sub.getCidr(),
                        id        : id?.toString(),
                        externalId: externalId
                    ]
                }
                return JsonResponse.of([data: subnets])
            } else if (ctx.network) {
                log.warn("No subnets found for network ID {}, falling back to Network itself", ctx.network.id)
                def net = ctx.network
                def netExt = net.getExternalId()
                def netId = net.getId()
                def subnets = [[
                    name      : net.getName() ?: 'Network',
                    value     : netExt ?: netId?.toString(),
                    cidr      : net.getCidr(),
                    id        : netId?.toString(),
                    externalId: netExt
                ]]
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
            if (ctx?.network && !isCurrentUserNetworkOwner(model, ctx)) {
                return JsonResponse.of([data: []])
            }
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
                return JsonResponse.of([
                    floatingIpPools: [[name: 'ext-net', value: 'pool:ext-net-1']],
                    availableFloatingIps: [[name: '102.88.134.100', value: 'fip:fip-mock-1']]
                ])
            }

            def networkIdStr = getParam(model, 'networkId')
            if (networkIdStr) {
                def ctx = resolveContext(model)
                if (ctx.network && !isCurrentUserNetworkOwner(model, ctx)) {
                    return JsonResponse.of([floatingIpPools: [], availableFloatingIps: []])
                }
                def cloud = ctx.cloud
                def pool = ctx.pool
                String tenantName = pool?.externalId ?: pool?.name

                def pools = lookupService.listFloatingIpPools(Long.parseLong(networkIdStr)) ?: []
                def poolOptions = pools.collect { p ->
                    def ext = p.externalId ?: p.value
                    [name: p.name, value: "pool:${ext}", externalId: ext, id: p.id]
                }

                def available = []
                if (cloud && tenantName) {
                    try {
                        def fipsResp = networkingService.listFloatingIps(cloud, tenantName, [:])
                        if (fipsResp.success) {
                            available = (fipsResp.data ?: [])
                                .findAll { f -> !f?.port_id && f?.floating_ip_address }
                                .collect { f -> [name: f.floating_ip_address, value: "fip:${f.id}", id: f.id, address: f.floating_ip_address] }
                        } else {
                            log.warn("optionFloatingIpPools(): failed to list floating IPs: {}", fipsResp.msg ?: fipsResp.error)
                        }
                    } catch (Exception fex) {
                        log.warn("optionFloatingIpPools(): error listing available floating IPs: {}", fex.message)
                    }
                }

                return JsonResponse.of([floatingIpPools: poolOptions, availableFloatingIps: available])
            }
            return JsonResponse.of([floatingIpPools: [], availableFloatingIps: []])
        } catch (Exception ex) {
            log.error("optionFloatingIpPools() failed: {}", ex.message, ex)
            return JsonResponse.of([floatingIpPools: [], availableFloatingIps: []])
        }
    }
}
