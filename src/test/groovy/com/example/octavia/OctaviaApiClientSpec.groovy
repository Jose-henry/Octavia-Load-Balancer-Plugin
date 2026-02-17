package com.example.octavia

import com.morpheusdata.core.util.HttpApiClient
import com.morpheusdata.model.Cloud
import com.example.octavia.client.OpenStackAuthClient
import com.example.octavia.client.OctaviaApiClient
import com.morpheusdata.response.ServiceResponse
import spock.lang.Specification
import spock.lang.Subject

class OctaviaApiClientSpec extends Specification {

    @Subject
    OctaviaApiClient client

    def httpApiClient = Mock(HttpApiClient)
    def authClient = Mock(OpenStackAuthClient)

    def setup() {
        client = new OctaviaApiClient(httpApiClient, authClient, "http://octavia.example.com")
    }

    def "listLoadBalancers should call API with correct headers"() {
        given:
        def token = "fake-token"
        def projectId = "fake-project"
        def response = new ServiceResponse(success: true, content: '{"loadbalancers": []}')

        authClient.getToken() >> token
        authClient.getProjectId() >> projectId
        
        when:
        def result = client.listLoadBalancers([:])

        then:
        1 * httpApiClient.callJsonEndpoint('http://octavia.example.com', 'v2.0/lbaas/loadbalancers', _, _, _) >> { url, path, username, password, reqOpts ->
            assert reqOpts.headers['X-Auth-Token'] == token
            return response
        }
        result.success
    }
}

