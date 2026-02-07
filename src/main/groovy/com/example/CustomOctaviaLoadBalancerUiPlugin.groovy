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
        // Provide a mutable renderer so PluginManager can inject our template loader
        this.renderer = new HandlebarsRenderer()

        log.info("Initializing Custom Octavia Load Balancer UI plugin (mockMode={})", mockModeEnabled())

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
        this.controllers = [controller]

        this.name = "Custom Octavia Load Balancer UI"
    }

    @Override
    void onDestroy() {
        log.info("Destroying Custom Octavia Load Balancer UI plugin")
    }

    /**
     * Toggle mock/demo mode via env var or system property.
     */
    static boolean mockModeEnabled() {
        // default ON for safe UI testing; set OCTAVIA_MOCK=false or -Doctavia.mock=false to hit real APIs
        def env = System.getenv('OCTAVIA_MOCK')
        if (env != null) return env.toBoolean()
        return !Boolean.getBoolean('octavia.mock') ? true : Boolean.getBoolean('octavia.mock')
    }
}
