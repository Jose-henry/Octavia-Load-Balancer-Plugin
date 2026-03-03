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
            {onClick: onClose, style: {
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    padding: 0,
                    marginLeft: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }, "aria-label": "Close"},
            React.createElement(
              "svg",
              {xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 59.9 59.9", style: { width: 14, height: 14 }},
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
                let url = withContext(`${baseUrl}/loadbalancers`, ctx);
                if (ctx && (ctx.max != null || ctx.offset != null)) {
                    const sep = url.includes('?') ? '&' : '?';
                    if (ctx.max != null) url += `${sep}max=${encodeURIComponent(ctx.max)}`;
                    if (ctx.offset != null) url += `&offset=${encodeURIComponent(ctx.offset)}`;
                }
                return apiFetch(url);
            },

            getLoadBalancer: (lbId, ctx) => {
                return apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx));
            },

            createLoadBalancer: (payload) => {
                return apiFetch(`${baseUrl}/loadbalancersCreate`, { method: 'POST', body: JSON.stringify(payload) });
            },

            updateLoadBalancer: (lbId, payload) => {
                const body = { ...payload, id: lbId };
                const q = [];
                if (payload.listenerId) q.push('listenerId=' + encodeURIComponent(payload.listenerId));
                if (payload.poolId) q.push('poolId=' + encodeURIComponent(payload.poolId));
                if (payload.healthmonitorId) q.push('healthmonitorId=' + encodeURIComponent(payload.healthmonitorId));
                const url = q.length ? `${baseUrl}/loadbalancerUpdate?${q.join('&')}` : `${baseUrl}/loadbalancerUpdate`;
                return apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
            },

            deleteLoadBalancer: (lbId, networkId) => {
                return apiFetch(`${baseUrl}/loadbalancersDelete`, { method: 'POST', body: JSON.stringify({ lbId, networkId }) });
            },

            getProjects: (ctx) => apiFetch(withContext(`${baseUrl}/optionProjects`, ctx)),
            getInstances: (ctx) => apiFetch(withContext(`${baseUrl}/optionInstances`, ctx)),
            getFloatingIpPools: (ctx) => apiFetch(withContext(`${baseUrl}/optionFloatingIpPools`, ctx)),

            // Helpers for Edit Modal
            listListeners: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx))
                .then(r => ({ listeners: r.loadbalancer?.listeners || [], loadbalancer: r.loadbalancer })),

            listPools: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx))
                .then(r => ({ pools: r.loadbalancer?.pools || [] })),

            getHealthMonitor: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancerDetails?id=${lbId}`, ctx))
                .then(r => {
                    const pools = r.loadbalancer?.pools || [];
                    const poolWithMonitor = pools.find(p => p.healthmonitor || p.healthmonitor_id);
                    const monitor = poolWithMonitor?.healthmonitor || null;
                    return { monitor };
                }),

            attachFloatingIp: (lbId, selection, networkId) => apiFetch(`${baseUrl}/floatingipAttach`, { method: 'POST', body: JSON.stringify({ lbId, floatingIpPoolId: selection, networkId }) }),

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
            set(prev => ({ ...prev, loading: true }))
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

        const cloud = options?.optionClouds?.[0]?.name || options?.cloud?.name || data?.cloud?.name || 'None';
        const resourcePool = options?.optionResourcePools?.[0]?.name || 'None';

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
                    {label: "Cloud"},
                    React.createElement(
                      "input",
                      {className: "form-control", value: cloud, readOnly: true, disabled: true}
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
                      {className: "form-control", value: resourcePool, readOnly: true, disabled: true}
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
    const Step2_Listener = ({ data, update, hideCreateToggle = false }) => {
        const { Field } = window.Octavia;
        const protocols = ['HTTP', 'HTTPS', 'TERMINATED_HTTPS', 'TCP', 'UDP', 'SCTP'];
        const showHeaders = ['HTTP', 'TERMINATED_HTTPS'].includes(data.listenerProtocol);
        const showTls = data.listenerProtocol === 'TERMINATED_HTTPS';
        const hideTimeouts = ['UDP', 'SCTP'].includes(data.listenerProtocol);

        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
              !hideCreateToggle && React.createElement(
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
                   null,
                   React.createElement(
                     "div",
                     {className: "row"},
                     React.createElement(
                       "div",
                       {className: "col-md-6"},
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
                       {className: "col-md-6"},
                       React.createElement(
                         Field,
                         {label: "TCP Inspect Timeout"},
                         React.createElement(
                           "input",
                           {type: "number", className: "form-control", value: data.tcpInspectTimeout || 0, onChange: e => update('tcpInspectTimeout', parseInt(e.target.value))}
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
                         {label: "Member Connect Timeout"},
                         React.createElement(
                           "input",
                           {type: "number", className: "form-control", value: data.memberConnectTimeout || 5000, onChange: e => update('memberConnectTimeout', parseInt(e.target.value))}
                         )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "col-md-6"},
                       React.createElement(
                         Field,
                         {label: "Member Data Timeout"},
                         React.createElement(
                           "input",
                           {type: "number", className: "form-control", value: data.memberDataTimeout || 50000, onChange: e => update('memberDataTimeout', parseInt(e.target.value))}
                         )
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
    const Step3_Pool = ({ data, update, hideCreateToggle = false }) => {
        const { Field } = window.Octavia;
        const algorithms = ['ROUND_ROBIN', 'LEAST_CONNECTIONS', 'SOURCE_IP'];
        const protocols = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SCTP'];

        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
              !hideCreateToggle && React.createElement(
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

            // Collect all available IPs for this instance so the user can choose later
            const availableIps = [];
            if (inst.ip && inst.ip !== '0.0.0.0') {
                availableIps.push({ label: `Internal — ${inst.ip}`, value: inst.ip });
            }
            if (inst.externalIp && inst.externalIp !== inst.ip) {
                availableIps.push({ label: `External — ${inst.externalIp}`, value: inst.externalIp });
            }
            // Fallback: if we somehow have no IPs at all
            if (availableIps.length === 0) {
                availableIps.push({ label: '0.0.0.0', value: '0.0.0.0' });
            }

            const newMember = {
                id: inst.value,
                name: inst.name,
                type: 'INTERNAL',
                availableIps,                     // all IPs the dropdown will show
                address: availableIps[0].value,   // default to internal IP
                port: 80,
                weight: 1,
                role: 'member'
            };
            update('members', [...(data.members || []), newMember]);
            setSelectedInst('');
        };

        const addExternal = () => {
            if (!extIp) return;
            const newMember = {
                id: 'ext-' + Math.floor(Math.random() * 10000),
                name: extIp,
                type: 'EXTERNAL',
                availableIps: [{ label: extIp, value: extIp }],
                address: extIp,
                port: extPort,
                weight: extWeight,
                role: 'member'
            };
            update('members', [...(data.members || []), newMember]);
            setExtIp('');
        };

        const removeMember = (id) => {
            update('members', (data.members || []).filter(m => m.id !== id));
        };

        const updateMember = (id, field, value) => {
            update('members', (data.members || []).map(m => m.id === id ? { ...m, [field]: value } : m));
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
                                            (m.availableIps && m.availableIps.length > 1) ? (
                                                    React.createElement(
                                                      "select",
                                                      {className: "form-control input-sm", style: { minWidth: 200 }, value: m.address, onChange: e => updateMember(m.id, 'address', e.target.value)},
                                                      m.availableIps.map(ip => (
                                                            React.createElement(
                                                              "option",
                                                              {key: ip.value, value: ip.value},
                                                              ip.label
                                                            )
                                                        ))
                                                    )
                                                ) : (
                                                    m.address
                                                )
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            React.createElement(
                                              "input",
                                              {type: "number", className: "form-control input-sm", style: { width: 80 }, value: m.port, onChange: e => updateMember(m.id, 'port', parseInt(e.target.value) || 80)}
                                            )
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            React.createElement(
                                              "input",
                                              {type: "number", className: "form-control input-sm", style: { width: 80 }, value: m.weight, onChange: e => updateMember(m.id, 'weight', parseInt(e.target.value) || 1)}
                                            )
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
                                              {className: "btn btn-xs", style: { backgroundColor: '#b00020', color: '#fff', border: 'none', padding: '4px 8px', fontWeight: 'bold' }, onClick: () => removeMember(m.id)},
                                              React.createElement(
                                                "i",
                                                {className: "fa fa-trash"}
                                              ),
                                              " REMOVE"
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
    const Step5_Monitor = ({ data, update, hideCreateToggle = false }) => {
        const { Field } = window.Octavia;
        const types = ['HTTP', 'HTTPS', 'PING', 'TCP', 'TLS-HELLO', 'UDP-CONNECT', 'SCTP'];
        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
              !hideCreateToggle && React.createElement(
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
                                                                       {className: "col-md-6"},
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
                                                                       {className: "col-md-6"},
                                                                       React.createElement(
                                                                         Field,
                                                                         {label: "Expected Codes"},
                                                                         React.createElement(
                                                                           "input",
                                                                           {className: "form-control", value: data.expectedCodes || '200', onChange: e => update('expectedCodes', e.target.value), placeholder: "200, 200-204"}
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
                            {className: "col-md-6"},
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
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Timeout (sec)", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.timeout || 5, onChange: e => update('timeout', parseInt(e.target.value))}
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
                              {label: "Max Retries", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.maxRetries || 3, onChange: e => update('maxRetries', parseInt(e.target.value))}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
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
      {className: "modal fade in", style: { display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', overflowY: 'auto' }},
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
              ' ',
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
      )
    )
);

// Expose to global
window.Octavia = window.Octavia || {};
window.Octavia.DeleteConfirmModal = DeleteConfirmModal;

; (function () {
    const FloatingIpModal = ({ lb, options, onClose, onAttach }) => {
        const [selection, setSelection] = React.useState('');
        const [submitting, setSubmitting] = React.useState(false);

        const pools = options?.floatingIpPools || options?.optionFloatingIpPools || [];
        const ips = options?.availableFloatingIps || [];

        React.useEffect(() => {
            // Preselect first pool if available
            if (!selection) {
                const first = (pools[0]?.value) || (ips[0]?.value) || '';
                if (first) setSelection(first);
            }
        }, [pools, ips]);

        return (
            React.createElement(
              "div",
              {className: "modal fade in", style: {
                    display: 'block',
                    backgroundColor: 'rgba(0,0,0,0.5)'
                }},
              React.createElement(
                "div",
                {className: "modal-dialog", style: { width: 640 }},
                React.createElement(
                  "div",
                  {className: "modal-content"},
                  React.createElement(
                    "div",
                    {className: "modal-header"},
                    React.createElement(
                      "button",
                      {type: "button", className: "close", onClick: onClose, "aria-label": "Close"},
                      React.createElement(
                        "span",
                        {"aria-hidden": "true"},
                        React.createElement(
                          "svg",
                          {version: "1.1", className: "close-icon", xmlns: "http://www.w3.org/2000/svg", xmlnsXlink: "http://www.w3.org/1999/xlink", x: "0px", y: "0px", viewBox: "0 0 59.9 59.9", enableBackground: "new 0 0 59.9 59.9", xmlSpace: "preserve"},
                          React.createElement(
                            "line",
                            {fill: "none", stroke: "currentcolor", strokeMiterlimit: "10", x1: "57.4", y1: "2.5", x2: "2.5", y2: "57.4"}
                          ),
                          React.createElement(
                            "line",
                            {fill: "none", stroke: "currentcolor", strokeMiterlimit: "10", x1: "2.5", y1: "2.5", x2: "57.4", y2: "57.4"}
                          )
                        )
                      )
                    ),
                    React.createElement(
                      "h4",
                      {className: "modal-title"},
                      "Attach Floating IP"
                    )
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-body"},
                    React.createElement(
                      "div",
                      {className: "text-center", style: { marginBottom: 15 }},
                      "Are you sure you would like to attach this floating IP?"
                    ),
                    React.createElement(
                      "div",
                      {className: "form-horizontal form-basic"},
                      React.createElement(
                        "div",
                        {className: "form-group"},
                        React.createElement(
                          "div",
                          {className: "option-row"},
                          React.createElement(
                            "label",
                            {className: "control-label col-sm-3"},
                            "Floating IP"
                          ),
                          React.createElement(
                            "div",
                            {className: "col-sm-9 option-type-input-row option-type-row-wrapper"},
                            React.createElement(
                              "span",
                              {className: "required-bar"}
                            ),
                            React.createElement(
                              "select",
                              {className: "form-control input-sm", value: selection, onChange: (e) => setSelection(e.target.value)},
                              pools.length > 0 && (
                                                    React.createElement(
                                                      "optgroup",
                                                      {label: "Pools"},
                                                      pools.map(p => (
                                                            React.createElement(
                                                              "option",
                                                              {key: p.value, value: p.value},
                                                              p.name
                                                            )
                                                        ))
                                                    )
                                                ),
                              ips.length > 0 && (
                                                    React.createElement(
                                                      "optgroup",
                                                      {label: "Available IPs"},
                                                      ips.map(ip => (
                                                            React.createElement(
                                                              "option",
                                                              {key: ip.value, value: ip.value},
                                                              ip.name
                                                            )
                                                        ))
                                                    )
                                                ),
                              pools.length === 0 && ips.length === 0 && (
                                                    React.createElement(
                                                      "option",
                                                      {value: true},
                                                      "No floating IP pools or IPs available"
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
                      {type: "button", className: "btn btn-primary", onClick: onClose, disabled: submitting},
                      "Cancel"
                    ),
                    React.createElement(
                      "button",
                      {type: "button", className: "btn btn-primary", onClick: () => {
                                    setSubmitting(true);
                                    Promise.resolve(onAttach(selection))
                                        .finally(() => setSubmitting(false));
                                }, disabled: !selection || submitting},
                      submitting ? 'Loading...' : 'Execute'
                    )
                  )
                )
              )
            )
        )
    }

    window.Octavia.FloatingIpModal = FloatingIpModal;
})();


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
            monitorType: 'HTTP', members: [],
            delay: 5, timeout: 5, maxRetries: 3, maxRetriesDown: 3,
            httpMethod: 'GET', expectedCodes: '200', urlPath: '/'
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
                .then(res => {
                    setLoading(false);
                    if (res && res.success === false) {
                        const raw = res.msg || res.error || 'Unknown error occurred';
                        setValidationMsg(formatCreateError(raw));
                    } else {
                        onCreated();
                    }
                })
                .catch(e => {
                    setLoading(false);
                    const raw = e.message || e.error || 'Network error';
                    setValidationMsg(formatCreateError(raw));
                });
        };

        function formatCreateError(raw) {
            const isIpAddressError = typeof raw === 'string' && (
                /IPv4 or IPv6 address/i.test(raw) ||
                /does not appear to be.*address/i.test(raw)
            );
            if (isIpAddressError && (data.members || []).length > 0) {
                return raw + ' This often happens when a pool member (same IP and port) is already in use on another load balancer. Try using a different port for that member, or remove it from the other load balancer first.';
            }
            return raw.startsWith('Error:') ? raw : 'Error: ' + raw;
        }

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
                        {className: "breadcrumbs", style: { paddingLeft: 0, margin: 0 }},
                        React.createElement(
                          "li",
                          {className: `bc ${step === 1 ? 'active' : step > 1 ? 'prevActive' : ''}`, onClick: () => handleTabClick(1), style: { cursor: 'pointer' }},
                          "Details"
                        ),
                        React.createElement(
                          "li",
                          {className: `bc ${step === 2 ? 'active' : step > 2 ? 'prevActive' : ''}`, onClick: () => handleTabClick(2), style: { cursor: 'pointer' }},
                          "Listener"
                        ),
                        React.createElement(
                          "li",
                          {className: `bc ${step === 3 ? 'active' : step > 3 ? 'prevActive' : ''}`, onClick: () => handleTabClick(3), style: { cursor: 'pointer' }},
                          "Pool"
                        ),
                        React.createElement(
                          "li",
                          {className: `bc ${step === 4 ? 'active' : step > 4 ? 'prevActive' : ''}`, onClick: () => handleTabClick(4), style: { cursor: 'pointer' }},
                          "Members"
                        ),
                        React.createElement(
                          "li",
                          {className: `bc ${step === 5 ? 'active' : step > 5 ? 'prevActive' : ''}`, onClick: () => handleTabClick(5), style: { cursor: 'pointer' }},
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
                    newD.listenerId = l.id;
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
                    newD.poolId = p.id;
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
                    newD.healthmonitorId = m.id;
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
//= require js/components/FloatingIpModal.jsx
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

