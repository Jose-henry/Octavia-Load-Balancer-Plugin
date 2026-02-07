package com.example.backend

import groovy.transform.Immutable
import groovy.transform.ToString

/**
 * Lightweight in-memory persistence used for mock/demo mode.
 * Replaces the prior ReferenceData-based storage so that the UI
 * can be exercised without a database or Octavia backend.
 */
class PersistenceService {

    private static final Map<String, LbRecord> STORE = Collections.synchronizedMap([:])

    List<LbRecord> listByNetwork(Long networkId) {
        STORE.values().findAll { it.networkId == networkId }
    }

    List<LbRecord> listByInstance(Long instanceId) {
        STORE.values().findAll { it.members?.contains(instanceId?.toString()) }
    }

    LbRecord upsert(LbRecord record) {
        STORE[record.id] = record
        record
    }

    void deleteById(String id) {
        STORE.remove(id)
    }

    Optional<LbRecord> find(String id) {
        Optional.ofNullable(STORE[id])
    }

    static PersistenceService getInstance() {
        return Holder.INSTANCE
    }

    private static class Holder {
        private static final PersistenceService INSTANCE = new PersistenceService()
    }

    @Immutable
    @ToString(includeNames = true)
    static class LbRecord {
        String id
        String name
        Long networkId
        String projectName
        String vipSubnetId
        String vipPortId
        List<String> members = []
        Map floatingIp // {id, ipAddress}
    }
}
