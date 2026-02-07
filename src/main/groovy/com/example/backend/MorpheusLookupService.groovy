package com.example.backend

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.data.DataFilter
import com.morpheusdata.core.data.DataQuery
import com.morpheusdata.model.Instance
import com.morpheusdata.model.Network
import groovy.util.logging.Slf4j
import io.reactivex.rxjava3.core.Single

/**
 * Thin wrappers around Morpheus lookups we need for options and validation.
 * In mock mode these are still called, but failures are swallowed so the UI
 * keeps working when the appliance has no matching data.
 */
@Slf4j
class MorpheusLookupService {

    private final MorpheusContext morpheus

    MorpheusLookupService(MorpheusContext morpheus) {
        this.morpheus = morpheus
    }

    /**
     * Basic context info for a network.
     */
    Map getNetworkContext(Long networkId) {
        try {
            Network net = morpheus.network.getNetworkById(networkId)?.blockingGet()
            def cloud = net?.cloud
            def project = net?.project
            return [network: net, cloud: cloud, project: project]
        } catch (Exception ex) {
            log.warn("getNetworkContext failed for networkId={}: {}", networkId, ex.message)
            return [:]
        }
    }

    /**
     * Instances whose interfaces are attached to the given network.
     */
    List<Map> listInstancesOnNetwork(Long networkId) {
        try {
            def query = new DataQuery().withFilter(new DataFilter("interfaces.network.id", networkId))
            def items = morpheus.instance.list(query).toList().blockingGet()
            return items.collect { Instance inst ->
                [name: inst.name, value: inst.id?.toString()]
            }
        } catch (Exception ex) {
            log.warn("listInstancesOnNetwork failed: {}", ex.message)
            return []
        }
    }

    /**
     * Floating IP pools associated with the network's cloud.
     */
    List<Map> listFloatingIpPools(Long networkId) {
        try {
            Network net = morpheus.network.getNetworkById(networkId)?.blockingGet()
            def cloud = net?.cloud
            if (!cloud) return []
            def pools = morpheus.network.listFloatingIpPools(cloud)?.toList()?.blockingGet() ?: []
            return pools.collect { [name: it?.name ?: "Pool ${it?.id}", value: it?.id?.toString()] }
        } catch (Exception ex) {
            log.warn("listFloatingIpPools failed: {}", ex.message)
            return []
        }
    }
}
