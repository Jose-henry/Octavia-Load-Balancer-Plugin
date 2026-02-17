; (function () {
    const InstanceView = ({ instanceId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync } = window.Octavia;

        const lbState = useAsync(() => Api.listLoadBalancers({ instanceId }), [instanceId])

        if (lbState.error) return React.createElement(
                                    "div",
                                    {className: "alert alert-danger"},
                                    lbState.error.message
                                  )
        if (lbState.loading) return React.createElement(
                                      "div",
                                      {style: { padding: 20, textAlign: 'center' }},
                                      React.createElement(
                                        "span",
                                        {style: { display: 'inline-block', width: 16, height: 16, border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}
                                      ),
                                      " Loading..."
                                    )
        const lbs = lbState.data?.loadbalancers || []
        if (lbs.length === 0) return React.createElement(
                                       "div",
                                       {className: "alert alert-info"},
                                       "This instance is not a member of any Octavia load balancer."
                                     )

        return (
            React.createElement(
              "div",
              {className: "container-fluid", style: { padding: '0 12px' }},
              React.createElement(
                "h4",
                {style: { textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', color: '#2d6ca2', marginBottom: 15 }},
                "Load balancers associated with this instance"
              ),
              React.createElement(
                "p",
                {className: "text-muted", style: { marginBottom: 15, fontSize: '0.9em' }},
                "This instance is a pool member of the following load balancers. Click a name to manage it on the Network detail page."
              ),
              React.createElement(
                "div",
                {className: "table-responsive"},
                React.createElement(
                  "table",
                  {className: "table table-striped table-hover"},
                  React.createElement(
                    "thead",
                    null,
                    React.createElement(
                      "tr",
                      {style: { textTransform: 'uppercase', fontSize: '0.85em', fontWeight: 600 }},
                      React.createElement(
                        "th",
                        null,
                        "Name"
                      ),
                      React.createElement(
                        "th",
                        null,
                        "VIP"
                      ),
                      React.createElement(
                        "th",
                        null,
                        "Status"
                      ),
                      React.createElement(
                        "th",
                        null,
                        "Members"
                      ),
                      React.createElement(
                        "th",
                        null,
                        "Network"
                      )
                    )
                  ),
                  React.createElement(
                    "tbody",
                    null,
                    lbs.map(lb => (
                                React.createElement(
                                  "tr",
                                  {key: lb.id},
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      "a",
                                      {href: '/infrastructure/networks/' + (lb.networkId || '') + '#!octavia-network-tab', style: { fontWeight: 'bold', color: '#2d6ca2', textDecoration: 'none' }, title: "View in Network detail Octavia tab"},
                                      lb.name
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    lb.vipAddress
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      Badge,
                                      {text: lb.provisioning_status || 'ACTIVE', tone: (lb.provisioning_status || 'ACTIVE') === 'ACTIVE' ? 'success' : 'warning'}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    (lb.members || []).length
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      "a",
                                      {href: '/infrastructure/networks/' + (lb.networkId || ''), style: { color: '#2d6ca2' }},
                                      lb.networkName || 'View Network'
                                    )
                                  )
                                )
                            ))
                  )
                )
              )
            )
        )
    }

    window.Octavia.InstanceView = InstanceView;
})();

