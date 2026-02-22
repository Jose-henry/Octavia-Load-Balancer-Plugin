package com.example

import com.morpheusdata.model.NetworkLoadBalancer
import com.morpheusdata.model.Workload
import org.junit.Test

class TestProperties {
    @Test
    void testProps() {
        println "=== NLB Fields ==="
        NetworkLoadBalancer.class.declaredFields.each { println it.name }
        println "=== NLB Methods ==="
        NetworkLoadBalancer.class.methods.each { if(it.name.startsWith("set") || it.name.startsWith("get")) println it.name }
        
        println "=== Workload Fields ==="
        Workload.class.declaredFields.each { println it.name }
        println "=== Workload Methods ==="
        Workload.class.methods.each { if(it.name.startsWith("set") || it.name.startsWith("get")) println it.name }
    }
}
