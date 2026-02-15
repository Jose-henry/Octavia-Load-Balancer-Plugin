/**
 * Octavia Load Balancer UI
 * Renders inside network or instance tabs. Relies on Morpheus plugin endpoints.
 */
console.log('Octavia UI Script Executing...');

// helper: fetch JSON with same-origin cookies and CSRF header
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

const useAsync = (fn, deps) => {
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

const Badge = ({ text, tone = 'info' }) =>
  React.createElement(
    "span",
    {className: `label label-${tone}`, style: { marginRight: 6, borderRadius: 3, padding: '3px 8px', fontSize: '0.8em' }},
    text
  )

const Field = ({ label, children, help, required }) => (
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
)

// ----------- Mock Data & API (Demo Mode) -------------

// In-memory "database" for the UI demo

// --- Real API ---
const makeApi = (pluginCode) => {
  const baseUrl = `/plugin/${pluginCode}`;

  // Helper to append context params
  const withContext = (url, ctx) => {
    const params = [];
    if (ctx && ctx.networkId) params.push('networkId=' + ctx.networkId);
    if (ctx && ctx.instanceId) params.push('instanceId=' + ctx.instanceId);
    if (params.length === 0) return url;
    return url + (url.includes('?') ? '&' : '?') + params.join('&');
  };

  return {
    listLoadBalancers: (ctx) => {
      return apiFetch(withContext(`${baseUrl}/loadbalancers`, ctx));
    },

    getLoadBalancer: (lbId, ctx) => {
      return apiFetch(withContext(`${baseUrl}/loadbalancers/details?id=${lbId}`, ctx));
    },

    createLoadBalancer: (payload) => {
      return apiFetch(`${baseUrl}/loadbalancers/create`, { method: 'POST', body: JSON.stringify(payload) });
    },

    updateLoadBalancer: (lbId, payload) => {
      return apiFetch(`${baseUrl}/loadbalancers/update`, { method: 'POST', body: JSON.stringify({ ...payload, id: lbId }) });
    },

    deleteLoadBalancer: (lbId, networkId) => {
      return apiFetch(`${baseUrl}/loadbalancers/delete`, { method: 'POST', body: JSON.stringify({ lbId, networkId }) });
    },

    listOptions: (networkId, instanceId) => {
      const types = ['projects', 'subnets', 'instances', 'floatingIpPools'];
      const ctx = { networkId, instanceId };
      return Promise.all(types.map(t =>
        apiFetch(withContext(`${baseUrl}/options/${t}`, ctx))
      )).then(results => results.reduce((acc, curr) => ({ ...acc, ...curr }), {}));
    },

    // Helpers for Edit Modal
    listListeners: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancers/details?id=${lbId}`, ctx)).then(r => ({ listeners: r.loadbalancer?.listeners || [] })),

    listPools: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancers/details?id=${lbId}`, ctx)).then(r => ({ pools: r.loadbalancer?.pools || [] })),

    getHealthMonitor: (lbId, ctx) => apiFetch(withContext(`${baseUrl}/loadbalancers/details?id=${lbId}`, ctx)).then(r => {
      const pools = r.loadbalancer?.pools || [];
      const monitorId = pools.find(p => p.healthmonitor_id)?.healthmonitor_id;
      return { monitor: monitorId ? { id: monitorId } : null };
    }),

    attachFloatingIp: (lbId, fipPoolId, networkId) => apiFetch(`${baseUrl}/floatingip/attach`, { method: 'POST', body: JSON.stringify({ lbId, floatingIpPoolId, networkId }) }),

    detachFloatingIp: (lbId, networkId) => apiFetch(`${baseUrl}/floatingip/detach`, { method: 'POST', body: JSON.stringify({ lbId, networkId }) })
  };
};

const mountNode = document.getElementById('octavia-loadbalancer-view')
const pluginCode = mountNode?.dataset?.pluginCode || 'octavia1234'
const Api = makeApi(pluginCode)


// -------------- Components --------------

