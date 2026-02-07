package com.example.backend

import com.example.CustomOctaviaLoadBalancerUiPlugin
import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.model.Permission
import com.morpheusdata.web.PluginController
import com.morpheusdata.web.Route
import com.morpheusdata.views.JsonResponse
import groovy.json.JsonSlurper
import groovy.util.logging.Slf4j

/**
 * AJAX endpoints consumed by the React UI.
 * Designed to work in mock mode by default; real Octavia calls can be
 * plugged into OctaviaApiService later.
 */
@Slf4j
class OctaviaController implements PluginController {

    final CustomOctaviaLoadBalancerUiPlugin plugin
    final MorpheusContext morpheus
    final MorpheusLookupService lookupService
    final PersistenceService persistence
    final OctaviaApiService apiService
    final boolean mockMode

    OctaviaController(CustomOctaviaLoadBalancerUiPlugin plugin, MorpheusContext morpheus) {
        this.plugin = plugin
        this.morpheus = morpheus
        // default demo ON; override with OCTAVIA_MOCK=false or -Doctavia.mock=false
        def env = System.getenv('OCTAVIA_MOCK')
        this.mockMode = env != null ? env.toBoolean() : !Boolean.getBoolean('octavia.mock') ? true : Boolean.getBoolean('octavia.mock')
        this.lookupService = new MorpheusLookupService(morpheus)
        this.persistence = PersistenceService.instance
        this.apiService = new OctaviaApiService(morpheus, mockMode)
    }

    @Override
    String getCode() { 'octavia-controller' }

    @Override
    String getName() { 'Octavia Controller' }

    @Override
    List<Route> getRoutes() {
        def readPerm = Permission.build('network', 'read')
        def writePerm = Permission.build('network', 'manage')
        [
            Route.build("/plugin/${plugin.code}/loadbalancers", 'loadbalancers', readPerm),
            Route.build("/plugin/${plugin.code}/loadbalancers/create", 'loadbalancersCreate', writePerm),
            Route.build("/plugin/${plugin.code}/loadbalancers/delete", 'loadbalancersDelete', writePerm),
            Route.build("/plugin/${plugin.code}/floatingip/attach", 'floatingipAttach', writePerm),
            Route.build("/plugin/${plugin.code}/floatingip/detach", 'floatingipDetach', writePerm),
            Route.build("/plugin/${plugin.code}/options/:type", 'options', readPerm)
        ]
    }

    // --- route handlers ----------------------------------------------------

    Object loadbalancers(Object request, Object response) {
        def params = extractParams(request)
        Long networkId = params.networkId ? params.networkId as Long : null
        Long instanceId = params.instanceId ? params.instanceId as Long : null

        List data = []
        if (networkId) data = persistence.listByNetwork(networkId)
        else if (instanceId) data = persistence.listByInstance(instanceId)

        return JsonResponse.of([loadbalancers: data])
    }

    Object loadbalancersCreate(Object request, Object response) {
        def body = extractJson(request)
        Long networkId = body.networkId as Long
        if (!networkId) return badRequest("networkId is required")
        if (!body.name) return badRequest("name is required")
        def ctx = lookupService.getNetworkContext(networkId)
        def result = apiService.createLoadBalancer(ctx, body)
        return JsonResponse.of(result.toMap())
    }

    Object loadbalancersDelete(Object request, Object response) {
        def body = extractJson(request)
        Long networkId = body.networkId as Long
        if (!networkId) return badRequest("networkId is required")
        if (!body.lbId) return badRequest("lbId is required")
        def ctx = lookupService.getNetworkContext(networkId)
        def result = apiService.deleteLoadBalancer(ctx, body.lbId as String)
        return JsonResponse.of(result.toMap())
    }

    Object floatingipAttach(Object request, Object response) {
        def body = extractJson(request)
        if (!body.networkId) return badRequest("networkId is required")
        if (!body.lbId) return badRequest("lbId is required")
        if (!body.floatingIpPoolId) return badRequest("floatingIpPoolId is required")
        def ctx = lookupService.getNetworkContext(body.networkId as Long)
        def result = apiService.attachFloatingIp(ctx, body.lbId as String, body.floatingIpPoolId as Long)
        return JsonResponse.of(result.toMap())
    }

    Object floatingipDetach(Object request, Object response) {
        def body = extractJson(request)
        if (!body.networkId) return badRequest("networkId is required")
        if (!body.lbId) return badRequest("lbId is required")
        def ctx = lookupService.getNetworkContext(body.networkId as Long)
        def result = apiService.detachFloatingIp(ctx, body.lbId as String)
        return JsonResponse.of(result.toMap())
    }

    Object options(Object request, Object response) {
        def params = extractParams(request)
        String type = params.type
        Long networkId = params.networkId ? params.networkId as Long : null
        def ctx = lookupService.getNetworkContext(networkId)

        switch (type) {
            case 'projects':
                return JsonResponse.of([projects: projects(ctx)])
            case 'subnets':
                return JsonResponse.of([subnets: subnets(ctx)])
            case 'instances':
                return JsonResponse.of([instances: lookupService.listInstancesOnNetwork(networkId)])
            case 'floatingIpPools':
                return JsonResponse.of([floatingIpPools: lookupService.listFloatingIpPools(networkId)])
            default:
                return JsonResponse.of([error: "Unknown option type $type"])
        }
    }

    // --- helpers -----------------------------------------------------------

    private Map extractParams(Object request) {
        try {
            def p = request?.params ?: [:]
            if (p instanceof Map) return p
        } catch (ignored) { }
        return [:]
    }

    private Map extractJson(Object request) {
        try {
            def raw = request?.JSON
            if (raw instanceof Map) return raw
        } catch (ignored) { }
        try {
            def txt = request?.inputStream?.text
            if (txt) return (Map)new JsonSlurper().parseText(txt)
        } catch (ignored) { }
        return [:]
    }

    private List projects(Map ctx) {
        def project = ctx.project
        if (project) return [[name: project.name ?: 'Project', value: project.id?.toString()]]
        return [[name: 'Demo Project', value: 'demo']]
    }

    private List subnets(Map ctx) {
        def net = ctx.network
        if (net?.subnets) {
            return net.subnets.collect { [name: it?.name ?: it?.cidr ?: 'subnet', value: it?.id?.toString(), cidr: it?.cidr] }
        }
        // fallback demo subnet
        return [[name: 'demo-subnet', value: 'subnet-demo', cidr: '192.0.2.0/24']]
    }

    private JsonResponse badRequest(String msg) {
        JsonResponse.of([success: false, error: msg], 400)
    }
}
