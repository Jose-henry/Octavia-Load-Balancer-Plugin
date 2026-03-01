; (function () {
    const EditLBModal = ({ lb, networkId, options, onClose, onUpdated }) => {
        const Api = window.Octavia.api;
        const { Field, Badge, useAsync } = window.Octavia;
        const { Step2_Listener, Step3_Pool, Step4_Members, Step5_Monitor } = window.Octavia.Steps;

        const [tab, setTab] = React.useState('general');
        const [data, setData] = React.useState({ ...lb });
        // Track which sections the user edited so we only send those to the API (avoids touching listener/pool when only name/description changed)
        const [dirtySections, setDirtySections] = React.useState({ general: false, listener: false, pool: false, monitor: false });

        const vipSubnetDisplay = data.vip_subnet_display || lb.vip_subnet_display || data.vip_subnet_id || '';
        const [saving, setSaving] = React.useState(false);
        const [validationMsg, setValidationMsg] = React.useState('');

        const FIELD_SECTION = {
            name: 'general', description: 'general', admin_state_up: 'general',
            listenerName: 'listener', listenerProtocol: 'listener', listenerPort: 'listener',
            connectionLimit: 'listener', allowedCidrs: 'listener', listenerAdminStateUp: 'listener',
            poolName: 'pool', poolAlgorithm: 'pool', poolProtocol: 'pool', poolDesc: 'pool',
            poolAdminStateUp: 'pool', members: 'pool',
            monitorName: 'monitor', monitorType: 'monitor', delay: 'monitor', timeout: 'monitor',
            maxRetries: 'monitor', monitorAdminStateUp: 'monitor'
        };

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

                // Base LB details (vip, subnet, admin state)
                if (details.loadbalancer) {
                    const lbInfo = details.loadbalancer;
                    if (lbInfo.vip_address) newD.vip_address = lbInfo.vip_address;
                    if (lbInfo.vip_subnet_id) newD.vip_subnet_id = lbInfo.vip_subnet_id;
                    if (lbInfo.vip_subnet_display) newD.vip_subnet_display = lbInfo.vip_subnet_display;
                    if (typeof lbInfo.admin_state_up === 'boolean') {
                        newD.admin_state_up = lbInfo.admin_state_up;
                    }
                }
                if (newD.admin_state_up === undefined) {
                    newD.admin_state_up = true;
                }
                if (details.listeners && details.listeners.length > 0) {
                    const l = details.listeners[0];
                    newD.createListener = true;
                    newD.listenerName = l.name;
                    newD.listenerProtocol = l.protocol;
                    newD.listenerPort = l.protocol_port;
                    newD.connectionLimit = l.connection_limit;
                    newD.allowedCidrs = (l.allowed_cidrs || []).join(',');
                    newD.listenerAdminStateUp = (typeof l.admin_state_up === 'boolean') ? l.admin_state_up : true;
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
                    newD.poolAdminStateUp = (typeof p.admin_state_up === 'boolean') ? p.admin_state_up : true;
                    // Members are part of the pool in Octavia
                    newD.members = p.members || [];
                } else {
                    newD.createPool = false;
                }

                if (details.monitor) {
                    const m = details.monitor;
                    newD.createMonitor = true;
                    newD.monitorName = m.name || 'Monitor';
                    newD.monitorType = m.type;
                    newD.delay = m.delay;
                    newD.timeout = m.timeout;
                    newD.maxRetries = m.max_retries;
                    newD.monitorAdminStateUp = (typeof m.admin_state_up === 'boolean') ? m.admin_state_up : true;
                } else {
                    newD.createMonitor = false;
                }

                setData(newD);
            }
        }, [details]);


        const update = (field, val) => {
            setData(prev => ({ ...prev, [field]: val }));
            const section = FIELD_SECTION[field];
            if (section) setDirtySections(prev => ({ ...prev, [section]: true }));
        };

        function formatUpdateError(raw) {
            const isIpAddressError = typeof raw === 'string' && (
                /IPv4 or IPv6 address/i.test(raw) ||
                /does not appear to be.*address/i.test(raw)
            );
            const hasMembers = (data.members || []).length > 0;
            if (isIpAddressError && hasMembers) {
                return raw + ' This often happens when a pool member (same IP and port) is already in use on another load balancer. Try using a different port for that member, or remove it from the other load balancer first.';
            }
            return raw.startsWith('Error:') ? raw : 'Error: ' + raw;
        }

        const save = () => {
            setValidationMsg('');
            setSaving(true);
            const updatedSections = Object.keys(dirtySections).filter(s => dirtySections[s]);
            Api.updateLoadBalancer(lb.id, { ...data, updatedSections })
                .then(res => {
                    setSaving(false);
                    if (res && res.success === false) {
                        const raw = res.msg || res.error || 'Unknown update error';
                        setValidationMsg(formatUpdateError(raw));
                    } else {
                        onUpdated();
                    }
                })
                .catch(e => {
                    setSaving(false);
                    const raw = e.message || e.error || 'Network error';
                    setValidationMsg(formatUpdateError(raw));
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
                      "Edit Load Balancer:",
                      ' ',
                      React.createElement(
                        "strong",
                        null,
                        lb.name
                      )
                    )
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-body"},
                    validationMsg && React.createElement(
                   "div",
                   {className: "alert alert-danger", style: { padding: '10px 15px', marginBottom: 20 }},
                   validationMsg
                 ),
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
            {className: "loading-mask"},
            React.createElement(
              "div",
              {className: "text-center"},
              React.createElement(
                "div",
                {className: "ajax-loader"}
              )
            )
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
                         "div",
                         {className: "row"},
                         React.createElement(
                           "div",
                           {className: "col-md-6"},
                           React.createElement(
                             Field,
                             {label: "VIP Address"},
                             React.createElement(
                               "input",
                               {className: "form-control", value: data.vip_address || '', readOnly: true, disabled: true}
                             )
                           )
                         ),
                         React.createElement(
                           "div",
                           {className: "col-md-6"},
                           React.createElement(
                             Field,
                             {label: "VIP Subnet"},
                             React.createElement(
                               "input",
                               {className: "form-control", value: vipSubnetDisplay, readOnly: true, disabled: true}
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
                        "div",
                        null,
                        React.createElement(
                          Step2_Listener,
                          {data: data, update: update, hideCreateToggle: true}
                        ),
                        React.createElement(
                          "div",
                          {className: "form-group", style: { marginTop: 10 }},
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
                                  {type: "checkbox", checked: data.listenerAdminStateUp !== false, onChange: e => update('listenerAdminStateUp', e.target.checked)}
                                ),
                                " ",
                                "Admin State Up"
                              )
                            )
                          )
                        )
                      ),
                                                                                                                         tab === 'pool' && React.createElement(
                    "div",
                    null,
                    React.createElement(
                      Step3_Pool,
                      {data: data, update: update, hideCreateToggle: true}
                    ),
                    React.createElement(
                      "div",
                      {className: "form-group", style: { marginTop: 10 }},
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
                              {type: "checkbox", checked: data.poolAdminStateUp !== false, onChange: e => update('poolAdminStateUp', e.target.checked)}
                            ),
                            " ",
                            "Admin State Up"
                          )
                        )
                      )
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
                      {data: data, update: update, options: { instances: options?.instances || [] }}
                    )
                  ),
                                                                                                                         tab === 'monitor' && React.createElement(
                       "div",
                       null,
                       React.createElement(
                         Step5_Monitor,
                         {data: data, update: update, hideCreateToggle: true}
                       ),
                       React.createElement(
                         "div",
                         {className: "form-group", style: { marginTop: 10 }},
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
                                 {type: "checkbox", checked: data.monitorAdminStateUp !== false, onChange: e => update('monitorAdminStateUp', e.target.checked)}
                               ),
                               " ",
                               "Admin State Up"
                             )
                           )
                         )
                       )
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

