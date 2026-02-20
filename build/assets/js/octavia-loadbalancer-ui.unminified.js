// Attach to global window.Octavia namespace
window.Octavia = window.Octavia || {};

window.Octavia.Badge = ({ text, tone = 'info' }) =>
    React.createElement(
      "span",
      {className: `label label-${tone}`, style: { marginRight: 6, borderRadius: 3, padding: '3px 8px', fontSize: '0.8em' }},
      text
    );

window.Octavia.Field = ({ label, children, help, required }) => (
    React.createElement(
      "div",
      {className: "form-group"},
      React.createElement(
        "label",
        {className: "control-label"},
        label,
        required ? React.createElement(
             "span",
             {className: "text-danger"},
             " *"
           ) : null
      ),
      children,
      help ? React.createElement(
         "div",
         {className: "help-block"},
         help
       ) : null
    )
);

window.Octavia.Toast = ({ msg, type, onClose }) => {
    React.useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);
    const color = type === 'error' ? '#f2dede' : '#dff0d8';
    const text = type === 'error' ? '#a94442' : '#3c763d';
    return (
        React.createElement(
          "div",
          {style: {
            position: 'fixed', top: 20, right: 20, zIndex: 9999,
            backgroundColor: color, color: text, padding: '10px 20px',
            borderRadius: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center'
        }},
          React.createElement(
            "span",
            {style: { marginRight: 10 }},
            msg
          ),
          React.createElement(
            "button",
            {onClick: onClose, style: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'inherit' }},
            "&times;"
          )
        )
    );
};

window.Octavia = window.Octavia || {};

; (function () {
    // Helper: fetch JSON with same-origin cookies and CSRF header
    const csrfToken = () => {
        const meta = document.querySelector('meta[name="csrf-token"]') || document.querySelector('meta[name="_csrf"]')
        return meta ? meta.getAttribute('content') : null
    }
    const csrfHeaderName = () => {
        const meta = document.querySelector('meta[name="_csrf_header"]')
        return meta ? meta.getAttribute('content') : 'X-CSRF-TOKEN'
    }

    const cookieVal = (name) => {
        const match = document.cookie.match(new RegExp('(^|; )' + name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)'))
        return match ? decodeURIComponent(match[2]) : null
    }

    const apiFetch = (url, opts = {}) => {
        const headers = {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        }
        // only set content-type when body present
        if (opts.body) headers['Content-Type'] = 'application/json'
        const token = csrfToken()
        if (token) {
            const hdr = csrfHeaderName()
            headers[hdr] = token
            headers['X-CSRF-TOKEN'] = token // keep legacy name as well
        }
        // fallback from cookie (Spring Security style)
        const xsrf = cookieVal('XSRF-TOKEN')
        if (xsrf) {
            headers['X-XSRF-TOKEN'] = xsrf
            if (!headers['X-CSRF-TOKEN']) headers['X-CSRF-TOKEN'] = xsrf
        }
        // Using session + CSRF; no bearer token by default
        const cfg = Object.assign({
            credentials: 'include',
            headers
        }, opts)
        console.log(`[Octavia] Fetching: ${url}`, cfg); // Debugging
        return fetch(url, cfg).then(async r => {
            const text = await r.text()
            const data = text ? (() => { try { return JSON.parse(text) } catch (e) { return { raw: text } } })() : {}
            if (!r.ok) {
                const msg = data?.message || data?.error || `Request failed (${r.status})`
                throw new Error(msg)
            }
            return data
        })
    }

    window.Octavia.makeApi = (pluginCode) => {
        // Fallback or explicit routing logic
        // We will attempt to use the absolute path to ensure the Dispatcher routes it.
        const baseUrl = `/plugin/${pluginCode}`;
        console.log(`[Octavia API] Initialized with Base URL: ${baseUrl}`);

        // Helper to append context params
        const withContext = (url, ctx) => {
            const params = [];
            if (ctx && ctx.networkId) params.push('networkId=' + ctx.networkId);
            if (ctx && ctx.instanceId) params.push('instanceId=' + ctx.instanceId);
            if (params.length === 0) return url;
            return url + (url.includes('?') ? '&' : '?') + params.join('&');
        };

        // --- RPC Wrapper for OptionSourceProvider Workaround ---
        // --- RPC Wrapper for OptionSourceProvider Workaround ---
        // Reverting back to PluginController endpoints since OptionSourceProvider returns 401 without API tokens.
        // The PluginController integrates directly with the Morpheus UI session via /plugin/{code}/...

        return {
            getSubnets: (networkId) => {
                if (!networkId) return Promise.resolve({ data: [] });
                return apiFetch(`${baseUrl}/optionSubnets?networkId=${networkId}`, { method: 'GET' });
            },

            listLoadBalancers: (ctx) => {
                return apiFetch(withContext(`${baseUrl}/loadbalancers`, ctx));
            },

            getLoadBalancer: (lbId, ctx) => {
                return apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx));
            },

            createLoadBalancer: (payload) => {
                return apiFetch(`${baseUrl}/loadbalancersCreate`, { method: 'POST', body: JSON.stringify(payload) });
            },

            updateLoadBalancer: (lbId, payload) => {
                return apiFetch(`${baseUrl}/loadbalancerUpdate`, { method: 'POST', body: JSON.stringify({ ...payload, id: lbId }) });
            },

            deleteLoadBalancer: (lbId, networkId) => {
                return apiFetch(`${baseUrl}/loadbalancersDelete`, { method: 'POST', body: JSON.stringify({ lbId, networkId }) });
            },

            listOptions: (networkId, instanceId) => {
                const ctx = { networkId, instanceId };
                return Promise.all([
                    apiFetch(withContext(`${baseUrl}/optionProjects`, ctx)).then(res => ({ optionProjects: res.data || [] })),
                    apiFetch(withContext(`${baseUrl}/optionSubnets`, ctx)).then(res => ({ optionSubnets: res.data || [] })),
                    apiFetch(withContext(`${baseUrl}/optionInstances`, ctx)).then(res => ({ optionInstances: res.data || [] })),
                    apiFetch(withContext(`${baseUrl}/optionFloatingIpPools`, ctx)).then(res => ({ optionFloatingIpPools: res.data || [] }))
                ]).then(results => results.reduce((acc, curr) => ({ ...acc, ...curr }), {}));
            },

            // Helpers for Edit Modal
            listListeners: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx))
                .then(r => ({ listeners: r.loadbalancer?.listeners || [] })),

            listPools: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx))
                .then(r => ({ pools: r.loadbalancer?.pools || [] })),

            getHealthMonitor: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx))
                .then(r => {
                    const pools = r.loadbalancer?.pools || [];
                    const monitorId = pools.find(p => p.healthmonitor_id)?.healthmonitor_id;
                    return { monitor: monitorId ? { id: monitorId } : null };
                }),

            attachFloatingIp: (lbId, fipPoolId, networkId) => apiFetch(`${baseUrl}/floatingipAttach`, { method: 'POST', body: JSON.stringify({ lbId, floatingIpPoolId: fipPoolId, networkId }) }),

            detachFloatingIp: (lbId, networkId) => apiFetch(`${baseUrl}/floatingipDetach`, { method: 'POST', body: JSON.stringify({ lbId, networkId }) }),

            /**
             * Poll LB status until provisioning_status is ACTIVE or ERROR.
             */
            pollStatus: (lbId, ctx, intervalMs = 3000, maxAttempts = 40) => {
                return new Promise((resolve, reject) => {
                    let attempts = 0;
                    const check = () => {
                        attempts++;
                        apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx))
                            .then(r => {
                                const lb = r.data || r.loadbalancer || r;
                                const status = lb.provisioning_status;
                                if (status === 'ACTIVE' || status === 'ERROR' || status === 'DELETED') {
                                    resolve(lb);
                                } else if (attempts >= maxAttempts) {
                                    reject(new Error('Status polling timed out'));
                                } else {
                                    setTimeout(check, intervalMs);
                                }
                            })
                            .catch(err => {
                                if (attempts >= maxAttempts) reject(err);
                                else setTimeout(check, intervalMs);
                            });
                    };
                    check();
                });
            }
        };
    };

    window.Octavia.useAsync = (fn, deps) => {
        const [state, set] = React.useState({ loading: true })
        React.useEffect(() => {
            let active = true
            set({ loading: true })
            fn().then(data => active && set({ loading: false, data }))
                .catch(err => active && set({ loading: false, error: err }))
            return () => { active = false }
        }, deps)
        return state
    }
})();