const Toast = ({ msg, type, onClose }) => {
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

const DeleteConfirmModal = ({ lb, onClose, onConfirm, loading }) => (
  React.createElement(
    "div",
    {style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }},
    React.createElement(
      "div",
      {className: "panel panel-danger", style: { width: 420, boxShadow: '0 5px 15px rgba(0,0,0,0.3)', borderRadius: 0 }},
      React.createElement(
        "div",
        {className: "panel-heading", style: { background: '#d9534f', color: '#fff', borderRadius: 0 }},
        React.createElement(
          "h3",
          {className: "panel-title", style: { textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', color: '#fff' }},
          "Delete Load Balancer"
        )
      ),
      React.createElement(
        "div",
        {className: "panel-body", style: { padding: '25px 20px' }},
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
             {className: "text-center", style: { marginTop: 10 }},
             React.createElement(
               "span",
               {style: { display: 'inline-block', width: 14, height: 14, border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}
             ),
             " Deleting..."
           )
      ),
      React.createElement(
        "div",
        {className: "panel-footer text-right", style: { background: '#fff', padding: '12px 20px' }},
        React.createElement(
          "button",
          {className: "btn btn-default", onClick: onClose, disabled: loading, style: { textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em' }},
          "Cancel"
        ),
        React.createElement(
          "button",
          {className: "btn btn-danger", onClick: onConfirm, disabled: loading, style: { textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em', marginLeft: 10 }},
          "Delete"
        )
      )
    )
  )
);

// --- Create Wizard Steps ---
const Step1_Details = ({ data, update, options }) => (
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

const Step2_Listener = ({ data, update }) => {
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

const Step3_Pool = ({ data, update }) => {
  const algorithms = ['ROUND_ROBIN', 'LEAST_CONNECTIONS', 'SOURCE_IP'];
  const protocols = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SCTP']; // Pool protocol usually matches listener

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

const Step4_Members = ({ data, update, options }) => {
  // Internal Members
  const [selectedInst, setSelectedInst] = React.useState('');
  const availableInstances = (options.instances || []).filter(i => !(data.members || []).find(m => m.id === i.value));

  // External Members
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
                        {className: "btn btn-xs", style: { backgroundColor: '#b00020', color: '#fff', border: 'none', fontWeight: 600 }, onClick: () => removeMember(m.id)},
                        "&times;"
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

const Step5_Monitor = ({ data, update }) => {
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

const CreateWizard = ({ networkId, options, onCreated, onClose }) => {
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

  // Auto-select first subnet
  React.useEffect(() => {
    if (options.subnets?.length > 0 && !data.vipSubnetId) {
      setData(d => ({ ...d, vipSubnetId: options.subnets[0].value }));
    }
  }, [options.subnets]);

  const update = (k, v) => { setData(d => ({ ...d, [k]: v })); setValidationMsg(''); };
  const [saving, setSaving] = React.useState(false);

  // Step validation — blocks NEXT when required fields empty (unless section checkbox off)
  const validateStep = (s) => {
    if (s === 1) {
      if (!data.name || !data.name.trim()) return 'Name is required';
      if (!data.vipSubnetId) return 'VIP Subnet is required';
    }
    if (s === 2 && data.createListener) {
      if (!data.listenerName || !data.listenerName.trim()) return 'Listener Name is required';
      if (!data.listenerProtocol) return 'Protocol is required';
      const p = parseInt(data.listenerPort);
      if (!data.listenerPort || isNaN(p) || p < 1 || p > 65535) return 'Port must be between 1 and 65535';
    }
    if (s === 3 && data.createPool) {
      if (!data.poolName || !data.poolName.trim()) return 'Pool Name is required';
      if (!data.poolAlgorithm) return 'Algorithm is required';
    }
    if (s === 5 && data.createMonitor) {
      if (!data.monitorName || !data.monitorName.trim()) return 'Monitor Name is required';
      if (!data.monitorType) return 'Monitor Type is required';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { setValidationMsg(err); return; }
    setValidationMsg('');
    setStep(s => s + 1);
  };

  const finish = () => {
    const err = validateStep(step);
    if (err) { setValidationMsg(err); return; }
    setSaving(true);
    const payload = { ...data };
    if (!payload.createListener) { delete payload.listenerName; delete payload.listenerProtocol; }
    if (!payload.createPool) { delete payload.members; delete payload.poolName; }
    if (!payload.createMonitor) { delete payload.monitorName; }

    Api.createLoadBalancer(payload).then(res => {
      setSaving(false);
      if (res.success) onCreated();
      else alert(res.message || 'Error creating LB');
    }).catch(err => {
      setSaving(false);
      alert(err.message);
    });
  };

  const steps = [
    { num: 1, title: 'Load Balancer Details', comp: Step1_Details },
    { num: 2, title: 'Listener Details', comp: Step2_Listener },
    { num: 3, title: 'Pool Details', comp: Step3_Pool },
    { num: 4, title: 'Pool Members', comp: Step4_Members },
    { num: 5, title: 'Monitor Details', comp: Step5_Monitor }
  ];

  const CurrentComp = steps.find(s => s.num === step).comp;

  return (
    React.createElement(
      "div",
      {style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }},
      React.createElement(
        "div",
        {style: { width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 5px 30px rgba(0,0,0,0.4)', borderRadius: 0, overflow: 'hidden' }},
        React.createElement(
          "div",
          {style: { background: '#f9c600', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }},
          React.createElement(
            "span",
            {style: { color: '#fff', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }},
            "Create Load Balancer"
          ),
          React.createElement(
            "button",
            {onClick: onClose, style: { background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }},
            '\u00D7'
          )
        ),
        React.createElement(
          "div",
          {style: { background: '#fff', borderBottom: '2px solid #e1e3e5', padding: '0 20px', display: 'flex', alignItems: 'center', minHeight: 42 }},
          steps.map((s, i) => {
            const isActive = step === s.num;
            const isComplete = s.num < step;
            return (
              React.createElement(
                React.Fragment,
                {key: s.num},
                i > 0 && React.createElement(
           "span",
           {style: { margin: '0 8px', color: '#ccc', fontSize: 11 }},
           '>'
         ),
                React.createElement(
                  "span",
                  {style: { fontSize: '12px', textTransform: 'uppercase', fontWeight: isActive ? 700 : 400, color: isActive ? '#2d353c' : isComplete ? '#2d353c' : '#aaa', cursor: isComplete ? 'pointer' : 'default', letterSpacing: '0.5px' }, onClick: () => { if (isComplete) { setValidationMsg(''); setStep(s.num); } }},
                  s.title
                )
              )
            );
          })
        ),
        React.createElement(
          "div",
          {style: { flex: 1, background: '#fff', overflowY: 'auto', padding: '25px 30px' }},
          validationMsg && React.createElement(
                   "div",
                   {className: "alert alert-danger", style: { marginBottom: 15 }},
                   validationMsg
                 ),
          React.createElement(
            CurrentComp,
            {data: data, update: update, options: options}
          )
        ),
        React.createElement(
          "div",
          {style: { background: '#fff', borderTop: '1px solid #e1e3e5', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }},
          step > 1 && React.createElement(
              "button",
              {className: "btn btn-default", onClick: () => { setValidationMsg(''); setStep(s => s - 1); }, style: { textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em', padding: '8px 20px' }},
              "Previous"
            ),
          step < 5 && React.createElement(
              "button",
              {className: "btn", style: { backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em', padding: '8px 24px' }, onClick: goNext},
              "Next"
            ),
          step === 5 && React.createElement(
                "button",
                {className: "btn", style: { backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em', padding: '8px 24px' }, onClick: finish, disabled: saving},
                saving ? 'Creating...' : 'Finish'
              )
        )
      )
    )
  );
};

// --- Edit Modal Components ---
const EditLBModal = ({ lb, networkId, onClose, onUpdated }) => {
  const editTabs = [
    { key: 'general', title: 'General' },
    { key: 'listener', title: 'Listener' },
    { key: 'pool', title: 'Pool & Members' },
    { key: 'monitor', title: 'Monitor' }
  ];
  const [tab, setTab] = React.useState('general');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [data, setData] = React.useState({});

  React.useEffect(() => {
    setLoading(true);
    const ctx = { networkId };
    Promise.all([
      Api.listListeners(lb.id, ctx),
      Api.listPools(lb.id, ctx),
      Api.getHealthMonitor(lb.id, ctx)
    ]).then(([lRes, pRes, mRes]) => {
      const listener = lRes.listeners?.[0] || {};
      const pool = pRes.pools?.[0] || {};
      const monitor = mRes.monitor || {};
      setData({
        name: lb.name, description: lb.description, admin_state_up: lb.admin_state_up !== false,
        createListener: !!lRes.listeners?.length,
        listenerName: listener.name, listenerProtocol: listener.protocol,
        listenerPort: listener.protocolPort, connectionLimit: listener.connectionLimit,
        allowedCidrs: listener.allowedCidrs,
        insertXForwardedFor: listener.insertXForwardedFor,
        insertXForwardedPort: listener.insertXForwardedPort,
        insertXForwardedProto: listener.insertXForwardedProto,
        tlsCipherString: listener.tlsCipherString,
        createPool: !!pRes.pools?.length,
        poolName: pool.name, poolAlgorithm: pool.lbAlgorithm, poolDesc: pool.description,
        sessionPersistence: pool.sessionPersistence, cookieName: pool.cookieName,
        poolTlsEnabled: pool.tlsEnabled, poolTlsCipher: pool.tlsCipherString,
        members: (pool.members || []).map(m => ({ ...m, type: m.type || 'INTERNAL' })),
        createMonitor: !!mRes.monitor,
        monitorName: monitor.name, monitorType: monitor.type,
        delay: monitor.delay, timeout: monitor.timeout, maxRetries: monitor.maxRetries,
        httpMethod: monitor.httpMethod, urlPath: monitor.urlPath, expectedCodes: monitor.expectedCodes
      });
      setLoading(false);
    }).catch(err => {
      alert('Error loading details: ' + err.message);
      onClose();
    });
  }, [lb.id]);

  const update = (k, v) => setData(d => ({ ...d, [k]: v }));

  const save = () => {
    setSaving(true);
    // Explicitly pass networkId in payload for context resolution
    Api.updateLoadBalancer(lb.id, { ...data, networkId }).then(res => {
      setSaving(false);
      if (res.success) onUpdated();
      else alert(res.message);
    }).catch(err => {
      setSaving(false);
      alert(err.message);
    });
  };

  return (
    React.createElement(
      "div",
      {style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }},
      React.createElement(
        "div",
        {style: { width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 5px 30px rgba(0,0,0,0.4)', borderRadius: 0, overflow: 'hidden' }},
        React.createElement(
          "div",
          {style: { background: '#f9c600', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }},
          React.createElement(
            "span",
            {style: { color: '#fff', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }},
            "Edit Load Balancer"
          ),
          React.createElement(
            "button",
            {onClick: onClose, style: { background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }},
            '\u00D7'
          )
        ),
        React.createElement(
          "div",
          {style: { background: '#fff', borderBottom: '2px solid #e1e3e5', padding: '0 20px', display: 'flex', alignItems: 'center', minHeight: 42 }},
          editTabs.map((t, i) => {
            const isActive = tab === t.key;
            return (
              React.createElement(
                React.Fragment,
                {key: t.key},
                i > 0 && React.createElement(
           "span",
           {style: { margin: '0 8px', color: '#ccc', fontSize: 11 }},
           '>'
         ),
                React.createElement(
                  "span",
                  {style: { fontSize: '12px', textTransform: 'uppercase', fontWeight: isActive ? 700 : 400, color: isActive ? '#2d353c' : '#aaa', cursor: 'pointer', letterSpacing: '0.5px' }, onClick: () => setTab(t.key)},
                  t.title
                )
              )
            );
          })
        ),
        React.createElement(
          "div",
          {style: { flex: 1, background: '#fff', overflowY: 'auto', padding: '25px 30px' }},
          loading ? React.createElement(
            "div",
            {style: { textAlign: 'center', padding: 40 }},
            React.createElement(
              "span",
              {style: { display: 'inline-block', width: 16, height: 16, border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}
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
                      {style: { textTransform: 'uppercase', fontWeight: 600, marginBottom: 15 }},
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
        ),
        React.createElement(
          "div",
          {style: { background: '#fff', borderTop: '1px solid #e1e3e5', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }},
          React.createElement(
            "button",
            {className: "btn btn-default", onClick: onClose, style: { textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em', padding: '8px 20px' }},
            "Cancel"
          ),
          React.createElement(
            "button",
            {className: "btn", style: { backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em', padding: '8px 24px' }, onClick: save, disabled: saving || loading},
            saving ? 'Saving...' : 'Save Changes'
          )
        )
      )
    )
  );
};

// NetworkView — matches Morpheus list layout
const NetworkView = ({ networkId }) => {
  const [view, setView] = React.useState('list');
  const [selectedLb, setSelectedLb] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  const optionsState = useAsync(() => Api.listOptions(networkId), [networkId]);
  const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, toast]);

  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);

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

  return (
    React.createElement(
      "div",
      {style: { padding: '0' }},
      toast && React.createElement(
           Toast,
           {msg: toast.msg, type: toast.type, onClose: () => setToast(null)}
         ),
      deleteTarget && React.createElement(
                  DeleteConfirmModal,
                  {lb: deleteTarget, loading: deleting, onClose: () => setDeleteTarget(null), onConfirm: handleDelete}
                ),
      view === 'create' && React.createElement(
                       CreateWizard,
                       {networkId: networkId, options: options, onClose: () => setView('list'), onCreated: () => { setView('list'); setToast({ msg: 'Load Balancer created.', type: 'success' }); }}
                     ),
      view === 'edit' && selectedLb && React.createElement(
                                   EditLBModal,
                                   {lb: selectedLb, networkId: networkId, onClose: () => { setSelectedLb(null); setView('list'); }, onUpdated: () => { setSelectedLb(null); setView('list'); setToast({ msg: 'Load Balancer updated.', type: 'success' }); }}
                                 ),
      React.createElement(
        "div",
        {style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15, padding: '0 5px' }},
        React.createElement(
          "button",
          {className: "btn", style: { backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', padding: '6px 14px', fontSize: '0.85em' }, onClick: () => setView('create')},
          React.createElement(
            "i",
            {className: "fa fa-plus", style: { marginRight: 5 }}
          ),
          " Add"
        )
      ),
      React.createElement(
        "table",
        {className: "table", style: { borderCollapse: 'collapse' }},
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            {style: { borderBottom: '2px solid #e1e3e5' }},
            React.createElement(
              "th",
              {style: { textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }},
              "Name"
            ),
            React.createElement(
              "th",
              {style: { textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }},
              "VIP"
            ),
            React.createElement(
              "th",
              {style: { textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }},
              "Status"
            ),
            React.createElement(
              "th",
              {style: { textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }},
              "Members"
            ),
            React.createElement(
              "th",
              {style: { textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px', width: 80 }}
            )
          )
        ),
        React.createElement(
          "tbody",
          null,
          lbs.map(lb => (
            React.createElement(
              "tr",
              {key: lb.id, style: { borderBottom: '1px solid #eee' }},
              React.createElement(
                "td",
                {style: { padding: '12px', verticalAlign: 'middle', fontWeight: 500, color: '#333' }},
                lb.name
              ),
              React.createElement(
                "td",
                {style: { padding: '12px', verticalAlign: 'middle', color: '#555' }},
                lb.vipAddress
              ),
              React.createElement(
                "td",
                {style: { padding: '12px', verticalAlign: 'middle' }},
                React.createElement(
                  Badge,
                  {text: lb.provisioning_status, tone: lb.provisioning_status === 'ACTIVE' ? 'success' : 'warning'}
                )
              ),
              React.createElement(
                "td",
                {style: { padding: '12px', verticalAlign: 'middle', color: '#555' }},
                (lb.members || []).length
              ),
              React.createElement(
                "td",
                {style: { padding: '12px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }},
                React.createElement(
                  "button",
                  {className: "btn btn-default btn-sm", style: { marginRight: 6, padding: '3px 8px', fontSize: '12px' }, title: "Edit", onClick: () => { setSelectedLb(lb); setView('edit'); }},
                  React.createElement(
                    "i",
                    {className: "fas fa-pencil-alt"}
                  )
                ),
                React.createElement(
                  "button",
                  {className: "btn btn-danger btn-sm", style: { padding: '3px 8px', fontSize: '12px' }, title: "Delete", onClick: () => setDeleteTarget(lb)},
                  React.createElement(
                    "i",
                    {className: "fas fa-trash-alt"}
                  )
                )
              )
            )
          ))
        )
      ),
      lbs.length === 0 && React.createElement(
                      "div",
                      {style: { textAlign: 'center', padding: '30px 0', color: '#999' }},
                      "No Load Balancers found. Click \"+ Add\" to create one."
                    )
    )
  );
};

const InstanceView = ({ instanceId }) => {
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
                                 "This instance is not a member of any Octavia load balancer."
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
                  lb.vipAddress
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

const App = () => {
  const root = document.getElementById('octavia-loadbalancer-view')
  // Primary source: data attributes rendered by the handlebars view.
  let model = root?.dataset.model
  let id = root?.dataset.id

  // Fallback: derive context from the URL if the template data was not populated
  // (seen in some environments due to missing model/object binding).
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
                          NetworkView,
                          {networkId: networkId}
                        )
  if (instanceId) return React.createElement(
                           InstanceView,
                           {instanceId: instanceId}
                         )
  return React.createElement(
           "div",
           {className: "alert alert-warning"},
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

