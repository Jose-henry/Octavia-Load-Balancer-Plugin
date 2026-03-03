; (function () {
    const InstanceView = ({ instanceId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync } = window.Octavia;

        const [reloadKey, setReloadKey] = React.useState(0);
        const lbState = useAsync(() => Api.listLoadBalancers({ instanceId }), [instanceId, reloadKey]);

        // Revalidate periodically so changes made on Network tab (or elsewhere) show up without reload
        React.useEffect(() => {
            if (!instanceId) return;
            const id = setInterval(() => setReloadKey(k => k + 1), 30 * 1000);
            return () => clearInterval(id);
        }, [instanceId]);

        if (lbState.error) return React.createElement(
                                    "div",
                                    {className: "alert alert-danger"},
                                    lbState.error.message
                                  )
        if (lbState.loading) {
            return (
                React.createElement(
                  "div",
                  {className: "loading-mask"},
                  React.createElement(
                    "div",
                    {className: "text-center"},
                    React.createElement(
                      "div",
                      {className: "ajax-loader"}
                    )
                  )
                )
            )
        }
        const lbs = lbState.data?.loadbalancers || []
        if (lbs.length === 0) return (
            React.createElement(
              "div",
              {className: "container-fluid", style: { padding: '0 12px' }},
              React.createElement(
                "h4",
                null,
                "Load balancers associated with this instance"
              ),
              React.createElement(
                "p",
                {className: "text-muted"},
                "This instance is a pool member of the following load balancers. Click a name to manage it on the Network detail page."
              ),
              React.createElement(
                "button",
                {type: "button", className: "btn btn-default btn-sm", onClick: () => setReloadKey(k => k + 1)},
                "Refresh"
              ),
              React.createElement(
                "div",
                {className: "alert alert-info", style: { marginTop: '12px' }},
                "This instance is not a member of any Load Balancers."
              )
            )
        );

        return (
            React.createElement(
              "div",
              {className: "container-fluid", style: { padding: '0 12px' }},
              React.createElement(
                "h4",
                null,
                "Load balancers associated with this instance"
              ),
              React.createElement(
                "p",
                {className: "text-muted"},
                "This instance is a pool member of the following load balancers. Click a name to manage it on the Network detail page."
              ),
              React.createElement(
                "button",
                {type: "button", className: "btn btn-default btn-sm", onClick: () => setReloadKey(k => k + 1), style: { marginBottom: '12px' }},
                "Refresh"
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
                      null,
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
                        "Description"
                      ),
                      React.createElement(
                        "th",
                        null,
                        "Status"
                      ),
                      React.createElement(
                        "th",
                        null,
                        "Operating"
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
                                      {href: '/infrastructure/networks/' + (lb.networkId || '') + '#!load-balancer-network-tab', title: "View in Network detail Load Balancers tab"},
                                      lb.name
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    lb.vip_display || lb.vip_address
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    lb.description || ''
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      Badge,
                                      {text: lb.provisioning_status || 'ACTIVE', tone: (lb.provisioning_status || 'ACTIVE') === 'ACTIVE' ? 'success' : (lb.provisioning_status === 'ERROR' ? 'danger' : 'warning')}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      Badge,
                                      {text: lb.operating_status || 'UNKNOWN', tone: lb.operating_status === 'ONLINE' ? 'success' : (lb.operating_status === 'ERROR' ? 'danger' : 'warning')}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    lb.membersCount != null ? lb.membersCount : (lb.members || []).length
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      "a",
                                      {href: '/infrastructure/networks/' + (lb.networkId || ''), title: "View network Load Balancers tab"},
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

