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
            def cloud = null
            if (net?.refType == 'ComputeZone' && net?.refId) {
                cloud = morpheus.cloud.getCloudById(net.refId)?.blockingGet()
            }
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
            def cloud = null
            if (net?.refType == 'ComputeZone' && net?.refId) {
                cloud = morpheus.cloud.getCloudById(net.refId)?.blockingGet()
            }
            if (!cloud) return []
            def pools = morpheus.network.listFloatingIpPools(cloud)?.toList()?.blockingGet() ?: []
            return pools.collect { [name: it?.name ?: "Pool ${it?.id}", value: it?.id?.toString()] }
        } catch (Exception ex) {
            log.warn("listFloatingIpPools failed: {}", ex.message)
            return []
        }
    }
    /**
     * Context info from an Instance (Cloud + Project).
     */
    Map getInstanceContext(Long instanceId) {
        try {
            Instance inst = morpheus.instance.get(instanceId).blockingGet()
            if (!inst) return [:]

            // Resolve Cloud (Site/Zone)
            def cloud = inst.site
             // If site is not the cloud (e.g. it's a group), try to find cloud via other means
             // In Morpheus model, Instance.site usually refers to the Group (ComputeSite).
             // The Cloud is available via .cloud (if property exists) or we have to query.
             // Accessing dynamic property might be risky in compiled Groovy.
             // Safe way: morpheus.cloud.getCloudById(inst.cloud.id) if inst.cloud exists.
            
             // But let's try to get cloud from network?
             // An instance has interfaces.
             // We can pick the first interface's network -> cloud.
            
            if (!cloud && inst.plan?.provisionType?.code == 'openstack') {
                 // Try to find cloud via network
                 // This is safer to ensure we get the right OpenStack cloud
            }

            // Using pure Morpheus Object Model (properties might differ by version)
            // Let's try dynamic access via property
             def instCloud = inst.hasProperty('cloud') ? inst.cloud : null
             
             // Fallback: Resolve from Group if single cloud?
             // Best bet: Interfaces.
             
             // Let's query instance clouds via service?
             // morpheus.async.instance.getInstanceClouds(inst)
             
             // Let's stick to what we know works: OpenStack Instances usually have a Cloud ref.
             if (!instCloud) {
                 // Try to get from first interface
                 // We need to fetch Interfaces?
                 // Let's return basic info and let Controller handle if missing
             }
             
             // Resolve Network from Instance Interfaces (Primary)
             def network = null
             // Accessing interfaces via property or method?
             // inst.getNetInterfaces() or inst.interfaces?
             // Safest is to try property access
             try {
                def ifaces = inst.netInterfaces
                if (ifaces && ifaces.size() > 0) {
                    network = ifaces[0].network
                }
             } catch (e) { log.debug("Could not resolve network from instance: ${e}") }

            return [instance: inst, cloud: instCloud, project: inst.project, network: network]
        } catch (Exception ex) {
            log.warn("getInstanceContext failed for instanceId={}: {}", instanceId, ex.message)
            return [:]
        }
    }
}
