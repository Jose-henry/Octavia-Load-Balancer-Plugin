; (function () {
    const NetworkView = ({ networkId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync, Toast } = window.Octavia;

        const [view, setView] = React.useState('list');
        const [selectedLb, setSelectedLb] = React.useState(null);
        const [toast, setToast] = React.useState(null);

        const optionsState = useAsync(() => Api.listOptions(networkId), [networkId]);
        const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, toast]);

        const [deleteTarget, setDeleteTarget] = React.useState(null);
        const [deleting, setDeleting] = React.useState(false);
        const [subnets, setSubnets] = React.useState([]);

        const showWizard = view === 'create';

        // Fetch subnets when wizard is opened
        React.useEffect(() => {
            if (showWizard) {
                Api.getSubnets(networkId).then(res => {
                    const mapped = (res?.data || []).map(s => ({ name: s.name, value: s.value, cidr: s.cidr }));
                    setSubnets(mapped);
                }).catch(e => console.error("Error fetching subnets:", e));
            }
        }, [showWizard, networkId]);

        if (lbState.error) return React.createElement(
                                    "div",
                                    {className: "alert alert-danger"},
                                    lbState.error.message
                                  );
        if (lbState.loading || optionsState.loading) return React.createElement(
                                                              "div",
                                                              {style: { padding: 20 }},
                                                              React.createElement(
                                                                "i",
                                                                {className: "fa fa-spinner fa-spin"}
                                                              ),
                                                              " Loading..."
                                                            );

        const lbs = lbState.data.loadbalancers || [];
        const options = optionsState.data || {};

        const handleDelete = () => {
            setDeleting(true);
            Api.deleteLoadBalancer(deleteTarget.id, networkId).then(() => {
                setDeleting(false);
                setDeleteTarget(null);
                setToast({ msg: 'Load Balancer deleted successfully.', type: 'success' });
            });
        };

        // Need to re-fetch helpers if they are not in scope?
        // CreateWizard and EditLBModal are attached to window.Octavia.
        const CreateWizardComp = window.Octavia.CreateWizard;
        const EditLBModalComp = window.Octavia.EditLBModal;
        const DeleteConfirmModalComp = window.Octavia.DeleteConfirmModal;

        return (
            React.createElement(
              "div",
              {style: { padding: '0' }},
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
                       {networkId: networkId, options: { ...options, subnets }, onClose: () => setView('list'), onCreated: () => { setView('list'); setToast({ msg: 'Load Balancer created.', type: 'success' }); }}
                     ),
              view === 'edit' && selectedLb && React.createElement(
                                   EditLBModalComp,
                                   {lb: selectedLb, networkId: networkId, onClose: () => { setSelectedLb(null); setView('list'); }, onUpdated: () => { setSelectedLb(null); setView('list'); setToast({ msg: 'Load Balancer updated.', type: 'success' }); }}
                                 ),
              React.createElement(
                "div",
                {style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15, padding: '0 5px' }},
                React.createElement(
                  "button",
                  {className: "btn btn-primary", onClick: () => setView('create')},
                  "+ ADD"
                )
              ),
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
                      "Status"
                    ),
                    React.createElement(
                      "th",
                      null,
                      "Members"
                    ),
                    React.createElement(
                      "th",
                      null
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
                              ),
                              React.createElement(
                                "td",
                                {style: { textAlign: 'right', whiteSpace: 'nowrap' }},
                                React.createElement(
                                  "button",
                                  {className: "btn btn-link btn-sm", title: "Edit", onClick: () => { setSelectedLb(lb); setView('edit'); }},
                                  React.createElement(
                                    "i",
                                    {className: "fa fa-pencil", style: { fontSize: '1.2em' }}
                                  )
                                ),
                                React.createElement(
                                  "button",
                                  {className: "btn btn-link btn-sm", title: "Delete", onClick: () => setDeleteTarget(lb)},
                                  React.createElement(
                                    "i",
                                    {className: "fa fa-trash", style: { fontSize: '1.2em' }}
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
                                {colSpan: "5", style: { textAlign: 'center', padding: 40, color: '#999' }},
                                "No Load Balancers found. Click \"ADD\" to create one."
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

