package com.example

import com.example.backend.OctaviaController
import com.example.providers.OctaviaInstanceTabProvider
import com.example.providers.OctaviaNetworkTabProvider
import com.example.providers.OctaviaOptionSourceProvider
import com.morpheusdata.core.Plugin
import com.morpheusdata.model.Permission
import com.morpheusdata.views.HandlebarsRenderer
import groovy.util.logging.Slf4j

/**
 * Entry point for the Octavia Load Balancer UI plugin.
 * Registers:
 *  - Network & Instance tab providers to render the React UI
 *  - Option source provider for dropdowns
 *  - Controller for AJAX endpoints hit by the UI
 */
@Slf4j
class CustomOctaviaLoadBalancerUiPlugin extends Plugin {

    @Override
    String getCode() {
        return 'octavia1234'
    }

    @Override
    void initialize() {
        // "renderer" = base directory in resources; classLoader lets the template loader find resources in our JAR
        this.renderer = new HandlebarsRenderer("renderer", this.getClass().getClassLoader())
        this.renderer.registerAssetHelper(this.code)
        this.renderer.registerNonceHelper(this.morpheus.getWebRequest())
        this.renderer.registerI18nHelper(this, this.morpheus)

        log.info("Initializing Custom Octavia Load Balancer UI plugin (Backend: Octavia v2)")

        // Register UI tabs
        def networkTab = new OctaviaNetworkTabProvider(this, morpheus)
        def instanceTab = new OctaviaInstanceTabProvider(this, morpheus)
        this.pluginProviders.put(networkTab.code, networkTab)
        this.pluginProviders.put(instanceTab.code, instanceTab)

        // Register option source
        def optionSource = new OctaviaOptionSourceProvider(this, morpheus)
        this.pluginProviders.put(optionSource.code, optionSource)

        // Register controller — wrapped in try-catch to diagnose silent failures
        try {
            log.info("About to create OctaviaController...")
            def controller = new OctaviaController(this, morpheus)
            log.info("OctaviaController created, adding to controllers list...")
            this.controllers.add(controller)
            log.info("OctaviaController registered successfully. Controllers count: {}. Routes: {}", this.controllers.size(), controller.getRoutes()*.url)
        } catch (Exception ex) {
            log.error("FAILED to register OctaviaController: ${ex.class.name}: ${ex.message}", ex)
        }

        this.name = "Custom Octavia Load Balancer UI"
    }

    @Override
    void onDestroy() {
        log.info("Destroying Custom Octavia Load Balancer UI plugin")
    }

    @Override
    List<Permission> getPermissions() {
        return [
            new Permission('Octavia Load Balancer Integration', 'octavia-loadbalancer', [Permission.AccessType.none, Permission.AccessType.full])
        ]
    }
}