; (function () {
    // --- Step 1: Details ---
    const Step1_Details = ({ data, update, options }) => {
        const { Field } = window.Octavia;
        return (
            React.createElement(
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
                    {label: "Name", required: true},
                    React.createElement(
                      "input",
                      {className: "form-control", value: data.name || '', onChange: e => update('name', e.target.value), placeholder: "My Load Balancer"}
                    )
                  )
                ),
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "Description"},
                    React.createElement(
                      "input",
                      {className: "form-control", value: data.description || '', onChange: e => update('description', e.target.value), placeholder: "Optional description"}
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
                    {label: "VIP Subnet", required: true},
                    React.createElement(
                      "select",
                      {className: "form-control", value: data.vipSubnetId || '', onChange: e => update('vipSubnetId', e.target.value)},
                      React.createElement(
                        "option",
                        {value: true},
                        "Select Subnet..."
                      ),
                      (options.subnets || []).map(s => React.createElement(
                                   "option",
                                   {key: s.value, value: s.value},
                                   s.name,
                                   s.cidr ? `(${s.cidr})` : ''
                                 ))
                    )
                  )
                ),
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "IP Address"},
                    React.createElement(
                      "input",
                      {className: "form-control", value: data.vipAddress || '', onChange: e => update('vipAddress', e.target.value), placeholder: "Auto-assign"}
                    )
                  )
                )
              )
            )
        );
    };

    // --- Step 2: Listener ---
    const Step2_Listener = ({ data, update }) => {
        const { Field } = window.Octavia;
        const protocols = ['HTTP', 'HTTPS', 'TERMINATED_HTTPS', 'TCP', 'UDP', 'SCTP'];
        const showHeaders = ['HTTP', 'TERMINATED_HTTPS'].includes(data.listenerProtocol);
        const showTls = data.listenerProtocol === 'TERMINATED_HTTPS';
        const hideTimeouts = ['UDP', 'SCTP'].includes(data.listenerProtocol);

        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
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
                        {type: "checkbox", checked: data.createListener, onChange: e => update('createListener', e.target.checked)}
                      ),
                      React.createElement(
                        "strong",
                        null,
                        "Create Listener"
                      )
                    )
                  )
                )
              ),
              data.createListener && React.createElement(
                         "div",
                         {style: { borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }},
                         React.createElement(
                           "div",
                           {className: "row"},
                           React.createElement(
                             "div",
                             {className: "col-md-6"},
                             React.createElement(
                               Field,
                               {label: "Listener Name", required: true},
                               React.createElement(
                                 "input",
                                 {className: "form-control", value: data.listenerName || '', onChange: e => update('listenerName', e.target.value)}
                               )
                             )
                           ),
                           React.createElement(
                             "div",
                             {className: "col-md-3"},
                             React.createElement(
                               Field,
                               {label: "Protocol", required: true},
                               React.createElement(
                                 "select",
                                 {className: "form-control", value: data.listenerProtocol || 'HTTP', onChange: e => update('listenerProtocol', e.target.value)},
                                 protocols.map(p => React.createElement(
                     "option",
                     {key: p, value: p},
                     p
                   ))
                               )
                             )
                           ),
                           React.createElement(
                             "div",
                             {className: "col-md-3"},
                             React.createElement(
                               Field,
                               {label: "Port", required: true},
                               React.createElement(
                                 "input",
                                 {type: "number", className: "form-control", value: data.listenerPort || 80, onChange: e => update('listenerPort', parseInt(e.target.value)), min: "1", max: "65535"}
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
                               {label: "Connection Limit"},
                               React.createElement(
                                 "input",
                                 {type: "number", className: "form-control", value: data.connectionLimit || -1, onChange: e => update('connectionLimit', parseInt(e.target.value)), placeholder: "-1 for infinite"}
                               )
                             )
                           ),
                           React.createElement(
                             "div",
                             {className: "col-md-6"},
                             React.createElement(
                               Field,
                               {label: "Allowed CIDRs"},
                               React.createElement(
                                 "input",
                                 {className: "form-control", value: data.allowedCidrs || '', onChange: e => update('allowedCidrs', e.target.value), placeholder: "e.g. 192.168.1.0/24, 10.0.0.0/8"}
                               )
                             )
                           )
                         ),
                         !hideTimeouts && React.createElement(
                   "div",
                   {className: "row"},
                   React.createElement(
                     "div",
                     {className: "col-md-3"},
                     React.createElement(
                       Field,
                       {label: "Client Data Timeout"},
                       React.createElement(
                         "input",
                         {type: "number", className: "form-control", value: data.clientDataTimeout || 50000, onChange: e => update('clientDataTimeout', parseInt(e.target.value))}
                       )
                     )
                   ),
                   React.createElement(
                     "div",
                     {className: "col-md-3"},
                     React.createElement(
                       Field,
                       {label: "TCP Inspect Timeout"},
                       React.createElement(
                         "input",
                         {type: "number", className: "form-control", value: data.tcpInspectTimeout || 0, onChange: e => update('tcpInspectTimeout', parseInt(e.target.value))}
                       )
                     )
                   ),
                   React.createElement(
                     "div",
                     {className: "col-md-3"},
                     React.createElement(
                       Field,
                       {label: "Member Connect Timeout"},
                       React.createElement(
                         "input",
                         {type: "number", className: "form-control", value: data.memberConnectTimeout || 5000, onChange: e => update('memberConnectTimeout', parseInt(e.target.value))}
                       )
                     )
                   ),
                   React.createElement(
                     "div",
                     {className: "col-md-3"},
                     React.createElement(
                       Field,
                       {label: "Member Data Timeout"},
                       React.createElement(
                         "input",
                         {type: "number", className: "form-control", value: data.memberDataTimeout || 50000, onChange: e => update('memberDataTimeout', parseInt(e.target.value))}
                       )
                     )
                   )
                 ),
                         showHeaders && React.createElement(
                 "div",
                 {className: "well ml-3"},
                 React.createElement(
                   "label",
                   null,
                   "Insert Headers"
                 ),
                 React.createElement(
                   "div",
                   {className: "checkbox"},
                   React.createElement(
                     "label",
                     null,
                     React.createElement(
                       "input",
                       {type: "checkbox", checked: data.insertXForwardedFor || false, onChange: e => update('insertXForwardedFor', e.target.checked)}
                     ),
                     " X-Forwarded-For"
                   )
                 ),
                 React.createElement(
                   "div",
                   {className: "checkbox"},
                   React.createElement(
                     "label",
                     null,
                     React.createElement(
                       "input",
                       {type: "checkbox", checked: data.insertXForwardedPort || false, onChange: e => update('insertXForwardedPort', e.target.checked)}
                     ),
                     " X-Forwarded-Port"
                   )
                 ),
                 React.createElement(
                   "div",
                   {className: "checkbox"},
                   React.createElement(
                     "label",
                     null,
                     React.createElement(
                       "input",
                       {type: "checkbox", checked: data.insertXForwardedProto || false, onChange: e => update('insertXForwardedProto', e.target.checked)}
                     ),
                     " X-Forwarded-Proto"
                   )
                 )
               ),
                         showTls && React.createElement(
             "div",
             {className: "well ml-3"},
             React.createElement(
               "label",
               null,
               "TLS Configuration"
             ),
             React.createElement(
               Field,
               {label: "TLS Cipher String"},
               React.createElement(
                 "input",
                 {className: "form-control", value: data.tlsCipherString || '', onChange: e => update('tlsCipherString', e.target.value), placeholder: "Default"}
               )
             )
           )
                       )
            )
        );
    };

    // --- Step 3: Pool ---
    const Step3_Pool = ({ data, update }) => {
        const { Field } = window.Octavia;
        const algorithms = ['ROUND_ROBIN', 'LEAST_CONNECTIONS', 'SOURCE_IP'];
        const protocols = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SCTP'];

        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
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
                        {type: "checkbox", checked: data.createPool, onChange: e => update('createPool', e.target.checked)}
                      ),
                      React.createElement(
                        "strong",
                        null,
                        "Create Pool"
                      )
                    )
                  )
                )
              ),
              data.createPool && React.createElement(
                     "div",
                     {style: { borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }},
                     React.createElement(
                       "div",
                       {className: "row"},
                       React.createElement(
                         "div",
                         {className: "col-md-6"},
                         React.createElement(
                           Field,
                           {label: "Pool Name", required: true},
                           React.createElement(
                             "input",
                             {className: "form-control", value: data.poolName || '', onChange: e => update('poolName', e.target.value)}
                           )
                         )
                       ),
                       React.createElement(
                         "div",
                         {className: "col-md-6"},
                         React.createElement(
                           Field,
                           {label: "Algorithm", required: true},
                           React.createElement(
                             "select",
                             {className: "form-control", value: data.poolAlgorithm || 'ROUND_ROBIN', onChange: e => update('poolAlgorithm', e.target.value)},
                             algorithms.map(a => React.createElement(
                      "option",
                      {key: a, value: a},
                      a
                    ))
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
                           {label: "Protocol", required: true},
                           React.createElement(
                             "select",
                             {className: "form-control", value: data.poolProtocol || data.listenerProtocol || 'HTTP', onChange: e => update('poolProtocol', e.target.value)},
                             protocols.map(p => React.createElement(
                     "option",
                     {key: p, value: p},
                     p
                   ))
                           )
                         )
                       ),
                       React.createElement(
                         "div",
                         {className: "col-md-6"},
                         React.createElement(
                           Field,
                           {label: "Description"},
                           React.createElement(
                             "input",
                             {className: "form-control", value: data.poolDesc || '', onChange: e => update('poolDesc', e.target.value)}
                           )
                         )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "well"},
                       React.createElement(
                         "label",
                         null,
                         "Session Persistence"
                       ),
                       React.createElement(
                         "div",
                         {className: "row"},
                         React.createElement(
                           "div",
                           {className: "col-md-6"},
                           React.createElement(
                             Field,
                             {label: "Type"},
                             React.createElement(
                               "select",
                               {className: "form-control", value: data.sessionPersistence || 'None', onChange: e => update('sessionPersistence', e.target.value)},
                               React.createElement(
                                 "option",
                                 {value: "None"},
                                 "None"
                               ),
                               React.createElement(
                                 "option",
                                 {value: "SOURCE_IP"},
                                 "Source IP"
                               ),
                               React.createElement(
                                 "option",
                                 {value: "HTTP_COOKIE"},
                                 "HTTP Cookie"
                               ),
                               React.createElement(
                                 "option",
                                 {value: "APP_COOKIE"},
                                 "App Cookie"
                               )
                             )
                           )
                         ),
                         data.sessionPersistence === 'APP_COOKIE' && React.createElement(
                                              "div",
                                              {className: "col-md-6"},
                                              React.createElement(
                                                Field,
                                                {label: "Cookie Name", required: true},
                                                React.createElement(
                                                  "input",
                                                  {className: "form-control", value: data.cookieName || '', onChange: e => update('cookieName', e.target.value)}
                                                )
                                              )
                                            )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "well"},
                       React.createElement(
                         "label",
                         null,
                         "TLS Encryption (Backend Re-encryption)"
                       ),
                       React.createElement(
                         "div",
                         {className: "checkbox"},
                         React.createElement(
                           "label",
                           null,
                           React.createElement(
                             "input",
                             {type: "checkbox", checked: data.poolTlsEnabled || false, onChange: e => update('poolTlsEnabled', e.target.checked)}
                           ),
                           "Enable TLS"
                         )
                       ),
                       data.poolTlsEnabled && React.createElement(
                         Field,
                         {label: "Cipher String"},
                         React.createElement(
                           "input",
                           {className: "form-control", value: data.poolTlsCipher || '', onChange: e => update('poolTlsCipher', e.target.value), placeholder: "Default"}
                         )
                       )
                     )
                   )
            )
        );
    };

    // --- Step 4: Members ---
    const Step4_Members = ({ data, update, options }) => {
        const { Badge } = window.Octavia;
        const [selectedInst, setSelectedInst] = React.useState('');
        const availableInstances = (options.instances || []).filter(i => !(data.members || []).find(m => m.id === i.value));
        const [extIp, setExtIp] = React.useState('');
        const [extPort, setExtPort] = React.useState(80);
        const [extWeight, setExtWeight] = React.useState(1);

        const addInternal = () => {
            if (!selectedInst) return;
            const inst = options.instances.find(i => i.value === selectedInst);
            const newMember = {
                id: inst.value, name: inst.name, type: 'INTERNAL',
                address: '10.0.0.' + Math.floor(Math.random() * 255), // Mock
                port: 80, weight: 1, role: 'member'
            };
            update('members', [...(data.members || []), newMember]);
            setSelectedInst('');
        };

        const addExternal = () => {
            if (!extIp) return;
            const newMember = {
                id: 'ext-' + Math.floor(Math.random() * 10000),
                name: extIp, type: 'EXTERNAL',
                address: extIp, port: extPort, weight: extWeight, role: 'member'
            };
            update('members', [...(data.members || []), newMember]);
            setExtIp('');
        };

        const removeMember = (id) => {
            update('members', (data.members || []).filter(m => m.id !== id));
        };

        return (
            React.createElement(
              "div",
              null,
              !data.createPool ? React.createElement(
                     "div",
                     {className: "alert alert-warning"},
                     "Pool creation is disabled. No members can be added."
                   ) :
                    React.createElement(
                      "div",
                      null,
                      React.createElement(
                        "div",
                        {className: "row"},
                        React.createElement(
                          "div",
                          {className: "col-md-6"},
                          React.createElement(
                            "div",
                            {className: "panel panel-default"},
                            React.createElement(
                              "div",
                              {className: "panel-heading"},
                              "Add Instance Member"
                            ),
                            React.createElement(
                              "div",
                              {className: "panel-body"},
                              React.createElement(
                                "div",
                                {className: "input-group"},
                                React.createElement(
                                  "select",
                                  {className: "form-control", value: selectedInst, onChange: e => setSelectedInst(e.target.value)},
                                  React.createElement(
                                    "option",
                                    {value: true},
                                    "Select Instance..."
                                  ),
                                  availableInstances.map(i => React.createElement(
                              "option",
                              {key: i.value, value: i.value},
                              i.name
                            ))
                                ),
                                React.createElement(
                                  "span",
                                  {className: "input-group-btn"},
                                  React.createElement(
                                    "button",
                                    {className: "btn btn-success", onClick: addInternal, disabled: !selectedInst},
                                    "Add"
                                  )
                                )
                              )
                            )
                          )
                        ),
                        React.createElement(
                          "div",
                          {className: "col-md-6"},
                          React.createElement(
                            "div",
                            {className: "panel panel-default"},
                            React.createElement(
                              "div",
                              {className: "panel-heading"},
                              "Add External Member"
                            ),
                            React.createElement(
                              "div",
                              {className: "panel-body"},
                              React.createElement(
                                "div",
                                {className: "row"},
                                React.createElement(
                                  "div",
                                  {className: "col-xs-5"},
                                  React.createElement(
                                    "input",
                                    {className: "form-control input-sm", placeholder: "IP Address", value: extIp, onChange: e => setExtIp(e.target.value)}
                                  )
                                ),
                                React.createElement(
                                  "div",
                                  {className: "col-xs-3"},
                                  React.createElement(
                                    "input",
                                    {type: "number", className: "form-control input-sm", placeholder: "Port", value: extPort, onChange: e => setExtPort(parseInt(e.target.value))}
                                  )
                                ),
                                React.createElement(
                                  "div",
                                  {className: "col-xs-2"},
                                  React.createElement(
                                    "input",
                                    {type: "number", className: "form-control input-sm", placeholder: "Wgt", value: extWeight, onChange: e => setExtWeight(parseInt(e.target.value))}
                                  )
                                ),
                                React.createElement(
                                  "div",
                                  {className: "col-xs-2"},
                                  React.createElement(
                                    "button",
                                    {className: "btn btn-success btn-sm btn-block", onClick: addExternal, disabled: !extIp},
                                    "Add"
                                  )
                                )
                              )
                            )
                          )
                        )
                      ),
                      React.createElement(
                        "table",
                        {className: "table table-striped table-bordered"},
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
                              "Address"
                            ),
                            React.createElement(
                              "th",
                              null,
                              "Port"
                            ),
                            React.createElement(
                              "th",
                              null,
                              "Weight"
                            ),
                            React.createElement(
                              "th",
                              null,
                              "Type"
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
                          (data.members || []).length === 0 ? React.createElement(
                                      "tr",
                                      null,
                                      React.createElement(
                                        "td",
                                        {colSpan: "6", className: "text-center text-muted"},
                                        "No members defined"
                                      )
                                    ) :
                                    (data.members || []).map(m => (
                                        React.createElement(
                                          "tr",
                                          {key: m.id},
                                          React.createElement(
                                            "td",
                                            null,
                                            m.name
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            m.address
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            m.port
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            m.weight
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            React.createElement(
                                              Badge,
                                              {text: m.type || 'INTERNAL', tone: m.type === 'EXTERNAL' ? 'warning' : 'info'}
                                            )
                                          ),
                                          React.createElement(
                                            "td",
                                            {className: "text-right"},
                                            React.createElement(
                                              "button",
                                              {className: "btn btn-xs", style: { backgroundColor: '#b00020', color: '#fff', border: 'none', padding: '3px 8px' }, onClick: () => removeMember(m.id)},
                                              React.createElement(
                                                "i",
                                                {className: "fa fa-trash"}
                                              )
                                            )
                                          )
                                        )
                                    ))
                        )
                      )
                    )
            )
        );
    };

    // --- Step 5: Monitor ---
    const Step5_Monitor = ({ data, update }) => {
        const { Field } = window.Octavia;
        const types = ['HTTP', 'HTTPS', 'PING', 'TCP', 'TLS-HELLO', 'UDP-CONNECT', 'SCTP'];
        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
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
                        {type: "checkbox", checked: data.createMonitor, onChange: e => update('createMonitor', e.target.checked)}
                      ),
                      React.createElement(
                        "strong",
                        null,
                        "Create Health Monitor"
                      )
                    )
                  )
                )
              ),
              data.createMonitor && React.createElement(
                        "div",
                        {style: { borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }},
                        React.createElement(
                          "div",
                          {className: "row"},
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Name", required: true},
                              React.createElement(
                                "input",
                                {className: "form-control", value: data.monitorName || '', onChange: e => update('monitorName', e.target.value)}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Type", required: true},
                              React.createElement(
                                "select",
                                {className: "form-control", value: data.monitorType || 'HTTP', onChange: e => update('monitorType', e.target.value)},
                                types.map(t => React.createElement(
                 "option",
                 {key: t, value: t},
                 t
               ))
                              )
                            )
                          )
                        ),
                        (data.monitorType === 'HTTP' || data.monitorType === 'HTTPS') && React.createElement(
                                                                   "div",
                                                                   null,
                                                                   React.createElement(
                                                                     "div",
                                                                     {className: "row"},
                                                                     React.createElement(
                                                                       "div",
                                                                       {className: "col-md-4"},
                                                                       React.createElement(
                                                                         Field,
                                                                         {label: "HTTP Method"},
                                                                         React.createElement(
                                                                           "select",
                                                                           {className: "form-control", value: data.httpMethod || 'GET', onChange: e => update('httpMethod', e.target.value)},
                                                                           ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'OPTIONS', 'PATCH', 'CONNECT'].map(m => React.createElement(
                                                                                            "option",
                                                                                            {key: m, value: m},
                                                                                            m
                                                                                          ))
                                                                         )
                                                                       )
                                                                     ),
                                                                     React.createElement(
                                                                       "div",
                                                                       {className: "col-md-4"},
                                                                       React.createElement(
                                                                         Field,
                                                                         {label: "Expected Codes"},
                                                                         React.createElement(
                                                                           "input",
                                                                           {className: "form-control", value: data.expectedCodes || '200', onChange: e => update('expectedCodes', e.target.value), placeholder: "200, 200-204"}
                                                                         )
                                                                       )
                                                                     ),
                                                                     React.createElement(
                                                                       "div",
                                                                       {className: "col-md-4"},
                                                                       React.createElement(
                                                                         Field,
                                                                         {label: "URL Path"},
                                                                         React.createElement(
                                                                           "input",
                                                                           {className: "form-control", value: data.urlPath || '/', onChange: e => update('urlPath', e.target.value), placeholder: "/"}
                                                                         )
                                                                       )
                                                                     )
                                                                   )
                                                                 ),
                        React.createElement(
                          "div",
                          {className: "row"},
                          React.createElement(
                            "div",
                            {className: "col-md-3"},
                            React.createElement(
                              Field,
                              {label: "Delay (sec)", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.delay || 5, onChange: e => update('delay', parseInt(e.target.value))}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-3"},
                            React.createElement(
                              Field,
                              {label: "Timeout (sec)", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.timeout || 5, onChange: e => update('timeout', parseInt(e.target.value))}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-3"},
                            React.createElement(
                              Field,
                              {label: "Max Retries", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.maxRetries || 3, onChange: e => update('maxRetries', parseInt(e.target.value))}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-3"},
                            React.createElement(
                              Field,
                              {label: "Max Retries Down"},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.maxRetriesDown || 3, onChange: e => update('maxRetriesDown', parseInt(e.target.value))}
                              )
                            )
                          )
                        )
                      )
            )
        );
    };

    // Expose Steps
    window.Octavia = window.Octavia || {};
    window.Octavia.Steps = {
        Step1_Details,
        Step2_Listener,
        Step3_Pool,
        Step4_Members,
        Step5_Monitor
    };
})();

