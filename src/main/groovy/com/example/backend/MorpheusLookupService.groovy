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
                        String projectName = config.get("projectName") ?: config.get("tenantName")
                        
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
                                String containerIp = container.internalIp ?: container.externalIp ?: ""
                                String displayName = inst.containers.size() > 1 ? "${inst.name} - ${container.name ?: 'VM'}" : (inst.name ?: "Instance ${inst.id}")
                                
                                if (containerIp) {
                                    displayName += " (${containerIp})"
                                }
                                
                                log.info("Found VM/Container {} with IP {} for Instance {}", container.name, containerIp, inst.name)
                                
                                items << [
                                    name: displayName, 
                                    value: container.id?.toString(), // Use the container ID so the UI can look up the specific node
                                    instanceId: inst.id?.toString(),
                                    ip: containerIp
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
     * Floating IP pools associated with the network's cloud.
     */
    List<Map> listFloatingIpPools(Long networkId) {
        try {
            Network net = morpheus.async.network.get(networkId)?.blockingGet()
            def cloud = null
            if (net?.getRefType() == 'ComputeZone' && net?.getRefId()) {
                cloud = morpheus.async.cloud.getCloudById(net.getRefId())?.blockingGet()
            }
            if (!cloud) {
                log.warn("No cloud associated with network {} to list FIP pools", networkId)
                return []
            }
            
            // FIP Pools are linked polymorphic via refType/refId (ComputeZone)
            def query = new DataQuery()
                .withFilter(new DataFilter("refType", "ComputeZone"))
                .withFilter(new DataFilter("refId", cloud.id))
            
            // Using explicit MorpheusNetworkFloatingIpPoolService
            def pools = morpheus.async.network.floatingIp.pool.list(query).toList().blockingGet()
            
            // Fallback: If strict refType filtering yields nothing, try listing all pools for now so UI is unblocked
            if (!pools) {
                log.info("Strict refType filter yielded 0 pools, falling back to all floating IP pools")
                pools = morpheus.async.network.floatingIp.pool.list(new DataQuery()).toList().blockingGet() ?: []
            }
            
            return pools.collect { pool -> 
                [name: pool.getName() ?: "Pool ${pool.getId()}", value: pool.getId()?.toString()] 
            }
        } catch (Exception ex) {
            log.warn("listFloatingIpPools failed: {}", ex.message, ex)
            return []
        }
    }
    /**
     * Context info from an Instance (Cloud + Project).
     */
    Map getInstanceContext(Long instanceId) {
        try {
            Instance inst = morpheus.async.instance.find(new DataQuery().withFilter("id", instanceId))?.blockingGet()
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

            // Explicit project property doesn't exist on Instance
            return [instance: inst, cloud: instCloud, project: null, network: network]
        } catch (Exception ex) {
            log.warn("getInstanceContext failed for instanceId={}: {}", instanceId, ex.message)
            return [:]
        }
    }
}
