; (function () {
    const NetworkView = ({ networkId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync, Toast } = window.Octavia;

        const [view, setView] = React.useState('list');
        const [selectedLb, setSelectedLb] = React.useState(null);
        const [toast, setToast] = React.useState(null);

        const showWizard = view === 'create';
        const showEdit = view === 'edit';

        const [options, setOptions] = React.useState({});
        const [subnets, setSubnets] = React.useState([]);
        const [deleteTarget, setDeleteTarget] = React.useState(null);
        const [deleting, setDeleting] = React.useState(false);

        const [reloadKey, setReloadKey] = React.useState(0);
        const [inlineLbs, setInlineLbs] = React.useState(null);
        const [floatingTarget, setFloatingTarget] = React.useState(null);
        const [pollUntil, setPollUntil] = React.useState(null);
        const [page, setPage] = React.useState(1);

        const PAGE_SIZE = 4;
        const lbState = useAsync(
            () => Api.listLoadBalancers({ networkId, max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
            [networkId, reloadKey, page]
        );

        // After create or update: poll list every 30s so status (PENDING_* -> ACTIVE) updates without manual refresh
        const POLL_INTERVAL_MS = 30 * 1000;
        const POLL_DURATION_MS = 2 * 60 * 1000; // 2 min
        React.useEffect(() => {
            if (!pollUntil || !networkId) return;
            const poll = () => {
                Api.listLoadBalancers({ networkId, max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).then(r => {
                    const list = r.loadbalancers || r.data?.loadbalancers || [];
                    setInlineLbs(list);
                }).catch(() => {});
            };
            const id = setInterval(() => {
                if (Date.now() >= pollUntil) {
                    clearInterval(id);
                    setPollUntil(null);
                    setInlineLbs(null);
                    setReloadKey(k => k + 1);
                    return;
                }
                poll();
            }, POLL_INTERVAL_MS);
            poll();
            return () => clearInterval(id);
        }, [pollUntil, networkId, page]);

        // Fetch options when wizard or edit is opened
        React.useEffect(() => {
            if (showWizard || showEdit) {
                const ctx = { networkId };

                Api.getSubnets(networkId).then(res => {
                    const mapped = (res?.data || []).map(s => ({ name: s.name, value: s.value, cidr: s.cidr, id: s.id, externalId: s.externalId }));
                    setSubnets(mapped);
                }).catch(e => console.error("Error fetching subnets:", e));

                Api.getProjects(ctx).then(res => {
                    setOptions(o => ({ ...o, optionProjects: res.data || [], optionClouds: res.optionClouds || [], optionResourcePools: res.resourcePools || [] }));
                }).catch(e => console.error(e));

                Api.getInstances(ctx).then(res => {
                    setOptions(o => ({ ...o, instances: res.data || [] }));
                }).catch(e => console.error(e));

                Api.getFloatingIpPools(ctx).then(res => {
                    setOptions(o => ({ ...o, floatingIpPools: res.floatingIpPools || [], availableFloatingIps: res.availableFloatingIps || [] }));
                }).catch(e => console.error(e));
            }
        }, [showWizard, showEdit, networkId]);

        // Background-fetch floating IP pools once per network so the cog modal opens fast
        React.useEffect(() => {
            const ctx = { networkId };
            Api.getFloatingIpPools(ctx).then(res => {
                setOptions(o => ({ ...o, floatingIpPools: res.floatingIpPools || [], availableFloatingIps: res.availableFloatingIps || [] }));
            }).catch(e => console.error(e));
        }, [networkId]);

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
                                  );
        // Full loading mask only when we have no data (initial load). When changing page, keep showing current page until fetch completes.
        const hasDataToShow = inlineLbs || (lbState.data && (lbState.data.loadbalancers?.length || lbState.data.total === 0));
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
            );
        }

        const lbs = inlineLbs || lbState.data?.loadbalancers || [];
        const total = lbState.data?.total != null ? lbState.data.total : lbs.length;
        const MAX_PAGE_BUTTONS = 6;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const currentPage = Math.min(Math.max(1, page), totalPages);
        const pageLbs = lbs;

        const handleDelete = () => {
            setDeleting(true);
            Api.deleteLoadBalancer(deleteTarget.id, networkId).then(() => {
                setDeleting(false);
                setDeleteTarget(null);
                setInlineLbs(null); // so list shows refetched data, not stale poll cache
                setReloadKey(k => k + 1);
                setToast({ msg: 'Load Balancer deleted successfully.', type: 'success' });
            });
        };

        const CreateWizardComp = window.Octavia.CreateWizard;
        const EditLBModalComp = window.Octavia.EditLBModal;
        const DeleteConfirmModalComp = window.Octavia.DeleteConfirmModal;
        const FloatingIpModalComp = window.Octavia.FloatingIpModal;

        return (
            React.createElement(
              "div",
              null,
              toast && React.createElement(
           Toast,
           {msg: toast.msg, type: toast.type, onClose: () => setToast(null)}
         ),
              deleteTarget && React.createElement(
                  DeleteConfirmModalComp,
                  {lb: deleteTarget, loading: deleting, onClose: () => setDeleteTarget(null), onConfirm: handleDelete}
                ),
              floatingTarget && (
                    React.createElement(
                      FloatingIpModalComp,
                      {lb: floatingTarget, options: options, onClose: () => setFloatingTarget(null), onAttach: (selection) => {
                            return Api.attachFloatingIp(floatingTarget.id, selection, networkId)
                                .then(() => {
                                    setFloatingTarget(null);
                                    setReloadKey(k => k + 1);
                                    setToast({ msg: 'Floating IP attached successfully.', type: 'success' });
                                })
                                .catch(err => {
                                    setToast({ msg: err.message || 'Failed to attach Floating IP.', type: 'danger' });
                                });
                        }}
                    )
                ),
              view === 'create' && (
                    React.createElement(
                      CreateWizardComp,
                      {networkId: networkId, options: { ...options, subnets }, onClose: () => setView('list'), onCreated: () => {
                            setView('list');
                            setReloadKey(k => k + 1);
                            setToast({ msg: 'Load Balancer created.', type: 'success' });
                            setPollUntil(Date.now() + POLL_DURATION_MS);
                        }}
                    )
                ),
              view === 'edit' && selectedLb && React.createElement(
                                   EditLBModalComp,
                                   {lb: selectedLb, networkId: networkId, options: { ...options, subnets }, onClose: () => { setSelectedLb(null); setView('list'); }, onUpdated: () => { setSelectedLb(null); setView('list'); setReloadKey(k => k + 1); setToast({ msg: 'Load balancer updated.', type: 'success' }); setPollUntil(Date.now() + POLL_DURATION_MS); }}
                                 ),
              React.createElement(
                "div",
                {style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }},
                React.createElement(
                  "button",
                  {className: "btn btn-primary", onClick: () => setView('create')},
                  "+ ADD"
                )
              ),
              React.createElement(
                "table",
                {className: "table"},
                React.createElement(
                  "thead",
                  null,
                  React.createElement(
                    "tr",
                    null,
                    React.createElement(
                      "th",
                      null,
                      "NAME"
                    ),
                    React.createElement(
                      "th",
                      null,
                      "VIP"
                    ),
                    React.createElement(
                      "th",
                      null,
                      "DESCRIPTION"
                    ),
                    React.createElement(
                      "th",
                      null,
                      "STATUS"
                    ),
                    React.createElement(
                      "th",
                      null,
                      "OPERATING"
                    ),
                    React.createElement(
                      "th",
                      null,
                      "MEMBERS"
                    ),
                    React.createElement(
                      "th",
                      {className: "text-right"},
                      "ACTIONS"
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
                                lb.name
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
                                  {text: lb.provisioning_status, tone: lb.provisioning_status === 'ACTIVE' ? 'success' : (lb.provisioning_status === 'ERROR' ? 'danger' : 'warning')}
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
                                {className: "text-right actions"},
                                React.createElement(
                                  "a",
                                  {href: "#", title: "Edit", className: "btn btn-sm btn-link btn-link-icon", onClick: e => { e.preventDefault(); setSelectedLb(lb); setView('edit'); }},
                                  React.createElement(
                                    "span",
                                    {className: "btn-icon btn-icon-pencil"}
                                  )
                                ),
                                React.createElement(
                                  "a",
                                  {href: "#", title: "Delete", className: "btn btn-sm btn-link btn-link-icon", onClick: e => { e.preventDefault(); setDeleteTarget(lb); }},
                                  React.createElement(
                                    "span",
                                    {className: "btn-icon btn-icon-trashcan"}
                                  )
                                ),
                                React.createElement(
                                  "div",
                                  {className: "dropdown", style: { display: 'inline-block', marginLeft: 4 }},
                                  React.createElement(
                                    "a",
                                    {href: "#", className: "btn btn-sm btn-link btn-link-icon", "data-toggle": "dropdown", "aria-haspopup": "true", "aria-expanded": "false", onClick: e => e.preventDefault()},
                                    React.createElement(
                                      "span",
                                      {className: "glyphicon glyphicon-cog"}
                                    ),
                                    React.createElement(
                                      "span",
                                      {className: "caret"}
                                    )
                                  ),
                                  React.createElement(
                                    "ul",
                                    {className: "dropdown-menu view-options dropdown-menu-right", role: "menu", "aria-labelledby": "dlabel", "data-key": "view-options"},
                                    lb.vip_floating ? (
                                                React.createElement(
                                                  "li",
                                                  null,
                                                  React.createElement(
                                                    "a",
                                                    {href: "#", onClick: (e) => {
                                                            e.preventDefault();
                                                            Api.detachFloatingIp(lb.id, networkId)
                                                                .then(() => {
                                                                    setReloadKey(k => k + 1);
                                                                    setToast({ msg: 'Floating IP detached successfully.', type: 'success' });
                                                                })
                                                                .catch(err => {
                                                                    setToast({ msg: err.message || 'Failed to detach Floating IP.', type: 'danger' });
                                                                });
                                                        }},
                                                    "Detach Floating IP"
                                                  )
                                                )
                                            ) : (
                                                React.createElement(
                                                  "li",
                                                  null,
                                                  React.createElement(
                                                    "a",
                                                    {href: "#", onClick: (e) => {
                                                            e.preventDefault();
                                                            // Open modal immediately; background options are already prefetched
                                                            setFloatingTarget(lb);
                                                        }},
                                                    "Attach Floating IP"
                                                  )
                                                )
                                            )
                                  )
                                )
                              )
                            )
                        )),
                  pageLbs.length === 0 && (
                            React.createElement(
                              "tr",
                              null,
                              React.createElement(
                                "td",
                                {colSpan: "7", className: "text-center text-muted", style: { padding: '40px 0' }},
                                "No Load Balancers found. Click \"+ ADD\" to create one."
                              )
                            )
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
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();

