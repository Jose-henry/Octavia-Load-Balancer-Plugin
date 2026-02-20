package com.example.providers

import com.example.CustomOctaviaLoadBalancerUiPlugin
import com.example.backend.MorpheusLookupService
import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.OptionSourceProvider
import com.morpheusdata.core.Plugin
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaOptionSourceProvider implements OptionSourceProvider {
    final Plugin plugin
    final MorpheusContext morpheus
    final MorpheusLookupService lookupService

    OctaviaOptionSourceProvider(Plugin plugin, MorpheusContext morpheus) {
        this.plugin = plugin
        this.morpheus = morpheus
        this.lookupService = new MorpheusLookupService(morpheus)
    }

    @Override
    MorpheusContext getMorpheus() { morpheus }

    @Override
    Plugin getPlugin() { plugin }

    @Override
    String getCode() { 'octavia-option-source' }

    @Override
    String getName() { 'Octavia Option Source' }

    @Override
    List<String> getMethodNames() {
        return [
            'projects', 'subnets', 'instances', 'floatingIpPools',
            'loadbalancers', 'loadbalancersCreate', 'loadbalancersDelete',
            'loadbalancerDetails', 'loadbalancerUpdate', 'floatingipAttach', 'floatingipDetach'
        ]
    }

    // --- Original Dropdown Options ---

    def projects(params) {
        def networkId = extractNetworkId(params)
        def ctx = lookupService.getNetworkContext(networkId)
        def project = ctx.project
        if (project) return [[name: project.name, value: project.id?.toString()]]
        return [[name: 'Demo Project', value: 'demo']]
    }

    def subnets(params) {
        def networkId = extractNetworkId(params)
        def ctx = lookupService.getNetworkContext(networkId)
        def net = ctx.network
        if (net?.subnets) {
            return net.subnets.collect { [name: it?.name ?: it?.cidr, value: it?.id?.toString(), cidr: it?.cidr] }
        }
        return [[name: 'demo-subnet', value: 'subnet-demo', cidr: '192.0.2.0/24']]
    }

    def instances(params) {
        def networkId = extractNetworkId(params)
        return lookupService.listInstancesOnNetwork(networkId)
    }

    def floatingIpPools(params) {
        def networkId = extractNetworkId(params)
        return lookupService.listFloatingIpPools(networkId)
    }

    // --- API RPC Workarounds (Returning JSON strings in 'value' property) ---

    // OptionSourceProviders receive `params` from the UI.
    // We return a list of maps: [[name: 'Response', value: '{"success":true,...}']]
    // which the frontend will parse.

    private def rpcResponse(Map responseMap) {
        try {
            return [[name: 'rpc', value: groovy.json.JsonOutput.toJson(responseMap)]]
        } catch(e) {
            return [[name: 'rpc', value: groovy.json.JsonOutput.toJson([success: false, message: e.message])]]
        }
    }

    def loadbalancers(params) {
        def networkId = extractNetworkId(params)
        // Delegate to the controller we created earlier, or call service directly.
        // For simplicity, we just lookup the same way OctaviaController would.
        try {
            // Note: In real life, OctaviaController has the mockService & networkingService.
            // We'll instantiate them locally or grab them. Let's just return mock data for now to prove routing works.
            return rpcResponse([success: true, loadbalancers: [[id: 'mock-1', name: 'RPC Works!', provisioning_status: 'ACTIVE']]])
        } catch(e) {
            return rpcResponse([success: false, message: e.message])
        }
    }

    def loadbalancerDetails(params) {
        return rpcResponse([success: true, loadbalancer: [id: params.id, name: 'RPC Works Details']])
    }

    def loadbalancersCreate(params) {
        return rpcResponse([success: true, message: 'Created via RPC'])
    }

    def loadbalancerUpdate(params) {
        return rpcResponse([success: true, message: 'Updated via RPC'])
    }

    def loadbalancersDelete(params) {
        return rpcResponse([success: true, message: 'Deleted via RPC'])
    }

    def floatingipAttach(params) {
        return rpcResponse([success: true, message: 'FIP Attached via RPC'])
    }

    def floatingipDetach(params) {
        return rpcResponse([success: true, message: 'FIP Detached via RPC'])
    }

    private static Long extractNetworkId(def params) {
        if (params instanceof Map) {
            def netId = params.networkId ?: params['network.id']
            if (netId) return netId.toString().tokenize(',').first().toLong()
        } else if (params?.getAt(0) instanceof Map) {
            def netId = params[0].networkId ?: params[0]['network.id']
            if (netId) return netId.toString().toLong()
        }
        return null
    }
}
