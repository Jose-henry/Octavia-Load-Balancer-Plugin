; (function () {
    const NetworkView = ({ networkId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync, Toast } = window.Octavia;

        const [view, setView] = React.useState('list');
        const [activeTab, setActiveTab] = React.useState('lbs');
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

        // Flatten sub-resources from LBs for the tabs
        const allListeners = lbs.flatMap(lb => (lb.listeners || []).map(l => ({ ...l, lbName: lb.name })));
        const allPools = lbs.flatMap(lb => (lb.pools || []).map(p => ({ ...p, lbName: lb.name })));

        let allMembers = [];
        allPools.forEach(p => {
            if (p.members) {
                p.members.forEach(m => allMembers.push({ ...m, poolName: p.name, lbName: p.lbName }));
            }
        });

        // Monitors are attached to pools in Octavia API (healthmonitor_id)
        // Usually the LB fetch doesn't populate full monitor details unless expanded.
        const allMonitors = [];
        allPools.forEach(p => {
            if (p.healthmonitor_id) {
                allMonitors.push({ id: p.healthmonitor_id, poolName: p.name, lbName: p.lbName });
            }
        });

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
              view === 'list' && (
                    React.createElement(
                      "ul",
                      {className: "nav nav-tabs", style: { marginBottom: '15px' }},
                      React.createElement(
                        "li",
                        {className: activeTab === 'lbs' ? 'active' : ''},
                        React.createElement(
                          "a",
                          {href: "#", onClick: (e) => { e.preventDefault(); setActiveTab('lbs'); }},
                          "Load Balancers"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: activeTab === 'listeners' ? 'active' : ''},
                        React.createElement(
                          "a",
                          {href: "#", onClick: (e) => { e.preventDefault(); setActiveTab('listeners'); }},
                          "Listeners"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: activeTab === 'pools' ? 'active' : ''},
                        React.createElement(
                          "a",
                          {href: "#", onClick: (e) => { e.preventDefault(); setActiveTab('pools'); }},
                          "Pools"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: activeTab === 'members' ? 'active' : ''},
                        React.createElement(
                          "a",
                          {href: "#", onClick: (e) => { e.preventDefault(); setActiveTab('members'); }},
                          "Members"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: activeTab === 'monitors' ? 'active' : ''},
                        React.createElement(
                          "a",
                          {href: "#", onClick: (e) => { e.preventDefault(); setActiveTab('monitors'); }},
                          "Monitors"
                        )
                      )
                    )
                ),
              view === 'list' && (
                    React.createElement(
                      "div",
                      {style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15, padding: '0 5px' }},
                      React.createElement(
                        "button",
                        {className: "btn btn-primary", onClick: () => setView('create')},
                        "+ ADD"
                      )
                    )
                ),
              view === 'list' && activeTab === 'lbs' && (
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
                ),
              view === 'list' && activeTab === 'listeners' && (
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
                            "Protocol"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Port"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Default Pool"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Status"
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
                        allListeners.map(l => (
                                React.createElement(
                                  "tr",
                                  {key: l.id},
                                  React.createElement(
                                    "td",
                                    null,
                                    l.name || l.id
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    l.protocol
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    l.protocol_port
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    l.default_pool_id ? 'Yes' : 'No'
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      Badge,
                                      {text: l.provisioning_status, tone: l.provisioning_status === 'ACTIVE' ? 'success' : 'warning'}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      "span",
                                      {className: "text-muted text-sm px-2"},
                                      "(",
                                      l.lbName,
                                      ")"
                                    )
                                  )
                                )
                            )),
                        allListeners.length === 0 && React.createElement(
                               "tr",
                               null,
                               React.createElement(
                                 "td",
                                 {colSpan: "6", style: { textAlign: 'center', padding: 40, color: '#999' }},
                                 "No Listeners found attached to these Load Balancers."
                               )
                             )
                      )
                    )
                ),
              view === 'list' && activeTab === 'pools' && (
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
                            "Protocol"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Algorithm"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Members"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Status"
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
                        allPools.map(p => (
                                React.createElement(
                                  "tr",
                                  {key: p.id},
                                  React.createElement(
                                    "td",
                                    null,
                                    p.name || p.id
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    p.protocol
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    p.lb_algorithm
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    (p.members || []).length
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      Badge,
                                      {text: p.provisioning_status, tone: p.provisioning_status === 'ACTIVE' ? 'success' : 'warning'}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      "span",
                                      {className: "text-muted text-sm px-2"},
                                      "(",
                                      p.lbName,
                                      ")"
                                    )
                                  )
                                )
                            )),
                        allPools.length === 0 && React.createElement(
                           "tr",
                           null,
                           React.createElement(
                             "td",
                             {colSpan: "6", style: { textAlign: 'center', padding: 40, color: '#999' }},
                             "No Pools found attached to these Load Balancers."
                           )
                         )
                      )
                    )
                ),
              view === 'list' && activeTab === 'members' && (
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
                            "Address / Port"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Weight"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Pool"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Status"
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
                        allMembers.map(m => (
                                React.createElement(
                                  "tr",
                                  {key: m.id},
                                  React.createElement(
                                    "td",
                                    null,
                                    m.name || m.id
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    m.address,
                                    ":",
                                    m.protocol_port
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    m.weight
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    m.poolName
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      Badge,
                                      {text: m.provisioning_status, tone: m.provisioning_status === 'ACTIVE' ? 'success' : 'warning'}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      "span",
                                      {className: "text-muted text-sm px-2"},
                                      "(",
                                      m.lbName,
                                      ")"
                                    )
                                  )
                                )
                            )),
                        allMembers.length === 0 && React.createElement(
                             "tr",
                             null,
                             React.createElement(
                               "td",
                               {colSpan: "6", style: { textAlign: 'center', padding: 40, color: '#999' }},
                               "No Members found in any Pools."
                             )
                           )
                      )
                    )
                ),
              view === 'list' && activeTab === 'monitors' && (
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
                            "Type"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Delay/Timeout"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Pool"
                          ),
                          React.createElement(
                            "th",
                            null,
                            "Status"
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
                        React.createElement(
                          "tr",
                          null,
                          React.createElement(
                            "td",
                            {colSpan: "6", style: { textAlign: 'center', padding: 40, color: '#999' }},
                            "Monitors are connected to Pools."
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