const DeleteConfirmModal = ({ lb, onClose, onConfirm, loading }) => (
    React.createElement(
      "div",
      {className: "modal fade in", style: { display: 'block' }},
      React.createElement(
        "div",
        {className: "modal-dialog"},
        React.createElement(
          "div",
          {className: "modal-content"},
          React.createElement(
            "div",
            {className: "modal-header"},
            React.createElement(
              "button",
              {type: "button", className: "close", onClick: onClose, "data-dismiss": "modal", "aria-label": "Close"},
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
              "Delete Load Balancer"
            )
          ),
          React.createElement(
            "div",
            {className: "modal-body"},
            React.createElement(
              "p",
              null,
              "Are you sure you want to delete",
              React.createElement(
                "strong",
                null,
                lb.name
              ),
              "?"
            ),
            React.createElement(
              "p",
              {className: "text-muted"},
              React.createElement(
                "small",
                null,
                "This action cannot be undone."
              )
            ),
            loading && React.createElement(
             "div",
             {className: "text-center"},
             React.createElement(
               "i",
               {className: "fa fa-spinner fa-spin"}
             ),
             " Deleting..."
           )
          ),
          React.createElement(
            "div",
            {className: "modal-footer"},
            React.createElement(
              "button",
              {className: "btn btn-link", onClick: onClose, disabled: loading},
              "Cancel"
            ),
            React.createElement(
              "button",
              {className: "btn btn-danger", onClick: onConfirm, disabled: loading},
              "Delete"
            )
          )
        )
      ),
      React.createElement(
        "div",
        {className: "modal-backdrop fade in"}
      )
    )
);

