package com.example.octavia.util

import com.morpheusdata.core.util.HttpApiClient
import groovy.util.logging.Slf4j

@Slf4j
class OctaviaUtility {
    // Plugin Constants
    static final String PLUGIN_CODE = 'octavia-load-balancer-plugin'
    static final String SERVICE_TYPE_LOAD_BALANCER = 'load-balancer'
    static final String SERVICE_TYPE_OCTAVIA = 'octavia'
    
    // API Constants
    static final String OCTAVIA_API_VERSION = 'v2.0'
    
    // Icon Paths
    static final String ICON_PENCIL = '/assets/octavia1234/images/pencil.svg'
    static final String ICON_TRASH = '/assets/octavia1234/images/trash.svg'
    static final String ICON_TIMES = '/assets/octavia1234/images/times.svg'

    // Helper to check for successful response
    static boolean isSuccess(def response) {
        return response?.success == true
    }
}
