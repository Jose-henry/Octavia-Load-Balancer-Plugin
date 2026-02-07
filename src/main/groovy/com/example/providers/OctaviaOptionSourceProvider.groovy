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
        return ['projects', 'subnets', 'instances', 'floatingIpPools']
    }

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
