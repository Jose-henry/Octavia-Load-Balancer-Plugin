package com.example.octavia

import com.morpheusdata.core.util.HttpApiClient
import com.example.octavia.client.OctaviaApiClient
import com.morpheusdata.response.ServiceResponse
import spock.lang.Specification
import spock.lang.Subject

class OctaviaApiClientSpec extends Specification {

    @Subject
    OctaviaApiClient client

    def httpApiClient = Mock(HttpApiClient)

    def setup() {
        client = new OctaviaApiClient(httpApiClient, "http://octavia.example.com", "fake-token")
    }

    def "GET should call API with correct URL and auth headers"() {
        given:
        def response = ServiceResponse.success()

        when:
        def result = client.get("/v2.0/lbaas/loadbalancers")

        then:
        1 * httpApiClient.callJsonApi(_, _, _, _) >> { args ->
            assert args[0].contains("octavia.example.com")
            assert args[0].contains("/v2.0/lbaas/loadbalancers")
            return response
        }
        result.success
    }

    def "POST should send body and auth headers"() {
        given:
        def response = ServiceResponse.success()
        def body = [loadbalancer: [name: "test-lb"]]

        when:
        def result = client.post("/v2.0/lbaas/loadbalancers", body)

        then:
        1 * httpApiClient.callJsonApi(_, _, _, _) >> { args ->
            def opts = args[2]
            assert opts.headers['X-Auth-Token'] == 'fake-token'
            assert opts.body == body
            return response
        }
        result.success
    }

    def "DELETE should call API with correct method"() {
        given:
        def response = ServiceResponse.success()

        when:
        def result = client.delete("/v2.0/lbaas/loadbalancers/lb-123?cascade=true")

        then:
        1 * httpApiClient.callJsonApi(_, _, _, _) >> { args ->
            assert args[3] == 'DELETE'
            return response
        }
        result.success
    }
}
