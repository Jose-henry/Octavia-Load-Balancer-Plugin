; (function () {
    const InstanceView = ({ instanceId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync } = window.Octavia;

        const [reloadKey, setReloadKey] = React.useState(0);
        const [page, setPage] = React.useState(1);
        const PAGE_SIZE = 4;
        const lbState = useAsync(
            () => Api.listLoadBalancers({ instanceId, max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
            [instanceId, reloadKey, page]
        );

        // Revalidate periodically so changes made on Network tab (or elsewhere) show up without reload
        React.useEffect(() => {
            if (!instanceId) return;
            const id = setInterval(() => setReloadKey(k => k + 1), 30 * 1000);
            return () => clearInterval(id);
        }, [instanceId]);

        // Clamp page to totalPages when total changes; only when not loading so we don't reset page during refetch (fixes next-page flip-back)
        const totalFromData = lbState.data?.total != null ? lbState.data.total : (lbState.data?.loadbalancers || []).length;
        const totalPagesStable = Math.max(1, Math.ceil(totalFromData / PAGE_SIZE));
        React.useEffect(() => {
            if (!lbState.loading) setPage(p => Math.min(p, totalPagesStable));
        }, [totalPagesStable, lbState.loading]);

        if (lbState.error) return React.createElement(
                                    "div",
                                    {className: "alert alert-danger"},
                                    lbState.error.message
                                  )
        // Full loading mask only when we have no data (initial load). When changing page, keep showing current page until fetch completes.
        const hasDataToShow = lbState.data && (lbState.data.loadbalancers?.length || lbState.data.total === 0)
        if (lbState.loading && !hasDataToShow) {
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
        const total = lbState.data?.total != null ? lbState.data.total : lbs.length
        const MAX_PAGE_BUTTONS = 6
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
        const currentPage = Math.min(Math.max(1, page), totalPages)
        const pageLbs = lbs

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
                    pageLbs.map(lb => (
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
              ),
              lbs.length > 0 && (
                    React.createElement(
                      "div",
                      {className: "octavia-paging", style: { display: 'flex', alignItems: 'center', marginTop: '10px', gap: '4px', flexWrap: 'wrap', fontSize: '12px' }},
                      lbState.loading && React.createElement(
                     "span",
                     {className: "text-muted", style: { marginRight: '8px', fontStyle: 'italic' }},
                     "Loading…"
                   ),
                      React.createElement(
                        "span",
                        {className: "text-muted", style: { marginRight: '6px' }},
                        "Page",
                        currentPage,
                        " of",
                        totalPages
                      ),
                      currentPage > 1 && (
                            React.createElement(
                              "button",
                              {type: "button", style: { padding: '2px 6px', fontSize: '12px', minWidth: '26px' }, className: "btn btn-default btn-sm", onClick: () => setPage(1), title: "First page"},
                              React.createElement(
                                "span",
                                {className: "glyphicon glyphicon-step-backward"}
                              )
                            )
                        ),
                      (() => {
                            let startPage = Math.max(1, currentPage - 2);
                            let endPage = Math.min(totalPages, startPage + MAX_PAGE_BUTTONS - 1);
                            if (endPage - startPage + 1 < MAX_PAGE_BUTTONS && endPage === totalPages) startPage = Math.max(1, endPage - MAX_PAGE_BUTTONS + 1);
                            const pages = [];
                            for (let i = startPage; i <= endPage; i++) pages.push(i);
                            return pages.map((p) => (
                                p === currentPage
                                    ? React.createElement(
                                        "span",
                                        {key: p, style: { padding: '2px 6px', fontSize: '12px', minWidth: '26px', marginRight: '2px', display: 'inline-block', textAlign: 'center', border: '1px solid #ccc', borderRadius: '3px', background: '#f5f5f5' }},
                                        p
                                      )
                                    : React.createElement(
                                        "button",
                                        {key: p, type: "button", style: { padding: '2px 6px', fontSize: '12px', minWidth: '26px' }, className: "btn btn-default btn-sm", onClick: () => setPage(p)},
                                        p
                                      )
                            ));
                        })(),
                      currentPage < totalPages && (
                            React.createElement(
                              "button",
                              {type: "button", style: { padding: '2px 6px', fontSize: '12px', minWidth: '26px' }, className: "btn btn-default btn-sm", onClick: () => setPage(p => Math.min(totalPages, p + 1)), title: "Next page"},
                              React.createElement(
                                "span",
                                {className: "glyphicon glyphicon-step-forward"}
                              )
                            )
                        )
                    )
                )
            )
        )
    }

    window.Octavia.InstanceView = InstanceView;
})();