// Expose to global
window.Octavia = window.Octavia || {};
window.Octavia.DeleteConfirmModal = DeleteConfirmModal;

; (function () {

    const CreateWizard = ({ networkId, options, onCreated, onClose }) => {
        const Api = window.Octavia.api;
        const { Field, Badge } = window.Octavia; // Moved inside
        const { Step1_Details, Step2_Listener, Step3_Pool, Step4_Members, Step5_Monitor } = window.Octavia.Steps; // Moved inside

        const [step, setStep] = React.useState(1);
        const [validationMsg, setValidationMsg] = React.useState('');
        const [data, setData] = React.useState({
            networkId,
            createListener: true,
            createPool: true,
            createMonitor: true,
            listenerProtocol: 'HTTP', listenerPort: 80,
            poolProtocol: 'HTTP', poolAlgorithm: 'ROUND_ROBIN',
            monitorType: 'HTTP', members: []
        });
        const [loading, setLoading] = React.useState(false);

        const update = (k, v) => setData(p => ({ ...p, [k]: v }));

        // Auto-select first subnet
        React.useEffect(() => {
            if (options && options.subnets && options.subnets.length > 0 && !data.vipSubnetId) {
                // Assuming options.subnets is array of {name, value} or similar
                update('vipSubnetId', options.subnets[0].value);
            }
        }, [options]);

        const validateStep = (s) => {
            if (s === 1) {
                if (!data.name || !data.name.trim()) return "Name is required.";
                if (!data.vipSubnetId) return "VIP Subnet is required.";
            }
            if (s === 2 && data.createListener) {
                if (!data.listenerName || !data.listenerName.trim()) return "Listener Name is required.";
                if (!data.listenerProtocol) return "Listener Protocol is required.";
                if (!data.listenerPort) return "Listener Port is required.";
            }
            if (s === 3 && data.createPool) {
                if (!data.poolName || !data.poolName.trim()) return "Pool Name is required.";
                if (data.sessionPersistence === 'APP_COOKIE' && (!data.cookieName || !data.cookieName.trim())) return "Cookie Name is required.";
            }
            if (s === 5 && data.createMonitor) {
                if (!data.monitorName || !data.monitorName.trim()) return "Monitor Name is required.";
                if (!data.monitorType) return "Monitor Type is required.";
                if (!data.delay) return "Delay is required.";
                if (!data.timeout) return "Timeout is required.";
                if (!data.maxRetries) return "Max Retries is required.";
            }
            return null;
        };

        const handleNext = () => {
            const err = validateStep(step);
            if (err) {
                setValidationMsg(err);
                return;
            }
            setValidationMsg('');
            setStep(step + 1);
        };

        const handlePrevious = () => {
            setValidationMsg('');
            setStep(step - 1);
        };

        const handleTabClick = (targetStep) => {
            if (targetStep > step) {
                // If trying to jump forward, validate current step first
                const err = validateStep(step);
                if (err) {
                    setValidationMsg(err);
                    return;
                }
            }
            setValidationMsg('');
            setStep(targetStep);
        };

        const submit = () => {
            const err = validateStep(5);
            if (err) {
                setValidationMsg(err);
                return;
            }
            setValidationMsg('');
            setLoading(true);
            window.Octavia.api.createLoadBalancer(data)
                .then(() => {
                    setLoading(false);
                    onCreated();
                })
                .catch(e => {
                    setLoading(false);
                    setValidationMsg('Error: ' + e.message);
                });
        };

        const renderStep = () => {
            switch (step) {
                case 1: return React.createElement(
                                 Step1_Details,
                                 {data: data, update: update, options: options}
                               );
                case 2: return React.createElement(
                                 Step2_Listener,
                                 {data: data, update: update}
                               );
                case 3: return React.createElement(
                                 Step3_Pool,
                                 {data: data, update: update}
                               );
                case 4: return React.createElement(
                                 Step4_Members,
                                 {data: data, update: update, options: options}
                               );
                case 5: return React.createElement(
                                 Step5_Monitor,
                                 {data: data, update: update}
                               );
                default: return React.createElement(
                                  "div",
                                  null,
                                  "Unknown Step"
                                );
            }
        };

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
                      {type: "button", className: "close", "data-dismiss": "modal", "aria-label": "Close", onClick: onClose},
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
                      "Create Load Balancer"
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
                        {className: "breadcrumbs"},
                        React.createElement(
                          "li",
                          {className: step === 1 ? 'bc active' : 'bc', onClick: () => handleTabClick(1), style: { cursor: 'pointer' }},
                          "Details"
                        ),
                        React.createElement(
                          "li",
                          {className: step === 2 ? 'bc active' : 'bc', onClick: () => handleTabClick(2), style: { cursor: 'pointer' }},
                          "Listener"
                        ),
                        React.createElement(
                          "li",
                          {className: step === 3 ? 'bc active' : 'bc', onClick: () => handleTabClick(3), style: { cursor: 'pointer' }},
                          "Pool"
                        ),
                        React.createElement(
                          "li",
                          {className: step === 4 ? 'bc active' : 'bc', onClick: () => handleTabClick(4), style: { cursor: 'pointer' }},
                          "Members"
                        ),
                        React.createElement(
                          "li",
                          {className: step === 5 ? 'bc active' : 'bc', onClick: () => handleTabClick(5), style: { cursor: 'pointer' }},
                          "Monitor"
                        )
                      )
                    ),
                    renderStep()
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-footer"},
                    React.createElement(
                      "button",
                      {className: "btn btn-default", onClick: onClose},
                      "Cancel"
                    ),
                    step > 1 && React.createElement(
              "button",
              {className: "btn btn-default", onClick: handlePrevious},
              "Previous"
            ),
                    step < 5 && React.createElement(
              "button",
              {className: "btn btn-primary", onClick: handleNext},
              "Next"
            ),
                    step === 5 && React.createElement(
                "button",
                {className: "btn btn-success", onClick: submit, disabled: loading},
                loading ? 'Creating...' : 'Create Load Balancer'
              )
                  )
                )
              )
            )
        );
    };

    window.Octavia.CreateWizard = CreateWizard;
})();

