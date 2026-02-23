package com.example.backend

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.util.SyncTask
import com.morpheusdata.core.data.DataQuery
import com.morpheusdata.model.Cloud
import com.morpheusdata.model.NetworkLoadBalancer
import com.morpheusdata.model.projection.NetworkLoadBalancerIdentityProjection
import io.reactivex.rxjava3.core.Observable
import groovy.util.logging.Slf4j

/**
 * Handles synchronization of Octavia Load Balancers to Morpheus Database.
 */
@Slf4j
class OctaviaLoadBalancerSync {

    private final MorpheusContext morpheus
    private final Cloud cloud
    private final String tenantName

    OctaviaLoadBalancerSync(MorpheusContext morpheus, Cloud cloud, String tenantName) {
        this.morpheus = morpheus
        this.cloud = cloud
        this.tenantName = tenantName
    }

    /**
     * Syncs a list of API Load Balancers to the Morpheus NetworkLoadBalancer table.
     * @param apiItems List of Maps from OctaviaClient.listLoadBalancers
     */
    void execute(List<Map> apiItems) {
        if (!cloud || !apiItems) return

        try {
            // 1. Fetch existing Morpheus records (Projections)
            // Filter by Cloud ID and Tenant (Project) ID via internalId
            def query = new DataQuery()
                .withFilter('cloud.id', cloud.id)
                .withFilter('internalId', tenantName)
                
            def domainRecords = morpheus.async.loadBalancer.listIdentityProjections(query)

            // 2. Fetch Generic LB Type (BEFORE creating SyncTask)
            def genericLbType = fetchGenericLoadBalancerType()
            if (!genericLbType) {
                log.error("Could not find generic load balancer type. Sync aborted.")
                return
            }

            // 3. Initialize SyncTask
            // Match Function: Existing.externalId == API.id
            SyncTask<NetworkLoadBalancerIdentityProjection, Map, NetworkLoadBalancer> syncTask = new SyncTask<>(domainRecords, apiItems)
            
            syncTask.addMatchFunction { NetworkLoadBalancerIdentityProjection existing, Map apiItem ->
                existing.externalId == apiItem.id
            }

            // 4. Handle Creations (onAdd)
            syncTask.onAdd { List<Map> itemsToAdd ->
                List<NetworkLoadBalancer> newItems = []
                itemsToAdd.each { Map apiItem ->
                    NetworkLoadBalancer lb = new NetworkLoadBalancer()
                    lb.owner = cloud.owner
                    lb.cloud = cloud
                    lb.name = apiItem.name
                    lb.externalId = apiItem.id
                    lb.description = apiItem.description
                    lb.internalIp = apiItem.vip_address
                    lb.status = mapStatus(apiItem.provisioning_status)
                    lb.internalId = tenantName // Store OpenStack project ID explicitly so we can filter by it
                    lb.type = genericLbType
                    newItems << lb
                }
                if (newItems) {
                    morpheus.async.loadBalancer.create(newItems).blockingGet()
                }
            }

            // 5. Handle Updates (onUpdate)
            syncTask.onUpdate { List<SyncTask.UpdateItem<NetworkLoadBalancer, Map>> itemsToUpdate ->
                List<NetworkLoadBalancer> updateList = []
                itemsToUpdate.each { item ->
                    NetworkLoadBalancer existing = item.existingItem
                    Map api = item.masterItem
                    boolean changed = false

                    if (existing.name != api.name) {
                        existing.name = api.name
                        changed = true
                    }
                    if (existing.internalIp != api.vip_address) {
                        existing.internalIp = api.vip_address
                        changed = true
                    }
                    String newStatus = mapStatus(api.provisioning_status)
                    if (existing.status != newStatus) {
                        existing.status = newStatus
                        changed = true
                    }

                    if (changed) {
                        updateList << existing
                    }
                }
                if (updateList) {
                    morpheus.async.loadBalancer.save(updateList).blockingGet()
                }
            }

            // 6. Handle Deletions (onDelete)
            // ONLY delete if we are sure the list is complete (which it is for a Project)
            syncTask.onDelete { List<NetworkLoadBalancer> itemsToRemove ->
                if (itemsToRemove) {
                    morpheus.async.loadBalancer.remove(itemsToRemove).blockingGet()
                }
            }

            // 7. Load Objects for Update
            syncTask.withLoadObjectDetailsFromFinder { List<SyncTask.UpdateItemDto<NetworkLoadBalancerIdentityProjection, Map>> updateItems ->
                List<Long> ids = updateItems.collect { it.existingItem.id }
                return morpheus.async.loadBalancer.listById(ids)
            }

            // 8. Execute
            def observable = syncTask.start()
            if (observable) {
                observable.blockingSubscribe()
            }

        } catch (Exception e) {
            log.error("Error syncing load balancers: ${e.message}", e)
        }
    }

    /**
    * Fetches the appropriate load balancer type for Octavia.
    * Properly handles the Observable returned by the async service.
    */
    private fetchGenericLoadBalancerType() {
        try {
            log.info("Fetching all load balancer types...")
            
            // The async service returns an Observable - must use toList().blockingGet()
            def allTypes = morpheus.async.loadBalancer.type.list().toList().blockingGet() ?: []
            log.info("Found {} load balancer types total", allTypes.size())
            
            if (allTypes && !allTypes.isEmpty()) {
                allTypes.each { type ->
                    log.info("Available LB Type: id={}, code={}, name={}", type.id, type.code, type.name)
                }
                
                // Look for Octavia type (most appropriate for OpenStack Octavia LBs)
                def octaviaType = allTypes.find { it.code == 'octavia' }
                if (octaviaType) {
                    log.info("Found Octavia load balancer type: id={}, code={}, name={}", octaviaType.id, octaviaType.code, octaviaType.name)
                    return octaviaType
                }
                
                // Fallback to internal if Octavia not found
                def internalType = allTypes.find { it.code == 'internal' }
                if (internalType) {
                    log.info("Octavia type not found, using Internal type instead: id={}, code={}", internalType.id, internalType.code)
                    return internalType
                }
                
                // Final fallback: use first available
                def firstType = allTypes.first()
                log.warn("Using first available LB Type as fallback: id={}, code={}, name={}", firstType.id, firstType.code, firstType.name)
                return firstType
            }
            
            log.error("No load balancer types found in system at all")
            return null
            
        } catch (Exception e) {
            log.error("Error fetching load balancer type: {}", e.message, e)
            return null
        }
    }

    private String mapStatus(String octaviaStatus) {
        switch (octaviaStatus) {
            case 'ACTIVE': return 'ok'
            case 'ERROR': return 'error'
            case 'PENDING_CREATE': return 'provisioning'
            case 'PENDING_UPDATE': return 'syncing'
            case 'DELETED': return 'offline'
            default: return 'unknown'
        }
    }
}