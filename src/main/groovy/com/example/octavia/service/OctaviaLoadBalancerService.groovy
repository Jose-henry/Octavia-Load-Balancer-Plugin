package com.example.octavia.service

import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.model.Cloud
import com.morpheusdata.model.NetworkLoadBalancer
import com.morpheusdata.response.ServiceResponse
import com.example.octavia.client.OctaviaApiClient
import com.example.octavia.client.OpenStackAuthClient
import com.example.octavia.util.OctaviaUtility
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaLoadBalancerService {

    MorpheusContext morpheusContext
    
    OctaviaLoadBalancerService(MorpheusContext morpheusContext) {
        this.morpheusContext = morpheusContext
    }

    /**
     * List all Octavia Load Balancers for a given cloud and project.
     */
    ServiceResponse<List<Map>> list(Cloud cloud, String projectId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            ServiceResponse response = client.get("/v2.0/lbaas/loadbalancers")
            
            if (response.success) {
                // Octavia returns { "loadbalancers": [ ... ] }
                List lbs = response.data?.loadbalancers ?: []
                return ServiceResponse.success(lbs)
            } else {
                return ServiceResponse.error("List Load Balancers failed: ${response.msg ?: response.error}")
            }
        } catch (Exception e) {
            log.error("Error listing load balancers: ${e.message}", e)
            return ServiceResponse.error("Error listing load balancers: ${e.message}")
        }
    }

    /**
     * Create a new Load Balancer using Octavia's single-call fully populated creation.
     * Per the Octavia API v2, you can nest listeners, pools, members, and health monitors
     * in a single POST to /v2.0/lbaas/loadbalancers.
     * See: https://docs.openstack.org/api-ref/load-balancer/v2/index.html#create-a-load-balancer
     */
    ServiceResponse create(Cloud cloud, String projectId, Map config) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)

            // Build the base LB payload
            Map lbPayload = [
                name: config.name,
                description: config.description ?: '',
                vip_subnet_id: config.subnetId ?: config.vipSubnetId ?: config.vip_subnet_id,
                project_id: projectId,
                admin_state_up: true
            ]

            // Optional: specific VIP address
            if (config.vipAddress) {
                lbPayload.vip_address = config.vipAddress
            }

            // Nest listener if requested
            if (config.createListener) {
                Map listener = [
                    name: config.listenerName ?: "${config.name}-listener",
                    protocol: config.listenerProtocol ?: 'HTTP',
                    protocol_port: config.listenerPort ?: 80,
                    admin_state_up: true
                ]

                if (config.connectionLimit && config.connectionLimit != -1) {
                    listener.connection_limit = config.connectionLimit
                }
                if (config.allowedCidrs) {
                    listener.allowed_cidrs = config.allowedCidrs.toString().split(',').collect { it.trim() }.findAll { it }
                }

                // Insert headers (for HTTP/TERMINATED_HTTPS)
                Map insertHeaders = [:]
                if (config.insertXForwardedFor) insertHeaders['X-Forwarded-For'] = 'true'
                if (config.insertXForwardedPort) insertHeaders['X-Forwarded-Port'] = 'true'
                if (config.insertXForwardedProto) insertHeaders['X-Forwarded-Proto'] = 'true'
                if (insertHeaders) listener.insert_headers = insertHeaders

                // Nest pool inside listener
                if (config.createPool) {
                    Map pool = [
                        name: config.poolName ?: "${config.name}-pool",
                        protocol: config.poolProtocol ?: config.listenerProtocol ?: 'HTTP',
                        lb_algorithm: config.poolAlgorithm ?: 'ROUND_ROBIN',
                        admin_state_up: true
                    ]
                    if (config.poolDesc) pool.description = config.poolDesc

                    // Session persistence
                    if (config.sessionPersistence && config.sessionPersistence != 'None') {
                        Map sp = [type: config.sessionPersistence]
                        if (config.sessionPersistence == 'APP_COOKIE' && config.cookieName) {
                            sp.cookie_name = config.cookieName
                        }
                        pool.session_persistence = sp
                    }

                    // TLS backend re-encryption
                    if (config.poolTlsEnabled) {
                        pool.tls_enabled = true
                        if (config.poolTlsCipher) pool.tls_ciphers = config.poolTlsCipher
                    }

                    // Nest members inside pool
                    if (config.members) {
                        pool.members = config.members.collect { m ->
                            Map member = [
                                address: m.address,
                                protocol_port: m.port ?: 80,
                                weight: m.weight ?: 1
                            ]
                            if (m.subnetId) member.subnet_id = m.subnetId
                            if (m.name) member.name = m.name
                            return member
                        }
                    }

                    // Nest health monitor inside pool
                    if (config.createMonitor) {
                        Map hm = [
                            type: config.monitorType ?: 'HTTP',
                            delay: config.delay ?: 5,
                            timeout: config.timeout ?: 5,
                            max_retries: config.maxRetries ?: 3,
                            admin_state_up: true
                        ]
                        if (config.monitorName) hm.name = config.monitorName
                        if (config.maxRetriesDown) hm.max_retries_down = config.maxRetriesDown
                        if (config.monitorType in ['HTTP', 'HTTPS']) {
                            hm.http_method = config.httpMethod ?: 'GET'
                            hm.url_path = config.urlPath ?: '/'
                            hm.expected_codes = config.expectedCodes ?: '200'
                        }
                        pool.healthmonitor = hm
                    }

                    listener.default_pool = pool
                }

                lbPayload.listeners = [listener]
            }

            ServiceResponse response = client.post("/v2.0/lbaas/loadbalancers", [loadbalancer: lbPayload])

            if (response.success) {
                return ServiceResponse.success(response.data?.loadbalancer)
            } else {
                String eMsg = extractOctaviaError(response, "Create Load Balancer failed")
                log.error(eMsg)
                return ServiceResponse.error(eMsg)
            }
        } catch (Exception e) {
            log.error("Error creating load balancer: ${e.message}", e)
            return ServiceResponse.error("Error creating load balancer: ${e.message}")
        }
    }
    
    /**
     * Poll until load balancer provisioning_status is ACTIVE or timeout.
     * We poll continuously; as soon as ACTIVE we return and the next update proceeds (no extra delay).
     */
    private boolean waitForLbActive(Cloud cloud, String projectId, String lbId, int maxWaitMs = 45000, int pollIntervalMs = 1000) {
        long deadline = System.currentTimeMillis() + maxWaitMs
        while (System.currentTimeMillis() < deadline) {
            ServiceResponse resp = get(cloud, projectId, lbId)
            if (resp.success && resp.data?.provisioning_status == "ACTIVE") {
                log.info("[Octavia LB Update] LB {} is ACTIVE, continuing immediately", lbId)
                return true
            }
            String status = resp.success ? (resp.data?.provisioning_status ?: "?") : "error"
            log.info("[Octavia LB Update] Polling LB {} (current: {}), next check in {}ms", lbId, status, pollIntervalMs)
            try { Thread.sleep(pollIntervalMs) } catch (InterruptedException e) { Thread.currentThread().interrupt(); return false }
        }
        log.warn("[Octavia LB Update] Timeout waiting for LB {} to be ACTIVE after {}ms", lbId, maxWaitMs)
        return false
    }

    /**
     * Get a Load Balancer by ID.
     */
    ServiceResponse get(Cloud cloud, String projectId, String lbId) {
        try {
            OctaviaApiClient client = getClient(cloud, projectId)
            ServiceResponse response = client.get("/v2.0/lbaas/loadbalancers/${lbId}")
            
            if (response.success) {
                return ServiceResponse.success(response.data?.loadbalancer)
            } else {
                String eMsg = extractOctaviaError(response, "Get Load Balancer failed")
                log.error(eMsg)
                return ServiceResponse.error(eMsg)
            }
        } catch (Exception e) {
            log.error("Error getting load balancer: ${e.message}", e)
            return ServiceResponse.error("Error getting load balancer: ${e.message}")
        }
    }
    
    /**
     * Update a Load Balancer (and optionally its first listener/pool).
     * This orchestrates updates across resources.
     */
    ServiceResponse update(Cloud cloud, String projectId, String lbId, Map payload) {
        try {
            List updatedSections = payload.updatedSections instanceof List ? payload.updatedSections : null
            boolean hasNestedFields = (payload.listenerName || payload.poolName || payload.poolDesc != null || payload.connectionLimit != null ||
                payload.listenerAdminStateUp != null || payload.allowedCidrs != null || payload.poolAdminStateUp != null ||
                payload.monitorAdminStateUp != null || payload.monitorName != null || payload.delay != null || payload.timeout != null || payload.maxRetries != null)
            log.info("[Octavia LB Update] START lbId={}, projectId={}, updatedSections={}, hasNestedFields={}, payloadKeys={}",
                lbId, projectId, updatedSections, hasNestedFields, payload.keySet()?.sort()?.join(', '))

            OctaviaApiClient client = getClient(cloud, projectId)
            boolean success = true
            List errors = []

            // Do nested updates FIRST so LB is still ACTIVE (PUT loadbalancer transitions it to PENDING_UPDATE and then listener/pool/monitor PUTs return 409).
            boolean nestedRequested = (updatedSections != null && (updatedSections.contains('listener') || updatedSections.contains('pool') || updatedSections.contains('monitor')))
            boolean doNested = hasNestedFields && (updatedSections == null || nestedRequested)
            log.info("[Octavia LB Update] doNested={}, nestedRequested={} (nested updates run first to avoid PENDING_UPDATE)", doNested, nestedRequested)

            if (doNested) {
                 // Fast path: single-section update with IDs from frontend — skip GET loadbalancer (saves one round trip)
                 String lisId = payload.listenerId?.toString()?.trim()
                 String poolId = payload.poolId?.toString()?.trim()
                 String hmId = payload.healthmonitorId?.toString()?.trim()
                 boolean singleListener = updatedSections != null && updatedSections.size() == 1 && updatedSections.contains('listener') && lisId && (payload.listenerName || payload.connectionLimit != null || payload.listenerAdminStateUp != null || payload.allowedCidrs != null)
                 boolean singleMonitor = updatedSections != null && updatedSections.size() == 1 && updatedSections.contains('monitor') && hmId && (payload.monitorAdminStateUp != null || payload.monitorName != null || payload.delay != null || payload.timeout != null || payload.maxRetries != null)
                 boolean singlePool = updatedSections != null && updatedSections.size() == 1 && updatedSections.contains('pool') && poolId && (payload.poolName || payload.poolDesc != null || payload.poolAdminStateUp != null || (payload.members instanceof List))

                 if (singleListener) {
                     Map lisUpdates = [:]
                     if (payload.listenerName) lisUpdates.name = payload.listenerName
                     if (payload.connectionLimit != null) lisUpdates.connection_limit = payload.connectionLimit
                     if (payload.listenerAdminStateUp != null) lisUpdates.admin_state_up = payload.listenerAdminStateUp
                     if (payload.allowedCidrs != null && payload.allowedCidrs.toString().trim()) {
                         lisUpdates.allowed_cidrs = payload.allowedCidrs.toString().split(',').collect { it.trim() }.findAll { it }
                     }
                     Map lisBody = lisUpdates.findAll { k, v -> v != null }
                     if (lisBody) {
                         log.info("[Octavia LB Update] Fast path: PUT listener {} only (no GET)", lisId)
                         ServiceResponse lResp = client.put("/v2.0/lbaas/listeners/${lisId}", [listener: lisBody])
                         String lErr = lResp.success ? null : extractOctaviaError(lResp, "Listener Update")
                         if (!lResp.success && lErr) { success = false; errors << lErr }
                     }
                 } else if (singleMonitor) {
                     Map hmUpdates = [:]
                     if (payload.monitorAdminStateUp != null) hmUpdates.admin_state_up = payload.monitorAdminStateUp
                     if (payload.monitorName != null) hmUpdates.name = payload.monitorName
                     if (payload.delay != null) hmUpdates.delay = payload.delay
                     if (payload.timeout != null) hmUpdates.timeout = payload.timeout
                     if (payload.maxRetries != null) hmUpdates.max_retries = payload.maxRetries
                     Map hmBody = hmUpdates.findAll { k, v -> v != null }
                     if (hmBody) {
                         log.info("[Octavia LB Update] Fast path: PUT healthmonitor {} only (no GET)", hmId)
                         ServiceResponse hmResp = client.put("/v2.0/lbaas/healthmonitors/${hmId}", [healthmonitor: hmBody])
                         String hmErr = hmResp.success ? null : extractOctaviaError(hmResp, "Health Monitor Update")
                         if (!hmResp.success && hmErr) { success = false; errors << hmErr }
                     }
                 } else if (singlePool) {
                     // Pool-only: GET members (one light call), then PUT pool and member sync — no GET loadbalancer
                     ServiceResponse listMemResp = client.get("/v2.0/lbaas/pools/${poolId}/members")
                     List currentMembers = listMemResp.success && listMemResp.data?.members ? listMemResp.data.members : []
                     Map poolUpdates = [:]
                     if (payload.poolName) poolUpdates.name = payload.poolName
                     if (payload.poolDesc != null) poolUpdates.description = payload.poolDesc
                     if (payload.poolAdminStateUp != null) poolUpdates.admin_state_up = payload.poolAdminStateUp
                     if (poolUpdates) {
                         Map poolBody = poolUpdates.findAll { k, v -> v != null }
                         log.info("[Octavia LB Update] Fast path: PUT pool {} (no GET loadbalancer)", poolId)
                         ServiceResponse pResp = client.put("/v2.0/lbaas/pools/${poolId}", [pool: poolBody])
                         if (!pResp.success) { success = false; errors << (extractOctaviaError(pResp, "Pool Update") ?: "Pool update failed") }
                     }
                     List payloadMembers = payload.members instanceof List ? payload.members : null
                     if (success && payloadMembers != null) {
                         List toRemove = currentMembers.findAll { c ->
                             def cid = (c?.id ?: '').toString().trim()
                             def pm = payloadMembers.find { (it?.id ?: '').toString().trim() == cid }
                             if (!pm) return true
                             def addrEq = (pm?.address ?: pm?.value ?: '').toString().trim() == (c?.address ?: '').toString().trim()
                             def portEq = (pm?.protocol_port != null ? pm.protocol_port : (pm?.port != null ? pm.port : 80)) == (c?.protocol_port != null ? c.protocol_port : 80)
                             !addrEq || !portEq
                         }
                         List toAdd = payloadMembers.findAll { m ->
                             def mid = (m?.id ?: '').toString().trim()
                             if (!mid) return true
                             def cur = currentMembers.find { (it?.id ?: '').toString().trim() == mid }
                             if (!cur) return false
                             def addrEq = (m?.address ?: m?.value ?: '').toString().trim() == (cur?.address ?: '').toString().trim()
                             def portEq = (m?.protocol_port != null ? m.protocol_port : (m?.port != null ? m.port : 80)) == (cur?.protocol_port != null ? cur.protocol_port : 80)
                             !addrEq || !portEq
                         }
                         toRemove.each { m ->
                             String mid = (m?.id ?: '').toString()
                             if (!mid) return
                             ServiceResponse dr = client.delete("/v2.0/lbaas/pools/${poolId}/members/${mid}")
                             if (!dr.success) {
                                 success = false
                                 errors << (extractOctaviaError(dr, "Remove member ${mid}") ?: "Remove member failed")
                             }
                         }
                         toAdd.each { m ->
                             def addr = (m?.address ?: m?.value ?: '').toString().trim()
                             def port = m?.protocol_port != null ? m.protocol_port : (m?.port != null ? m.port : 80)
                             if (addr) {
                                 Map memberBody = [member: [address: addr, protocol_port: port as Integer, weight: (m?.weight != null ? m.weight : 1), admin_state_up: m?.admin_state_up != false]]
                                 if (m?.name) memberBody.member.name = m.name.toString()
                                 if (m?.subnet_id) memberBody.member.subnet_id = m.subnet_id.toString()
                                 ServiceResponse ar = client.post("/v2.0/lbaas/pools/${poolId}/members", memberBody)
                                 if (!ar.success) { success = false; errors << (extractOctaviaError(ar, "Add member ${addr}:${port}") ?: "Add member failed") }
                             }
                         }
                     }
                 } else {
                 // Full path: use IDs from payload when present (skip GET), else GET loadbalancer to resolve IDs
                 boolean doListener = (updatedSections == null || updatedSections.contains('listener')) && (payload.listenerName || payload.connectionLimit != null || payload.listenerAdminStateUp != null || payload.allowedCidrs != null)
                 boolean doPoolOrMonitorSection = (updatedSections == null || updatedSections.contains('pool') || updatedSections.contains('monitor')) && (payload.poolName || payload.poolDesc != null || payload.poolAdminStateUp != null || payload.monitorAdminStateUp != null || payload.monitorName != null || payload.delay != null || payload.timeout != null || payload.maxRetries != null)
                 boolean doMonitor = (updatedSections == null || updatedSections.contains('monitor')) && (payload.monitorAdminStateUp != null || payload.monitorName != null || payload.delay != null || payload.timeout != null || payload.maxRetries != null)
                 boolean needPoolId = doPoolOrMonitorSection || (updatedSections != null && updatedSections.contains('pool') && payload.members instanceof List)
                 boolean canSkipGet = (!doListener || lisId) && (!needPoolId || poolId) && (!doMonitor || hmId)

                 String resolvedLisId = lisId
                 String resolvedPoolId = poolId
                 String resolvedHmId = hmId
                 if (!canSkipGet) {
                     log.info("[Octavia LB Update] Step 2a: GET loadbalancer {} (IDs not all in payload)", lbId)
                     ServiceResponse getResp = get(cloud, projectId, lbId)
                     if (!getResp.success) {
                         log.warn("[Octavia LB Update] Step 2a: GET loadbalancer failed: {}", getResp.error ?: getResp.msg)
                         success = false
                         errors << (getResp.error ?: getResp.msg)
                     } else {
                         def lb = getResp.data
                         log.info("[Octavia LB Update] Step 2a result: success=true, provisioning_status={}", lb?.provisioning_status)
                         if (!lb.listeners || lb.listeners.isEmpty()) {
                             def listResp = client.get("/v2.0/lbaas/listeners?loadbalancer_id=${lbId}")
                             if (listResp.success && listResp.data?.listeners != null) lb.listeners = listResp.data.listeners
                         }
                         if (!lb.pools || lb.pools.isEmpty()) {
                             def poolListResp = client.get("/v2.0/lbaas/pools?loadbalancer_id=${lbId}")
                             if (poolListResp.success && poolListResp.data?.pools != null) lb.pools = poolListResp.data.pools
                         }
                         if (lb.pools && payload.monitorAdminStateUp != null && !lb.pools[0]?.healthmonitor_id) {
                             def poolDetailResp = client.get("/v2.0/lbaas/pools/${lb.pools[0].id}")
                             if (poolDetailResp.success && poolDetailResp.data?.pool?.healthmonitor_id)
                                 lb.pools[0].healthmonitor_id = poolDetailResp.data.pool.healthmonitor_id
                         }
                         if (doListener && lb?.listeners && !lb.listeners.isEmpty()) resolvedLisId = lb.listeners[0].id
                         if (needPoolId && lb?.pools && !lb.pools.isEmpty()) {
                             resolvedPoolId = lb.pools[0].id
                             if (doMonitor) resolvedHmId = lb.pools[0].healthmonitor_id ?: resolvedHmId
                         }
                     }
                 } else {
                     log.info("[Octavia LB Update] Using listener/pool/monitor IDs from payload (no GET loadbalancer)")
                 }

                 if (success) {
                      // Update Listener
                      if (doListener && resolvedLisId) {
                          Map lisUpdates = [:]
                          if (payload.listenerName) lisUpdates.name = payload.listenerName
                          if (payload.connectionLimit != null) lisUpdates.connection_limit = payload.connectionLimit
                          if (payload.listenerAdminStateUp != null) lisUpdates.admin_state_up = payload.listenerAdminStateUp
                          if (payload.allowedCidrs != null && payload.allowedCidrs.toString().trim()) {
                              lisUpdates.allowed_cidrs = payload.allowedCidrs.toString().split(',').collect { it.trim() }.findAll { it }
                          }
                          Map lisBody = lisUpdates.findAll { k, v -> v != null }
                          if (lisBody) {
                              log.info("[Octavia LB Update] Step 3: PUT listener {} with keys: {} (nulls stripped)", resolvedLisId, lisBody.keySet())
                              ServiceResponse lResp = client.put("/v2.0/lbaas/listeners/${resolvedLisId}", [listener: lisBody])
                              String lErr = lResp.success ? null : extractOctaviaError(lResp, "Listener Update")
                              log.info("[Octavia LB Update] Step 3 result: success={}, error={}", lResp.success, lErr)
                              if (!lResp.success) {
                                  success = false
                                  errors << lErr
                              } else {
                                  boolean willDoPoolOrMonitor = updatedSections != null && (updatedSections.contains('pool') || updatedSections.contains('monitor'))
                                  if (willDoPoolOrMonitor && !waitForLbActive(cloud, projectId, lbId)) {
                                      success = false
                                      errors << "Listener updated but load balancer did not return to ACTIVE in time; pool/monitor not updated. Try saving again."
                                  }
                              }
                          }
                      }

                      // Update Pool and/or Health Monitor
                      if (doPoolOrMonitorSection && resolvedPoolId) {
                          Map poolUpdates = [:]
                          if (payload.poolName) poolUpdates.name = payload.poolName
                          if (payload.poolDesc != null) poolUpdates.description = payload.poolDesc
                          if (payload.poolAdminStateUp != null) poolUpdates.admin_state_up = payload.poolAdminStateUp

                          if (poolUpdates) {
                              Map poolBody = poolUpdates.findAll { k, v -> v != null }
                              log.info("[Octavia LB Update] Step 4: PUT pool {} with keys: {} (nulls stripped)", resolvedPoolId, poolBody.keySet())
                              ServiceResponse pResp = client.put("/v2.0/lbaas/pools/${resolvedPoolId}", [pool: poolBody])
                              String pErr = pResp.success ? null : extractOctaviaError(pResp, "Pool Update")
                              log.info("[Octavia LB Update] Step 4 result: success={}, error={}", pResp.success, pErr)
                              if (!pResp.success) {
                                  success = false
                                  errors << pErr
                              } else {
                                  boolean willDoMonitor = updatedSections != null && updatedSections.contains('monitor') && resolvedHmId && (payload.monitorAdminStateUp != null || payload.monitorName != null || payload.delay != null || payload.timeout != null || payload.maxRetries != null)
                                  if (willDoMonitor && !waitForLbActive(cloud, projectId, lbId)) {
                                      success = false
                                      errors << "Pool updated but load balancer did not return to ACTIVE in time; health monitor not updated. Try saving again."
                                  }
                              }
                          }

                          // Update Health Monitor
                          if (doMonitor && resolvedHmId) {
                              Map hmUpdates = [:]
                              if (payload.monitorAdminStateUp != null) hmUpdates.admin_state_up = payload.monitorAdminStateUp
                              if (payload.monitorName != null) hmUpdates.name = payload.monitorName
                              if (payload.delay != null) hmUpdates.delay = payload.delay
                              if (payload.timeout != null) hmUpdates.timeout = payload.timeout
                              if (payload.maxRetries != null) hmUpdates.max_retries = payload.maxRetries
                              Map hmBody = hmUpdates.findAll { k, v -> v != null }
                              if (hmBody) {
                                  log.info("[Octavia LB Update] Step 5: PUT healthmonitor {} with keys: {} (nulls stripped)", resolvedHmId, hmBody.keySet())
                                  ServiceResponse hmResp = client.put("/v2.0/lbaas/healthmonitors/${resolvedHmId}", [healthmonitor: hmBody])
                                  String hmErr = hmResp.success ? null : extractOctaviaError(hmResp, "Health Monitor Update")
                                  log.info("[Octavia LB Update] Step 5 result: success={}, error={}", hmResp.success, hmErr)
                                  if (!hmResp.success) {
                                      success = false
                                      errors << hmErr
                                  }
                              }
                          }
                      }

                      // Step 6: Member add/remove/update — sync payload.members with Octavia (Octavia has no PATCH member; "update" = remove + add)
                      boolean memberSectionRequested = (updatedSections == null || (updatedSections instanceof List && updatedSections.contains('pool')))
                      List payloadMembers = payload.members instanceof List ? payload.members : null
                      if (success && memberSectionRequested && payloadMembers != null && resolvedPoolId) {
                          ServiceResponse listMemResp = client.get("/v2.0/lbaas/pools/${resolvedPoolId}/members")
                          List currentMembers = listMemResp.success && listMemResp.data?.members ? listMemResp.data.members : []
                          List toRemove = currentMembers.findAll { c ->
                              def cid = (c?.id ?: '').toString().trim()
                              def pm = payloadMembers.find { (it?.id ?: '').toString().trim() == cid }
                              if (!pm) return true
                              def addrEq = (pm?.address ?: pm?.value ?: '').toString().trim() == (c?.address ?: '').toString().trim()
                              def portEq = (pm?.protocol_port != null ? pm.protocol_port : (pm?.port != null ? pm.port : 80)) == (c?.protocol_port != null ? c.protocol_port : 80)
                              !addrEq || !portEq
                          }
                          List toAdd = payloadMembers.findAll { m ->
                              def mid = (m?.id ?: '').toString().trim()
                              if (!mid) return true
                              def cur = currentMembers.find { (it?.id ?: '').toString().trim() == mid }
                              if (!cur) return false
                              def addrEq = (m?.address ?: m?.value ?: '').toString().trim() == (cur?.address ?: '').toString().trim()
                              def portEq = (m?.protocol_port != null ? m.protocol_port : (m?.port != null ? m.port : 80)) == (cur?.protocol_port != null ? cur.protocol_port : 80)
                              !addrEq || !portEq
                          }
                          log.info("[Octavia LB Update] Step 6: members current={}, payload={}, toAdd={}, toRemove={}", currentMembers.size(), payloadMembers.size(), toAdd.size(), toRemove.size())
                          toRemove.each { m ->
                              String mid = (m?.id ?: '').toString()
                              if (!mid) return
                              ServiceResponse dr = client.delete("/v2.0/lbaas/pools/${resolvedPoolId}/members/${mid}")
                              if (!dr.success) {
                                  success = false
                                  errors << (extractOctaviaError(dr, "Remove member ${mid}") ?: "Remove member failed")
                              }
                          }
                          toAdd.each { m ->
                              def addr = (m?.address ?: m?.value ?: '').toString().trim()
                              def port = m?.protocol_port != null ? m.protocol_port : (m?.port != null ? m.port : 80)
                              if (!addr) return
                              Map memberBody = [member: [address: addr, protocol_port: port as Integer, weight: (m?.weight != null ? m.weight : 1), admin_state_up: m?.admin_state_up != false]]
                              if (m?.name) memberBody.member.name = m.name.toString()
                              if (m?.subnet_id) memberBody.member.subnet_id = m.subnet_id.toString()
                              ServiceResponse ar = client.post("/v2.0/lbaas/pools/${resolvedPoolId}/members", memberBody)
                              if (!ar.success) {
                                  success = false
                                  errors << (extractOctaviaError(ar, "Add member ${addr}:${port}") ?: "Add member failed")
                              }
                          }
                      }
                 }
            }
            }

            Map lbUpdates = [:]
            if (payload.name) lbUpdates.name = payload.name
            if (payload.description != null) lbUpdates.description = payload.description
            if (payload.admin_state_up != null) lbUpdates.admin_state_up = payload.admin_state_up
            boolean hasLbUpdates = lbUpdates && !lbUpdates.isEmpty()

            if (hasLbUpdates && success) {
                if (!doNested) {
                    // LB-only update: no nested changes, so LB is likely ACTIVE
                    Map lbBody = lbUpdates.findAll { k, v -> v != null }
                    log.info("[Octavia LB Update] Step LB: PUT loadbalancer {} only (no nested updates this request)", lbId)
                    ServiceResponse resp = client.put("/v2.0/lbaas/loadbalancers/${lbId}", [loadbalancer: lbBody])
                    String lbErr = resp.success ? null : extractOctaviaError(resp, "LB Update")
                    log.info("[Octavia LB Update] Step LB result: success={}, error={}", resp.success, lbErr)
                    if (!resp.success && lbErr != null) {
                        success = false
                        errors << lbErr
                    }
                } else {
                    // Nested updates were done; wait for ACTIVE then apply LB name/description so parent LB updates in same save
                    if (waitForLbActive(cloud, projectId, lbId)) {
                        Map lbBody = lbUpdates.findAll { k, v -> v != null }
                        log.info("[Octavia LB Update] Step LB: PUT loadbalancer {} (after nested updates)", lbId)
                        ServiceResponse resp = client.put("/v2.0/lbaas/loadbalancers/${lbId}", [loadbalancer: lbBody])
                        String lbErr = resp.success ? null : extractOctaviaError(resp, "LB Update")
                        log.info("[Octavia LB Update] Step LB result: success={}, error={}", resp.success, lbErr)
                        if (!resp.success && lbErr != null && !lbErr.toLowerCase().contains("pending_update") && !lbErr.toLowerCase().contains("immutable")) {
                            success = false
                            errors << lbErr
                        }
                    } else {
                        log.warn("[Octavia LB Update] Step LB: LB not ACTIVE in time; name/description not updated this save")
                    }
                }
            }

            if (success) {
                log.info("[Octavia LB Update] END lbId={} success=true", lbId)
                return ServiceResponse.success()
            } else {
                // Return the actual Octavia error(s) so we can see the real faultstring (e.g. null, immutable, etc.)
                String fullError = "Update failed: ${errors.join(' | ')}"
                log.error("[Octavia LB Update] END lbId={} success=false, errors={}", lbId, errors)
                return ServiceResponse.error(fullError)
            }

        } catch (Exception e) {
            log.error("Error updating load balancer: ${e.message}", e)
            return ServiceResponse.error("Error updating load balancer: ${e.message}")
        }
    }
    
    /**
     * Delete a Load Balancer (Cascade).
     */
    ServiceResponse delete(Cloud cloud, String projectId, String lbId) {
        try {
             OctaviaApiClient client = getClient(cloud, projectId)
             ServiceResponse response = client.delete("/v2.0/lbaas/loadbalancers/${lbId}?cascade=true")
             
             if (response.success) {
                 return ServiceResponse.success()
             } else {
                 String eMsg = extractOctaviaError(response, "Delete Load Balancer failed")
                 log.error(eMsg)
                 return ServiceResponse.error(eMsg)
             }
        } catch (Exception e) {
             log.error("Error deleting load balancer: ${e.message}", e)
             return ServiceResponse.error("Error deleting load balancer: ${e.message}")
        }
    }

    // ── Helper ──────────────────────────────────────────────────
    
    /**
     * Extracts clear error messages from Octavia/Neutron JSON error formats.
     */
    private String extractOctaviaError(ServiceResponse response, String defaultPrefix) {
        String baseMsg = response.msg ?: response.error ?: response.content ?: "Unknown API Error"
        try {
            Map json = null
            if (response.content) {
                def parsed = new groovy.json.JsonSlurper().parseText(response.content)
                if (parsed instanceof Map) json = parsed
            }
            if (json == null && response.data instanceof Map) {
                json = response.data as Map
            }
            if (json) {
                if (json.faultstring) return "${defaultPrefix}: ${json.faultstring}"
                if (json.NeutronError?.message) return "${defaultPrefix}: ${json.NeutronError.message}"
                if (json.message) return "${defaultPrefix}: ${json.message}"
                if (json.error) return "${defaultPrefix}: ${json.error}"
            }
        } catch (Exception ignore) {
            // Not JSON
        }
        
        if (baseMsg.contains("<html")) {
            return "${defaultPrefix}: ${response.error ?: 'HTTP Error'}"
        }
        
        return "${defaultPrefix}: ${baseMsg}"
    }

    /**
     * Helper to instantiate an authenticated client
     */
    private OctaviaApiClient getClient(Cloud cloud, String projectId) {
        OctaviaAuthService auth = new OctaviaAuthService(morpheusContext)
        Map session = auth.getAuthToken(cloud, projectId)
        
        if (!session.success) {
            throw new RuntimeException("Octavia auth failed: ${session.error}")
        }
        
        String endpoint = session.loadBalancerApi
        if (!endpoint) {
             throw new RuntimeException("No Octavia load balancer endpoint found for cloud ${cloud.id}")
        }
        
        return new OctaviaApiClient(new HttpApiClient(), endpoint, session.token as String)
    }
}