; (function () {
    const EditLBModal = ({ lb, networkId, onClose, onUpdated }) => {
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
              {className: "modal fade in", style: { display: 'block', overflow: 'auto' }},
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
                      {type: "button", className: "close", onClick: onClose, "data-dismiss": "modal", "aria-label": "Close"},
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
                    {className: "modal-body", style: { padding: 0 }},
                    React.createElement(
                      "div",
                      {className: "tab-container"},
                      React.createElement(
                        "ul",
                        {className: "nav nav-tabs", style: { paddingLeft: 20, paddingTop: 10 }},
                        editTabs.map((t, i) => (
                                        React.createElement(
                                          "li",
                                          {key: t.key, className: tab === t.key ? 'active' : ''},
                                          React.createElement(
                                            "a",
                                            {href: "#", onClick: (e) => { e.preventDefault(); setTab(t.key); }},
                                            t.title
                                          )
                                        )
                                    ))
                      ),
                      React.createElement(
                        "div",
                        {className: "tab-content", style: { padding: 20 }},
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
                    )
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-footer"},
                    React.createElement(
                      "button",
                      {className: "btn btn-link", onClick: onClose},
                      "Cancel"
                    ),
                    React.createElement(
                      "button",
                      {className: "btn btn-primary", onClick: save, disabled: saving || loading},
                      saving ? 'Saving...' : 'Save Changes'
                    )
                  )
                )
              ),
              React.createElement(
                "div",
                {className: "modal-backdrop fade in"}
              )
            )
        );
    };

    window.Octavia.EditLBModal = EditLBModal;
})();

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

