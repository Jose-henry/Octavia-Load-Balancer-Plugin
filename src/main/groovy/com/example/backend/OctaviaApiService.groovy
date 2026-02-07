package com.example.backend

import com.morpheusdata.core.MorpheusContext
import groovy.transform.Immutable
import groovy.util.logging.Slf4j

import java.util.concurrent.ThreadLocalRandom

/**
 * Very small Octavia client facade.
 * In mock mode (default) it only mutates the in-memory PersistenceService.
 * Real HTTP integration can be added later using Morpheus HttpApiClient.
 */
@Slf4j
class OctaviaApiService {
    private final MorpheusContext morpheus
    private final PersistenceService store = PersistenceService.instance
    private final boolean mockMode

    OctaviaApiService(MorpheusContext morpheus, boolean mockMode) {
        this.morpheus = morpheus
        this.mockMode = mockMode
    }

    ApiResult createLoadBalancer(Map ctx, Map payload) {
        if (mockMode) {
            def id = UUID.randomUUID().toString()
            def record = new PersistenceService.LbRecord(
                id,
                payload.name ?: "lb-${id.take(8)}",
                ctx.network?.id ?: payload.networkId as Long,
                ctx.project?.name ?: 'Default Project',
                payload.vipSubnetId as String,
                "vip-${ThreadLocalRandom.current().nextInt(1000, 9999)}",
                (payload.members ?: []).collect { it.toString() },
                null
            )
            store.upsert(record)
            return ApiResult.ok([id: id, status: 'provisioning', simulated: true])
        }
        return ApiResult.simulate("Octavia API integration pending")
    }

    ApiResult deleteLoadBalancer(Map ctx, String lbId) {
        if (mockMode) {
            store.deleteById(lbId)
            return ApiResult.ok([deleted: lbId, simulated: true])
        }
        return ApiResult.simulate("Octavia API integration pending")
    }

    ApiResult attachFloatingIp(Map ctx, String lbId, Long poolId) {
        if (mockMode) {
            def rec = store.find(lbId).orElse(null)
            if (!rec) return ApiResult.fail("LB not found")
            def updated = new PersistenceService.LbRecord(
                rec.id, rec.name, rec.networkId, rec.projectName, rec.vipSubnetId, rec.vipPortId,
                rec.members, [id: poolId?.toString(), ipAddress: "203.0.113.${ThreadLocalRandom.current().nextInt(10, 250)}"]
            )
            store.upsert(updated)
            return ApiResult.ok([floatingIp: updated.floatingIp, simulated: true])
        }
        return ApiResult.simulate("Octavia API integration pending")
    }

    ApiResult detachFloatingIp(Map ctx, String lbId) {
        if (mockMode) {
            def rec = store.find(lbId).orElse(null)
            if (!rec) return ApiResult.fail("LB not found")
            def updated = new PersistenceService.LbRecord(
                rec.id, rec.name, rec.networkId, rec.projectName, rec.vipSubnetId, rec.vipPortId,
                rec.members, null
            )
            store.upsert(updated)
            return ApiResult.ok([floatingIp: null, simulated: true])
        }
        return ApiResult.simulate("Octavia API integration pending")
    }

    @Immutable
    static class ApiResult {
        boolean success
        String message
        Map data

        static ApiResult ok(Map data = [:]) {
            new ApiResult(true, null, data)
        }

        static ApiResult fail(String msg) {
            new ApiResult(false, msg, [:])
        }

        static ApiResult simulate(String msg) {
            new ApiResult(true, msg, [simulated: true])
        }

        Map toMap() {
            def out = [success: success]
            if (message) out.message = message
            if (data) out.putAll(data)
            return out
        }
    }
}
