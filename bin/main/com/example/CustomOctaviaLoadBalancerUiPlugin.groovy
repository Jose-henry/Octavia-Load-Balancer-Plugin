package com.example

import com.example.backend.OctaviaController
import com.example.providers.OctaviaInstanceTabProvider
import com.example.providers.OctaviaNetworkTabProvider
import com.example.providers.OctaviaOptionSourceProvider
import com.morpheusdata.core.Plugin
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

        // Register controller
        def controller = new OctaviaController(this, morpheus)
        this.controllers.add(controller)

        this.name = "Custom Octavia Load Balancer UI"
    }

    @Override
    void onDestroy() {
        log.info("Destroying Custom Octavia Load Balancer UI plugin")
    }
}