; (function () {
    const InstanceView = ({ instanceId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync } = window.Octavia;

        const lbState = useAsync(() => Api.listLoadBalancers({ instanceId }), [instanceId])

        if (lbState.error) return React.createElement(
                                    "div",
                                    {className: "alert alert-danger"},
                                    lbState.error.message
                                  )
        if (lbState.loading) return React.createElement(
                                      "div",
                                      {style: { padding: 20, textAlign: 'center' }},
                                      React.createElement(
                                        "span",
                                        {style: { display: 'inline-block', width: 16, height: 16, border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}
                                      ),
                                      " Loading..."
                                    )
        const lbs = lbState.data?.loadbalancers || []
        if (lbs.length === 0) return React.createElement(
                                       "div",
                                       {className: "alert alert-info"},
                                       "This instance is not a member of any Load Balancers."
                                     )

        return (
            React.createElement(
              "div",
              {className: "container-fluid", style: { padding: '0 12px' }},
              React.createElement(
                "h4",
                {style: { textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', color: '#2d6ca2', marginBottom: 15 }},
                "Load balancers associated with this instance"
              ),
              React.createElement(
                "p",
                {className: "text-muted", style: { marginBottom: 15, fontSize: '0.9em' }},
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
                      {style: { textTransform: 'uppercase', fontSize: '0.85em', fontWeight: 600 }},
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
                                      {href: '/infrastructure/networks/' + (lb.networkId || '') + '#!octavia-network-tab', style: { fontWeight: 'bold', color: '#2d6ca2', textDecoration: 'none' }, title: "View in Network detail Octavia tab"},
                                      lb.name
                                    )
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
                                      {text: lb.provisioning_status || 'ACTIVE', tone: (lb.provisioning_status || 'ACTIVE') === 'ACTIVE' ? 'success' : 'warning'}
                                    )
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    (lb.members || []).length
                                  ),
                                  React.createElement(
                                    "td",
                                    null,
                                    React.createElement(
                                      "a",
                                      {href: '/infrastructure/networks/' + (lb.networkId || ''), style: { color: '#2d6ca2' }},
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

/**
 * Octavia Load Balancer UI
 * Refactored into components.
 */

// Define Namespace
window.Octavia = window.Octavia || {};

// Load Components
//= require js/components/Shared.jsx
//= require js/components/Api.jsx
//= require js/components/WizardSteps.jsx
//= require js/components/DeleteConfirmModal.jsx
//= require js/components/CreateWizard.jsx
//= require js/components/EditLBModal.jsx
//= require js/components/NetworkView.jsx
//= require js/components/InstanceView.jsx

console.log('Octavia UI Components Loaded.');

const mountNode = document.getElementById('octavia-loadbalancer-view')
const pluginCode = mountNode?.dataset?.pluginCode || 'octavia1234'

// Initialize API
window.Octavia.api = window.Octavia.makeApi(pluginCode);

const { NetworkView, InstanceView } = window.Octavia;

const App = () => {
  const root = document.getElementById('octavia-loadbalancer-view')
  // Primary source: data attributes rendered by the handlebars view.
  let model = root?.dataset.model
  let id = root?.dataset.id

  // Fallback: derive context from the URL if the template data was not populated
  if (!model || !id) {
    const path = window.location.pathname.split('/').filter(Boolean)
    const instIdx = path.indexOf('instances')
    const netIdx = path.indexOf('networks')
    if (instIdx !== -1 && path[instIdx + 1]) {
      model = 'instance'
      id = path[instIdx + 1]
    } else if (netIdx !== -1 && path[netIdx + 1]) {
      model = 'network'
      id = path[netIdx + 1]
    }
  }

  const networkId = model === 'network' ? id : null
  const instanceId = model === 'instance' ? id : null
  if (networkId) return React.createElement(
                          "div",
                          {className: "octavia-plugin"},
                          React.createElement(
                            NetworkView,
                            {networkId: networkId}
                          )
                        )
  if (instanceId) return React.createElement(
                           "div",
                           {className: "octavia-plugin"},
                           React.createElement(
                             InstanceView,
                             {instanceId: instanceId}
                           )
                         )
  return React.createElement(
           "div",
           {className: "alert alert-warning octavia-plugin"},
           "Context missing."
         )
}


if (ReactDOM.createRoot) {
  ReactDOM.createRoot(mountNode).render(React.createElement(
                                          App,
                                          null
                                        ))
} else {
  ReactDOM.render(React.createElement(
                    App,
                    null
                  ), mountNode)
}

