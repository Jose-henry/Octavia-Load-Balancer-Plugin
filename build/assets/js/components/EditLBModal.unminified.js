; (function () {
    const EditLBModal = ({ lb, networkId, options, onClose, onUpdated }) => {
        const Api = window.Octavia.api;
        const { Field, Badge, useAsync } = window.Octavia;
        const { Step2_Listener, Step3_Pool, Step4_Members, Step5_Monitor } = window.Octavia.Steps;

        const [tab, setTab] = React.useState('general');
        const [data, setData] = React.useState({ ...lb });
        const [saving, setSaving] = React.useState(false);

        // Load sub-resources
        const { loading, error, data: details } = useAsync(async () => {
            // Parallel fetch listeners, pools, monitor
            const [l, p, m] = await Promise.all([
                Api.listListeners(lb.id, { networkId }),
                Api.listPools(lb.id, { networkId }),
                Api.getHealthMonitor(lb.id, { networkId })
            ]);
            return { ...l, ...p, ...m };
        }, [lb.id]);

        React.useEffect(() => {
            if (details) {
                // Merge details into data
                const newD = { ...data };
                if (details.listeners && details.listeners.length > 0) {
                    const l = details.listeners[0];
                    newD.createListener = true;
                    newD.listenerName = l.name;
                    newD.listenerProtocol = l.protocol;
                    newD.listenerPort = l.protocol_port;
                    newD.connectionLimit = l.connection_limit;
                    newD.allowedCidrs = (l.allowed_cidrs || []).join(',');
                    // ... map other listener fields
                } else {
                    newD.createListener = false;
                }

                if (details.pools && details.pools.length > 0) {
                    const p = details.pools[0];
                    newD.createPool = true;
                    newD.poolName = p.name;
                    newD.poolAlgorithm = p.lb_algorithm;
                    newD.poolProtocol = p.protocol;
                    newD.poolDesc = p.description;
                    // Members are usually part of pool or fetched separately? 
                    // In Octavia, members are sub-resource of pool.
                    // Our Api.listPools might need to fetch members too or we rely on them being there?
                    // The original code passed 'members' to Step4.
                    newD.members = p.members || [];
                } else {
                    newD.createPool = false;
                }

                if (details.monitor) {
                    const m = details.monitor;
                    newD.createMonitor = true;
                    newD.monitorName = m.name || 'Monitor'; // Monitor often doesn't have name in some APIs
                    newD.monitorType = m.type;
                    newD.delay = m.delay;
                    newD.timeout = m.timeout;
                    newD.maxRetries = m.max_retries;
                } else {
                    newD.createMonitor = false;
                }

                setData(newD);
            }
        }, [details]);


        const update = (field, val) => setData(prev => ({ ...prev, [field]: val }));

        const save = () => {
            setSaving(true);
            Api.updateLoadBalancer(lb.id, data).then(onUpdated).catch(e => {
                setSaving(false);
                alert(e.message);
            });
        };

        const editTabs = [
            { key: 'general', title: 'General' },
            { key: 'listener', title: 'Listener' },
            { key: 'pool', title: 'Pool' },
            { key: 'monitor', title: 'Health Monitor' }
        ];

        return (
            React.createElement(
              "div",
              {className: "modal fade in", style: { display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', overflowY: 'auto' }},
              React.createElement(
                "div",
                {className: "modal-dialog modal-lg"},
                React.createElement(
                  "div",
                  {className: "modal-content"},
                  React.createElement(
                    "div",
                    {className: "modal-header"},
                    React.createElement(
                      "button",
                      {type: "button", className: "close", onClick: onClose, "aria-label": "Close", "data-dismiss": "modal"},
                      React.createElement(
                        "span",
                        {"aria-hidden": "true"},
                        React.createElement(
                          "svg",
                          {version: "1.1", className: "close-icon", xmlns: "http://www.w3.org/2000/svg", xmlnsXlink: "http://www.w3.org/1999/xlink", x: "0px", y: "0px", viewBox: "0 0 59.9 59.9", enableBackground: "new 0 0 59.9 59.9", xmlSpace: "preserve"},
                          React.createElement(
                            "line",
                            {fill: "none", stroke: "currentColor", strokeMiterlimit: "10", x1: "57.4", y1: "2.5", x2: "2.5", y2: "57.4"}
                          ),
                          React.createElement(
                            "line",
                            {fill: "none", stroke: "currentColor", strokeMiterlimit: "10", x1: "2.5", y1: "2.5", x2: "57.4", y2: "57.4"}
                          )
                        )
                      )
                    ),
                    React.createElement(
                      "h4",
                      {className: "modal-title"},
                      "Edit Load Balancer"
                    )
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-body"},
                    React.createElement(
                      "div",
                      {className: "wizard", style: { marginBottom: 20 }},
                      React.createElement(
                        "ul",
                        {className: "breadcrumbs", style: { paddingLeft: 0, margin: 0 }},
                        editTabs.map((t, index) => {
                                        const currentIdx = editTabs.findIndex(et => et.key === tab);
                                        const liClass = `bc ${tab === t.key ? 'active' : index < currentIdx ? 'prevActive' : ''}`;
                                        return (
                                            React.createElement(
                                              "li",
                                              {key: t.key, className: liClass, onClick: () => setTab(t.key), style: { cursor: 'pointer' }},
                                              t.title
                                            )
                                        );
                                    })
                      )
                    ),
                    React.createElement(
                      "div",
                      {className: "tab-content", style: { padding: '10px 0' }},
                      loading ? React.createElement(
            "div",
            {style: { textAlign: 'center', padding: 40 }},
            React.createElement(
              "i",
              {className: "fa fa-spinner fa-spin"}
            ),
            " Loading..."
          ) : React.createElement(
                                                                                                                           "div",
                                                                                                                           null,
                                                                                                                           tab === 'general' && React.createElement(
                       "div",
                       {className: "form-horizontal"},
                       React.createElement(
                         "div",
                         {className: "row"},
                         React.createElement(
                           "div",
                           {className: "col-md-6"},
                           React.createElement(
                             Field,
                             {label: "Cloud"},
                             React.createElement(
                               "input",
                               {className: "form-control", value: options?.optionClouds?.[0]?.name || options?.cloud?.name || data?.cloud?.name || 'None', readOnly: true, disabled: true}
                             )
                           )
                         ),
                         React.createElement(
                           "div",
                           {className: "col-md-6"},
                           React.createElement(
                             Field,
                             {label: "Resource Pool"},
                             React.createElement(
                               "input",
                               {className: "form-control", value: options?.optionResourcePools?.[0]?.name || 'None', readOnly: true, disabled: true}
                             )
                           )
                         )
                       ),
                       React.createElement(
                         Field,
                         {label: "Name"},
                         React.createElement(
                           "input",
                           {className: "form-control", value: data.name || '', onChange: e => update('name', e.target.value)}
                         )
                       ),
                       React.createElement(
                         Field,
                         {label: "Description"},
                         React.createElement(
                           "input",
                           {className: "form-control", value: data.description || '', onChange: e => update('description', e.target.value)}
                         )
                       ),
                       React.createElement(
                         "div",
                         {className: "form-group"},
                         React.createElement(
                           "div",
                           {className: "col-sm-12"},
                           React.createElement(
                             "div",
                             {className: "checkbox"},
                             React.createElement(
                               "label",
                               null,
                               React.createElement(
                                 "input",
                                 {type: "checkbox", checked: data.admin_state_up, onChange: e => update('admin_state_up', e.target.checked)}
                               ),
                               " Admin State Up"
                             )
                           )
                         )
                       )
                     ),
                                                                                                                           tab === 'listener' && React.createElement(
                        Step2_Listener,
                        {data: data, update: update}
                      ),
                                                                                                                           tab === 'pool' && React.createElement(
                    "div",
                    null,
                    React.createElement(
                      Step3_Pool,
                      {data: data, update: update}
                    ),
                    React.createElement(
                      "hr",
                      null
                    ),
                    React.createElement(
                      "h5",
                      {style: { fontWeight: 600, marginBottom: 15 }},
                      "Members"
                    ),
                    React.createElement(
                      Step4_Members,
                      {data: data, update: update, options: { instances: [] }}
                    )
                  ),
                                                                                                                           tab === 'monitor' && React.createElement(
                       Step5_Monitor,
                       {data: data, update: update}
                     )
                                                                                                                         )
                    )
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-footer"},
                    React.createElement(
                      "button",
                      {className: "btn btn-default", onClick: onClose},
                      "Cancel"
                    ),
                    React.createElement(
                      "button",
                      {className: "btn btn-success", onClick: save, disabled: saving || loading},
                      saving ? 'Saving...' : 'Save Changes'
                    )
                  )
                )
              )
            )
        );
    };

    window.Octavia.EditLBModal = EditLBModal;
})();

