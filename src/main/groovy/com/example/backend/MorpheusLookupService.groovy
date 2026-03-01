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
     * Basic context info for a network. Fetches Cloud via refId, Owner (account), and Subnets using explicit getters.
     */
    Map getNetworkContext(Long networkId) {
        try {
            Network net = morpheus.async.network.get(networkId)?.blockingGet()
            
            if (!net) {
                log.warn("Network {} not found", networkId)
                return [:]
            }
            
            // Resolve Cloud using refType and refId (ComputeZone == Cloud in Morpheus)
            def cloud = null
            if (net.getRefType() == 'ComputeZone' && net.getRefId()) {
                cloud = morpheus.async.cloud.getCloudById(net.getRefId())?.blockingGet()
                
                // === DIAGNOSTIC: Fetch Configuration Options and Credentials ===
                if (cloud) {
                    try {
                        // Attempt to load the linked account credentials into the credentialData map
                        def creds = morpheus.async.cloud.loadCredentials(cloud.id)?.blockingGet()
                        log.info("  -> Found AccountCredential for cloud (ID: {}): {}", cloud.id, creds?.id)
                        
                        Map config = cloud.getConfigMap() ?: [:]
                        Map credData = cloud.getAccountCredentialData() ?: [:]
                        
                        String identityApi = config.get("identityApi")
                        String computeApi = config.get("computeApi")
                        String networkApi = config.get("networkApi")
                        String loadBalancerApi = config.get("loadBalancerApi")
                        String identityVersion = config.get("identityVersion")
                        String domainId = config.get("domainId")
                        String projectName = config.get("projectName") ?: config.get("tenantName") ?: cloud.getAccount()?.name ?: "UNKNOWN"
                        
                        String username = credData.get("username") ?: cloud.getServiceUsername()
                        String password = credData.get("password") ?: (cloud.getServicePassword() ? "*******" : null)
                        
                        log.info("  -> === EXTRACTED CLOUD ENDPOINTS & CREDENTIALS ===")
                        log.info("     - identityApi: {}", identityApi)
                        log.info("     - computeApi: {}", computeApi)
                        log.info("     - networkApi: {}", networkApi)
                        log.info("     - loadBalancerApi: {}", loadBalancerApi)
                        log.info("     - identityVersion: {}", identityVersion)
                        log.info("     - domainId: {}", domainId)
                        log.info("     - projectName (tenant): {}", projectName)
                        log.info("     - username: {}", username ? "PRESENT" : "MISSING")
                        log.info("     - password: {}", password ? "PRESENT" : "MISSING")
                        log.info("  -> ==============================================")
                        
                    } catch(Exception credEx) {
                        log.error("     ! Failed to load/parse credentials for Cloud {}: {}", cloud.id, credEx.message)
                    }
                }
            }
            
            // Explicitly fetch nested attributes
            def project = net.getOwner() // Account owner maps to OpenStack tenant/project
            def subnets = net.getSubnets() ?: []
            def cidr = net.getCidr()
            
            // Explicitly fetch resource pool (CloudPool) properties
            def singlePool = net.getCloudPool()
            def assignedPools = net.getAssignedZonePools() ?: []
            
            log.info("Resolved Network '{}' (ID: {}, CIDR: {})", net.getName(), net.getId(), cidr)
            if (cloud) {
                log.info("  -> Associated Cloud: '{}' (ID: {}, Code: {})", cloud.getName(), cloud.getId(), cloud.getCode())
            } else {
                log.info("  -> Associated Cloud: None found (refType: {}, refId: {})", net.getRefType(), net.getRefId())
            }
            if (project) {
                log.info("  -> Associated Owner/Project: '{}' (ID: {})", project.getName(), project.getId())
            }
            if (singlePool) {
                log.info("  -> Associated Resource Pool (CloudPool): '{}' (ID: {})", singlePool.getName(), singlePool.getId())
            }
            if (assignedPools) {
                log.info("  -> Assigned Zone Pools count: {}", assignedPools.size())
                assignedPools.each { p ->
                    log.info("     - Pool: '{}' (ID: {})", p.getName(), p.getId())
                }
            }
            log.info("  -> Associated Subnets count: {}", subnets.size())
            subnets.each { sub ->
                log.info("     - Subnet: '{}' (ID: {}, CIDR: {}, Gateway: {})", sub.getName(), sub.getId(), sub.getCidr(), sub.getGateway())
            }

            return [network: net, cloud: cloud, project: project, subnets: subnets, pool: singlePool, assignedPools: assignedPools]
        } catch (Exception ex) {
            log.warn("getNetworkContext failed for networkId={}: {}", networkId, ex.message, ex)
            return [:]
        }
    }

    /**
     * Instances whose interfaces are attached to the given network or belonging to the account.
     * The user explicitly requested that members be a list of ALL members in the current tenancy, 
     * not only scoped to the network we are currently creating the loadbalancer.
     */
    List<Map> listInstances(Map ctx) {
        try {
            def account = ctx?.project
            if (!account) {
                log.warn("No project/account found in context to filter instances")
                return []
            }
            log.info("Fetching instances for account: {}", account.id)
            
            def items = []
            morpheus.async.instance.listIdentityProjections(new DataQuery().withFilter("account.id", account.id))
                .flatMapMaybe { projection -> morpheus.async.instance.get(projection.id) }
                .blockingSubscribe(
                    { inst -> 
                        if (inst.containers && !inst.containers.isEmpty()) {
                            inst.containers.each { container ->
                                // Get internal IP
                                String containerIp = ""
                                if (container.server) {
                                    containerIp = container.server.internalIp ?: container.server.externalIp ?: ""
                                }
                                
                                // Fallback to container's own IPs if no server IP
                                if (!containerIp) {
                                    containerIp = container.internalIp ?: container.externalIp ?: ""
                                }
                                
                                if (!containerIp) {
                                    containerIp = "0.0.0.0"
                                }
                                
                                // Get external IP
                                String externalIp = ""
                                if (container.server) {
                                    externalIp = container.server.externalIp ?: ""
                                }
                                
                                // Fallback to container's own external IP if no server external IP
                                if (!externalIp) {
                                    externalIp = container.externalIp ?: ""
                                }
                                
                                String displayName = inst.containers.size() > 1 ? 
                                    "${inst.name} - ${container.name ?: 'VM'}" : 
                                    (inst.name ?: "Instance ${inst.id}")
                                
                                if (containerIp && containerIp != "0.0.0.0") {
                                    displayName += " (${containerIp})"
                                }
                                
                                log.info("Found VM/Container {} with Internal IP {} and External IP {} for Instance {}", 
                                    container.name, containerIp, externalIp, inst.name)
                                
                                items << [
                                    name: displayName, 
                                    value: container.id?.toString(),
                                    instanceId: inst.id?.toString(),
                                    ip: containerIp,
                                    externalIp: externalIp ?: null  // Add external IP to response
                                ]
                            }
                        } else {
                            log.info("Instance {} ID {} has no containers", inst.name, inst.id)
                        }
                    },
                    { error -> log.warn("Error fetching instance details for listing: {}", error.message) }
                )
            
            log.info("listInstances returning {} VM/Container nodes", items.size())    
            return items
        } catch (Exception ex) {
            log.warn("listInstances failed: {}", ex.message)
            return []
        }
    }

    /**
     * Floating IP pools associated with the network's cloud, further narrowed by Resource Pool (CloudPool)
     * when that association is available. This prevents showing FIP pools for every project in the cloud.
     */
    List<Map> listFloatingIpPools(Long networkId) {
        try {
            def ctx = getNetworkContext(networkId)
            Network net = ctx.network
            def cloud = ctx.cloud

            if (!cloud) {
                log.warn("No cloud associated with network {} to list FIP pools", networkId)
                return []
            }

            // First filter by cloud via polymorphic refType/refId (ComputeZone)
            def query = new DataQuery()
                .withFilter(new DataFilter("refType", "ComputeZone"))
                .withFilter(new DataFilter("refId", cloud.id?.toString()))

            def pools = morpheus.async.network.floatingIp.pool.list(query).toList().blockingGet() ?: []
            if (!pools) {
                log.info("No floating IP pools found for cloud {} ({})", cloud.id, cloud.name)
            }

            // Manually limit to a single instance of each desired external pool by name, in a fixed order.
            if (pools) {
                def desiredNames = ['public-network-01', 'public-network-02', 'public-network-03', 'public-network-04']
                def selected = []
                desiredNames.each { name ->
                    def match = pools.find { it?.name == name }
                    if (match) {
                        selected << match
                    }
                }
                if (selected) {
                    log.info("listFloatingIpPools: reduced {} pools down to {} named public-network-01..04", pools.size(), selected.size())
                    pools = selected
                }
            }

            return pools.collect { pool ->
                def extId = null
                try {
                    if (pool?.metaClass?.hasProperty(pool, 'externalId')) {
                        extId = pool.externalId
                    }
                } catch (ignored) {}
                // In OpenStack, the externalId is typically the Neutron network id for the external network
                def value = (extId ?: pool.getId()?.toString())
                [
                    name      : pool.getName() ?: "Pool ${pool.getId()}",
                    value     : value,
                    id        : pool.getId()?.toString(),
                    externalId: extId
                ]
            }
        } catch (Exception ex) {
            log.warn("listFloatingIpPools failed: {}", ex.message, ex)
            return []
        }
    }
    /**
     * Context info from an Instance (Cloud + Project + Network).
     * Uses Morpheus Plugin API patterns (Context7/docs):
     * - Instance has provisionZoneId (cloud id), resourcePool (CloudPool), account (Account).
     * - DataQuery withJoin() to load relations (e.g. containers.server.cloud).
     * - ComputeServer has getCloud() for cloud association.
     */
    Map getInstanceContext(Long instanceId) {
        try {
            // Load instance with joins so relations are populated (DataQuery withJoin per Plugin API docs)
            def query = new DataQuery().withFilter("id", instanceId)
                .withJoin("containers")
                .withJoin("containers.server")
                .withJoin("resourcePool")
                .withJoin("account")
            def inst = morpheus.async.instance.find(query)?.blockingGet()
            if (!inst) {
                inst = morpheus.async.instance.get(instanceId)?.blockingGet()
            }
            if (!inst) return [:]

            def cloud = null
            def project = null
            def pool = null
            def network = null

            // 1) Instance-level fields (Plugin API: Instance has provisionZoneId, resourcePool, account)
            try {
                if (inst.hasProperty('provisionZoneId') && inst.provisionZoneId != null) {
                    cloud = morpheus.async.cloud.getCloudById(inst.provisionZoneId)?.blockingGet()
                    if (cloud) log.debug("getInstanceContext: cloud from instance.provisionZoneId {}", inst.provisionZoneId)
                }
            } catch (e) { log.debug("getInstanceContext: provisionZoneId: {}", e.message) }
            try {
                if (inst.hasProperty('resourcePool') && inst.resourcePool != null) {
                    pool = inst.resourcePool
                    if (!project && inst.hasProperty('account') && inst.account != null) project = inst.account
                }
            } catch (e) { log.debug("getInstanceContext: resourcePool/account: {}", e.message) }
            if (inst.hasProperty('account') && inst.account != null) {
                project = project ?: inst.account
            }

            // 2) Network from Instance interfaces (withJoin can populate netInterfaces in some versions)
            if (!network) {
                try {
                    def ifaces = inst.netInterfaces
                    if (ifaces && !ifaces.isEmpty() && ifaces[0].network) {
                        network = ifaces[0].network
                    }
                } catch (e) { log.debug("getInstanceContext: netInterfaces: {}", e.message) }
            }
            if (network && !cloud) {
                if (network.getRefType() == 'ComputeZone' && network.getRefId()) {
                    cloud = morpheus.async.cloud.getCloudById(network.getRefId())?.blockingGet()
                }
                if (!project) project = network.getOwner()
                if (!pool) pool = network.getCloudPool()
                log.info("getInstanceContext: instance {} -> network '{}' (id {}), cloud: {}",
                    instanceId, network?.getName(), network?.getId(), cloud?.getName())
            }

            // 3) ComputeServer.getCloud() from first container (Plugin API: ComputeServer has getCloud())
            if (!cloud && inst.containers && !inst.containers.isEmpty()) {
                for (def container : inst.containers) {
                    def server = container?.server
                    if (!server) continue
                    try {
                        if (server.respondsTo('getCloud')) {
                            def c = server.getCloud()
                            if (c != null) { cloud = c; break }
                        }
                        if (server.hasProperty('cloud') && server.cloud != null) {
                            cloud = server.cloud
                            break
                        }
                    } catch (e) { log.debug("getInstanceContext: server getCloud: {}", e.message) }
                }
                if (cloud) {
                    log.info("getInstanceContext: instance {} -> cloud '{}' (id {}) from container server",
                        instanceId, cloud?.getName(), cloud?.getId())
                    if (!pool) {
                        try {
                            def server = inst.containers[0]?.server
                            if (server?.hasProperty('assignedZonePools') && server.assignedZonePools && !server.assignedZonePools.isEmpty()) {
                                pool = server.assignedZonePools[0]
                            }
                            if (!pool && server?.hasProperty('cloudPool') && server.cloudPool != null) pool = server.cloudPool
                        } catch (e) { log.debug("getInstanceContext: server pool: {}", e.message) }
                    }
                    if (!project && inst.hasProperty('account') && inst.account != null) project = inst.account
                }
            }

            // 4) Fallbacks: instance.cloud, instance.site (ComputeSite)
            if (!cloud) {
                if (inst.hasProperty('cloud') && inst.cloud) cloud = inst.cloud
                if (!cloud && inst.site != null) {
                    try {
                        if (inst.site.hasProperty('id')) {
                            cloud = morpheus.async.cloud.getCloudById(inst.site.id)?.blockingGet()
                        }
                    } catch (e) { log.debug("getInstanceContext: site: {}", e.message) }
                }
                if (!cloud) {
                    log.warn("getInstanceContext: no cloud for instance {} (provisionZoneId: {}, network: {}, containers: {})",
                        instanceId, inst.hasProperty('provisionZoneId') ? inst.provisionZoneId : null,
                        network?.name, inst.containers?.size())
                }
            }

            // Normalize cloud: always use getCloudById so the Cloud is fully loaded (config + credentials).
            // server.getCloud() / instance refs may return a shallow object without account credential data.
            if (cloud?.id != null) {
                def loadedCloud = morpheus.async.cloud.getCloudById(cloud.id)?.blockingGet()
                if (loadedCloud) cloud = loadedCloud
            }

            return [instance: inst, cloud: cloud, project: project, pool: pool, network: network]
        } catch (Exception ex) {
            log.warn("getInstanceContext failed for instanceId={}: {}", instanceId, ex.message)
            return [:]
        }
    }
}
