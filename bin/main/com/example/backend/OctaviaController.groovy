package com.example.backend

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.Plugin
import com.morpheusdata.model.Permission
import com.morpheusdata.web.PluginController
import com.morpheusdata.web.Route
import com.morpheusdata.views.JsonResponse
import com.morpheusdata.views.ViewModel
import groovy.util.logging.Slf4j

/**
 * Minimal Octavia controller — stripped of all non-essential dependencies
 * to isolate the 404 routing issue.
 *
 * Following the exact pattern from Morpheus docs:
 *   Route.build(url, methodName, permission) where methodName = the method to call on this controller.
 *   Handler methods receive ViewModel<Map> and return JsonResponse.
 */
@Slf4j
class OctaviaController implements PluginController {

    Plugin plugin
    MorpheusContext morpheusContext

    OctaviaController(Plugin plugin, MorpheusContext morpheusContext) {
        this.plugin = plugin
        this.morpheusContext = morpheusContext
        log.info("OctaviaController instantiated successfully. Plugin code: {}", plugin?.getCode())
    }

    // ── PluginProvider required methods ──────────────────────────
    @Override
    String getCode() { 'octavia-controller' }

    @Override
    String getName() { 'Octavia Controller' }

    @Override
    MorpheusContext getMorpheus() { morpheusContext }

    @Override
    Plugin getPlugin() { plugin }

    // ── Routes ──────────────────────────────────────────────────
    @Override
    List<Route> getRoutes() {
        log.info("OctaviaController.getRoutes() called")
        [
            Route.build("/plugin/octavia1234/loadbalancers",          "loadbalancers",         Permission.build("network", "read")),
            Route.build("/plugin/octavia1234/loadbalancersCreate",    "loadbalancersCreate",   Permission.build("network", "full")),
            Route.build("/plugin/octavia1234/loadbalancersDelete",    "loadbalancersDelete",   Permission.build("network", "full")),
            Route.build("/plugin/octavia1234/loadbalancerDetails",    "loadbalancerDetails",   Permission.build("network", "read")),
            Route.build("/plugin/octavia1234/loadbalancerUpdate",     "loadbalancerUpdate",    Permission.build("network", "full")),
            Route.build("/plugin/octavia1234/floatingipAttach",       "floatingipAttach",      Permission.build("network", "full")),
            Route.build("/plugin/octavia1234/floatingipDetach",       "floatingipDetach",      Permission.build("network", "full")),
            Route.build("/plugin/octavia1234/optionProjects",         "optionProjects",        Permission.build("network", "read")),
            Route.build("/plugin/octavia1234/optionSubnets",          "optionSubnets",         Permission.build("network", "read")),
            Route.build("/plugin/octavia1234/optionInstances",        "optionInstances",       Permission.build("network", "read")),
            Route.build("/plugin/octavia1234/optionFloatingIpPools",  "optionFloatingIpPools", Permission.build("network", "read"))
        ]
    }

    // ── Handlers — all return static mock JSON for now ────────────

    def loadbalancers(ViewModel<Map> model) {
        log.info("loadbalancers() handler called")
        return JsonResponse.of([
            loadbalancers: [
                [id: 'lb-mock-1', name: 'Mock LB 1', provisioning_status: 'ACTIVE', operating_status: 'ONLINE',
                 vip_address: '10.0.0.1', provider: 'octavia', listeners: [], pools: []],
                [id: 'lb-mock-2', name: 'Mock LB 2', provisioning_status: 'ACTIVE', operating_status: 'ONLINE',
                 vip_address: '10.0.0.2', provider: 'octavia', listeners: [], pools: []]
            ]
        ])
    }

    def loadbalancersCreate(ViewModel<Map> model) {
        log.info("loadbalancersCreate() handler called")
        return JsonResponse.of([success: true, data: [id: 'lb-new-1', name: 'New Mock LB', provisioning_status: 'ACTIVE']])
    }

    def loadbalancersDelete(ViewModel<Map> model) {
        log.info("loadbalancersDelete() handler called")
        return JsonResponse.of([success: true])
    }

    def loadbalancerDetails(ViewModel<Map> model) {
        log.info("loadbalancerDetails() handler called")
        return JsonResponse.of([success: true, data: [id: 'lb-mock-1', name: 'Mock LB 1', provisioning_status: 'ACTIVE']])
    }

    def loadbalancerUpdate(ViewModel<Map> model) {
        log.info("loadbalancerUpdate() handler called")
        return JsonResponse.of([success: true])
    }

    def floatingipAttach(ViewModel<Map> model) {
        log.info("floatingipAttach() handler called")
        return JsonResponse.of([success: true])
    }

    def floatingipDetach(ViewModel<Map> model) {
        log.info("floatingipDetach() handler called")
        return JsonResponse.of([success: true])
    }

    def optionProjects(ViewModel<Map> model) {
        log.info("optionProjects() handler called")
        return JsonResponse.of([projects: [[name: 'Mock Project', value: 'mock-project']]])
    }

    def optionSubnets(ViewModel<Map> model) {
        log.info("optionSubnets() handler called")
        return JsonResponse.of([subnets: [[name: 'mock-subnet', value: 'subnet-mock', cidr: '192.168.1.0/24']]])
    }

    def optionInstances(ViewModel<Map> model) {
        log.info("optionInstances() handler called")
        return JsonResponse.of([instances: [[name: 'mock-instance-1', value: 'inst-001']]])
    }

    def optionFloatingIpPools(ViewModel<Map> model) {
        log.info("optionFloatingIpPools() handler called")
        return JsonResponse.of([floatingIpPools: [[name: 'ext-net', value: 'ext-net-1']]])
    }
}
