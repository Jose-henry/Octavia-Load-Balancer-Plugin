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

        const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, toast]);

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
        if (lbState.loading) return React.createElement(
                                      "div",
                                      {style: { padding: 20 }},
                                      React.createElement(
                                        "i",
                                        {className: "fa fa-spinner fa-spin"}
                                      ),
                                      " Loading..."
                                    );

        const lbs = lbState.data.loadbalancers || [];

        const handleDelete = () => {
            setDeleting(true);
            Api.deleteLoadBalancer(deleteTarget.id, networkId).then(() => {
                setDeleting(false);
                setDeleteTarget(null);
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
              view === 'create' && React.createElement(
                       CreateWizardComp,
                       {networkId: networkId, options: { ...options, subnets }, onClose: () => setView('list'), onCreated: () => { setView('list'); }}
                     ),
              view === 'edit' && selectedLb && React.createElement(
                                   EditLBModalComp,
                                   {lb: selectedLb, networkId: networkId, options: { ...options, subnets }, onClose: () => { setSelectedLb(null); setView('list'); }, onUpdated: () => { setSelectedLb(null); setView('list'); }}
                                 ),
              view === 'list' && (
                    React.createElement(
                      "div",
                      {style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }},
                      React.createElement(
                        "button",
                        {className: "btn btn-primary", onClick: () => setView('create')},
                        "+ ADD"
                      )
                    )
                ),
              view === 'list' && (
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
                            "MEMBERS"
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
                                      {text: lb.provisioning_status, tone: lb.provisioning_status === 'ACTIVE' ? 'success' : 'warning'}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    (lb.members || []).length
                                  )
                                )
                            )),
                        lbs.length === 0 && (
                                React.createElement(
                                  "tr",
                                  null,
                                  React.createElement(
                                    "td",
                                    {colSpan: "4", className: "text-center text-muted", style: { padding: '40px 0' }},
                                    "No Load Balancers found. Click \"+ ADD\" to create one."
                                  )
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

