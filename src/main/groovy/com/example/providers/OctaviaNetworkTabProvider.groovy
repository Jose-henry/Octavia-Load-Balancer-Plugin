package com.example.providers

import com.morpheusdata.core.AbstractNetworkTabProvider
import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.Plugin
import com.morpheusdata.model.Network
import com.morpheusdata.views.HTMLResponse
import com.morpheusdata.views.ViewModel
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaNetworkTabProvider extends AbstractNetworkTabProvider {
    final Plugin plugin
    final MorpheusContext morpheus

    OctaviaNetworkTabProvider(Plugin plugin, MorpheusContext morpheus) {
        this.plugin = plugin
        this.morpheus = morpheus
    }

    @Override
    Plugin getPlugin() { plugin }

    @Override
    MorpheusContext getMorpheus() { morpheus }

    @Override
    String getCode() { 'octavia-network-tab' }

    @Override
    String getName() { 'Octavia' }

    @Override
    HTMLResponse renderTemplate(Network network) {
        def model = new ViewModel(object: [network: network], pluginCode: plugin.code)
        // Morpheus automatically prefixes templates with the built‑in `renderer/` base directory,
        // so we only pass the hbs-relative path here.
        plugin.renderer.renderTemplate('hbs/octavia', model)
    }

    @Override
    Boolean show(Network network, com.morpheusdata.model.User user, com.morpheusdata.model.Account account) {
        def perms = user?.permissions ?: [:]
        def networkPerm = perms['network']
        return networkPerm ? networkPerm.toString().toLowerCase().contains('read') : true
    }
}
