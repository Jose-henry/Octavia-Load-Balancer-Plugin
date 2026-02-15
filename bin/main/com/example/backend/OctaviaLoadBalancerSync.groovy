package com.example.backend

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.util.SyncTask
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

    OctaviaLoadBalancerSync(MorpheusContext morpheus, Cloud cloud) {
        this.morpheus = morpheus
        this.cloud = cloud
    }

    /**
     * Syncs a list of API Load Balancers to the Morpheus NetworkLoadBalancer table.
     * @param apiItems List of Maps from OctaviaClient.listLoadBalancers
     */
    void execute(List<Map> apiItems) {
        if (!cloud || !apiItems) return

        try {
            // 1. Fetch existing Morpheus records (Projections)
            // Filter by Cloud ID using listIdentityProjections
            def domainRecords = morpheus.async.loadBalancer.listIdentityProjections(cloud.id)

            // 2. Initialize SyncTask
            // Match Function: Existing.externalId == API.id
            SyncTask<NetworkLoadBalancerIdentityProjection, Map, NetworkLoadBalancer> syncTask = new SyncTask<>(domainRecords, apiItems)
            
            syncTask.addMatchFunction { NetworkLoadBalancerIdentityProjection existing, Map apiItem ->
                existing.externalId == apiItem.id
            }

            // 3. Handle Creations (onAdd)
            syncTask.onAdd { List<Map> itemsToAdd ->
                List<NetworkLoadBalancer> newItems = []
                itemsToAdd.each { Map apiItem ->
                    NetworkLoadBalancer lb = new NetworkLoadBalancer()
                    lb.owner = cloud.owner
                    lb.cloud = cloud
                    lb.name = apiItem.name
                    lb.externalId = apiItem.id
                    lb.description = apiItem.description
                    lb.ipAddress = apiItem.vip_address
                    lb.providerId = apiItem.provider // 'octavia'
                    lb.status = mapStatus(apiItem.provisioning_status)
                    // Set type code if we had a dedicated type, otherwise generic
                    // lb.type = ... 
                    newItems << lb
                }
                if (newItems) {
                    morpheus.async.loadBalancer.create(newItems).blockingGet()
                }
            }

            // 4. Handle Updates (onUpdate)
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
                    if (existing.ipAddress != api.vip_address) {
                        existing.ipAddress = api.vip_address
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

            // 5. Handle Deletions (onDelete)
            // ONLY delete if we are sure the list is complete (which it is for a Project)
            syncTask.onDelete { List<NetworkLoadBalancer> itemsToRemove ->
                if (itemsToRemove) {
                    morpheus.async.loadBalancer.remove(itemsToRemove).blockingGet()
                }
            }

            // 6. Load Objects for Update
            syncTask.withLoadObjectDetailsFromFinder { List<SyncTask.UpdateItemDto<NetworkLoadBalancerIdentityProjection, Map>> updateItems ->
                List<Long> ids = updateItems.collect { it.existingItem.id }
                return morpheus.async.loadBalancer.listById(ids)
            }

            // 7. Execute
            syncTask.start().blockingSubscribe()

        } catch (Exception e) {
            log.error("Error syncing load balancers: ${e.message}", e)
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
