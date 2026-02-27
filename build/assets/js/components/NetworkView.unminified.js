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

        const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, reloadKey]);

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

        if (lbState.error) return React.createElement(
                                    "div",
                                    {className: "alert alert-danger"},
                                    lbState.error.message
                                  );
        if (lbState.loading && !inlineLbs) {
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

        const lbs = inlineLbs || lbState.data.loadbalancers || [];

        const handleDelete = () => {
            setDeleting(true);
            Api.deleteLoadBalancer(deleteTarget.id, networkId).then(() => {
                setDeleting(false);
                setDeleteTarget(null);
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
                                    // Refresh list in background without triggering global loader
                                    return Api.listLoadBalancers({ networkId }).then(r => {
                                        setInlineLbs(r.loadbalancers || r.data?.loadbalancers || []);
                                        setToast({ msg: 'Floating IP attached successfully.', type: 'success' });
                                    });
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
                            setToast({ msg: 'Load Balancer created successfully.', type: 'success' });
                        }}
                    )
                ),
              view === 'edit' && selectedLb && React.createElement(
                                   EditLBModalComp,
                                   {lb: selectedLb, networkId: networkId, options: { ...options, subnets }, onClose: () => { setSelectedLb(null); setView('list'); }, onUpdated: () => { setSelectedLb(null); setView('list'); }}
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
                  lbs.map(lb => (
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
                                                                    // Refresh list in background without global loader
                                                                    return Api.listLoadBalancers({ networkId }).then(r => {
                                                                        setInlineLbs(r.loadbalancers || r.data?.loadbalancers || []);
                                                                        setToast({ msg: 'Floating IP detached successfully.', type: 'success' });
                                                                    });
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
                  lbs.length === 0 && (
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
              )
            )
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();

