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

    OctaviaController(Plugin plugin, MorpheusContext morpheusContext) {
        this.plugin = plugin
        this.morpheusContext = morpheusContext
        initServices(morpheusContext)
        log.info("OctaviaController instantiated with real + mock service integration")
    }

    private void initServices(MorpheusContext ctx) {
        this.lbService = new OctaviaLoadBalancerService()
        this.poolService = new OctaviaPoolService()
        this.networkingService = new OctaviaNetworkingService()
        this.mockService = new MockOctaviaService()
        this.lookupService = ctx ? new MorpheusLookupService(ctx) : null
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

    /** Minimal diagnostic endpoint */
    def ping(ViewModel<Map> model) {
        log.info(">>> PING HANDLER REACHED! <<<")
        return JsonResponse.of([success: true, message: 'Octavia plugin is alive', timestamp: System.currentTimeMillis()])
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
                    return new JsonSlurper().parseText(body) as Map
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
            return model.object?.request?.getParameter(name)
        } catch (Exception ex) {
            log.debug("Could not get param {}: {}", name, ex.message)
            return null
        }
    }

    /** Resolve OpenStack context (cloud, project) from networkId or instanceId */
    private Map resolveContext(ViewModel<Map> model) {
        def networkIdStr = getParam(model, 'networkId')
        def instanceIdStr = getParam(model, 'instanceId')
        Map ctx = [:]
        try {
            if (networkIdStr) {
                ctx = lookupService.getNetworkContext(Long.parseLong(networkIdStr))
                ctx.networkId = networkIdStr
            } else if (instanceIdStr) {
                ctx = lookupService.getInstanceContext(Long.parseLong(instanceIdStr))
                ctx.instanceId = instanceIdStr
            }
        } catch (Exception ex) {
            log.warn("resolveContext failed: {}", ex.message)
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
            def project = ctx.project
            if (!cloud) {
                log.warn("No cloud context found, returning empty list")
                return JsonResponse.of([loadbalancers: []])
            }

            def result = lbService.listLoadBalancers(cloud, project?.externalId)
            return JsonResponse.of(result)
        } catch (Exception ex) {
            log.error("loadbalancers() failed: {}", ex.message, ex)
            return JsonResponse.of([success: false, error: ex.message])
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
            def project = ctx.project
            if (!cloud) {
                return JsonResponse.of([success: false, error: 'Cloud context not found'])
            }

            def result = lbService.createLoadBalancer(cloud, project?.externalId, payload)
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
            def project = ctx.project
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing cloud context or LB id'])
            }

            def result = lbService.deleteLoadBalancer(cloud, project?.externalId, lbId)
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
            def project = ctx.project
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing cloud context or LB id'])
            }

            // Fetch the LB details via the list endpoint with filter, or individual get
            // Since OctaviaLoadBalancerService.listLoadBalancers returns all, filter client-side
            def allResult = lbService.listLoadBalancers(cloud, project?.externalId)
            def lbs = allResult.loadbalancers ?: []
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
            def project = ctx.project
            if (!cloud || !lbId) {
                return JsonResponse.of([success: false, error: 'Missing cloud context or LB id'])
            }

            def result = lbService.updateLoadBalancer(cloud, project?.externalId, lbId, payload)
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
                return JsonResponse.of([projects: [[name: 'Mock Project', value: 'mock-project-id']]])
            }

            def ctx = resolveContext(model)
            def project = ctx.project
            if (project) {
                return JsonResponse.of([projects: [[name: project.name ?: 'Default', value: project.externalId ?: project.id?.toString()]]])
            }
            return JsonResponse.of([projects: []])
        } catch (Exception ex) {
            log.error("optionProjects() failed: {}", ex.message, ex)
            return JsonResponse.of([projects: []])
        }
    }

    def optionSubnets(ViewModel<Map> model) {
        log.info("optionSubnets() handler called")
        try {
            if (isMockMode()) {
                return JsonResponse.of([subnets: [[name: 'mock-subnet (192.168.1.0/24)', value: 'subnet-mock-001', cidr: '192.168.1.0/24']]])
            }

            def ctx = resolveContext(model)
            def network = ctx.network
            if (network) {
                // For OpenStack, subnets are related to the network
                // Use the network's subnet information if available
                def subnets = []
                if (network.subnets) {
                    subnets = network.subnets.collect { sub ->
                        [name: "${sub.name ?: sub.externalId} (${sub.cidr ?: 'n/a'})", value: sub.externalId ?: sub.id?.toString(), cidr: sub.cidr]
                    }
                } else if (network.externalId) {
                    // Fallback: return the network itself as a subnet option
                    subnets = [[name: network.name ?: 'Network', value: network.externalId, cidr: network.cidr]]
                }
                return JsonResponse.of([subnets: subnets])
            }
            return JsonResponse.of([subnets: []])
        } catch (Exception ex) {
            log.error("optionSubnets() failed: {}", ex.message, ex)
            return JsonResponse.of([subnets: []])
        }
    }

    def optionInstances(ViewModel<Map> model) {
        log.info("optionInstances() handler called")
        try {
            if (isMockMode()) {
                return JsonResponse.of([instances: [[name: 'mock-instance-1', value: 'inst-001'], [name: 'mock-instance-2', value: 'inst-002']]])
            }

            def networkIdStr = getParam(model, 'networkId')
            if (networkIdStr) {
                def instances = lookupService.listInstancesOnNetwork(Long.parseLong(networkIdStr))
                return JsonResponse.of([instances: instances])
            }
            return JsonResponse.of([instances: []])
        } catch (Exception ex) {
            log.error("optionInstances() failed: {}", ex.message, ex)
            return JsonResponse.of([instances: []])
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
