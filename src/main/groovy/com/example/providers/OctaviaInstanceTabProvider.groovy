package com.example.providers

import com.morpheusdata.core.AbstractInstanceTabProvider
import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.Plugin
import com.morpheusdata.model.Instance
import com.morpheusdata.views.HTMLResponse
import com.morpheusdata.views.ViewModel
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaInstanceTabProvider extends AbstractInstanceTabProvider {
    final Plugin plugin
    final MorpheusContext morpheus

    OctaviaInstanceTabProvider(Plugin plugin, MorpheusContext morpheus) {
        this.plugin = plugin
        this.morpheus = morpheus
    }

    @Override
    Plugin getPlugin() { plugin }

    @Override
    MorpheusContext getMorpheus() { morpheus }

    @Override
    String getCode() { 'load-balancer-instance-tab' }

    @Override
    String getName() {
        return "Load Balancers" // Removed 'Octavia' per user request
    }
    @Override
    HTMLResponse renderTemplate(Instance instance) {
        def model = new ViewModel(object: [instance: instance, pluginCode: plugin.code])
        // "renderer" prefix + "hbs/octavia" → classpath lookup at renderer/hbs/octavia.hbs
        getRenderer().renderTemplate('hbs/octavia', model)
    }

    @Override
    Boolean show(Instance instance, com.morpheusdata.model.User user, com.morpheusdata.model.Account account) {
        def perms = user?.permissions ?: [:]
        def instPerm = perms['instance']
        return instPerm ? instPerm.toString().toLowerCase().contains('read') : true
    }
}
