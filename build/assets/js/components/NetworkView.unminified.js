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

        const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, reloadKey]);

        // Fetch options independently when wizard is opened
        React.useEffect(() => {
            if (showWizard || showEdit) {
                const ctx = { networkId };

                Api.getSubnets(networkId).then(res => {
                    const mapped = (res?.data || []).map(s => ({ name: s.name, value: s.value, cidr: s.cidr }));
                    setSubnets(mapped);
                }).catch(e => console.error("Error fetching subnets:", e));

                Api.getProjects(ctx).then(res => {
                    setOptions(o => ({ ...o, optionProjects: res.data || [], optionClouds: res.optionClouds || [], optionResourcePools: res.resourcePools || [] }));
                }).catch(e => console.error(e));

                Api.getInstances(ctx).then(res => {
                    setOptions(o => ({ ...o, instances: res.data || [] }));
                }).catch(e => console.error(e));

                Api.getFloatingIpPools(ctx).then(res => {
                    setOptions(o => ({ ...o, optionFloatingIpPools: res.data || [] }));
                }).catch(e => console.error(e));
            }
        }, [showWizard, showEdit, networkId]);

        if (lbState.error) return React.createElement(
                                    "div",
                                    {className: "alert alert-danger"},
                                    lbState.error.message
                                  );
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
            );
        }

        const lbs = lbState.data.loadbalancers || [];

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
                                lb.vip_address
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
                                {colSpan: "6", className: "text-center text-muted", style: { padding: '40px 0' }},
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

