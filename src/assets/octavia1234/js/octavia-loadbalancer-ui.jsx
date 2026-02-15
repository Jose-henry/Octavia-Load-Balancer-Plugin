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
  <span className={`label label-${tone}`} style={{ marginRight: 6, borderRadius: 3, padding: '3px 8px', fontSize: '0.8em' }}>{text}</span>

const Field = ({ label, children, help, required }) => (
  <div className="form-group">
    <label className="control-label">{label}{required ? <span className="text-danger"> *</span> : null}</label>
    {children}
    {help ? <div className="help-block">{help}</div> : null}
  </div>
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
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      backgroundColor: color, color: text, padding: '10px 20px',
      borderRadius: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center'
    }}>
      <span style={{ marginRight: 10 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'inherit' }}>&times;</button>
    </div>
  );
};

const DeleteConfirmModal = ({ lb, onClose, onConfirm, loading }) => (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div className="panel panel-danger" style={{ width: 420, boxShadow: '0 5px 15px rgba(0,0,0,0.3)', borderRadius: 0 }}>
      <div className="panel-heading" style={{ background: '#d9534f', color: '#fff', borderRadius: 0 }}>
        <h3 className="panel-title" style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', color: '#fff' }}>Delete Load Balancer</h3>
      </div>
      <div className="panel-body" style={{ padding: '25px 20px' }}>
        <p>Are you sure you want to delete <strong>{lb.name}</strong>?</p>
        <p className="text-muted"><small>This action cannot be undone.</small></p>
        {loading && <div className="text-center" style={{ marginTop: 10 }}><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></span> Deleting...</div>}
      </div>
      <div className="panel-footer text-right" style={{ background: '#fff', padding: '12px 20px' }}>
        <button className="btn btn-default" onClick={onClose} disabled={loading} style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em' }}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={loading} style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em', marginLeft: 10 }}>Delete</button>
      </div>
    </div>
  </div>
);

// --- Create Wizard Steps ---
const Step1_Details = ({ data, update, options }) => (
  <div className="form-horizontal">
    <div className="row">
      <div className="col-md-6">
        <Field label="Name" required>
          <input className="form-control" value={data.name || ''} onChange={e => update('name', e.target.value)} placeholder="My Load Balancer" />
        </Field>
      </div>
      <div className="col-md-6">
        <Field label="Description">
          <input className="form-control" value={data.description || ''} onChange={e => update('description', e.target.value)} placeholder="Optional description" />
        </Field>
      </div>
    </div>
    <div className="row">
      <div className="col-md-6">
        <Field label="VIP Subnet" required>
          <select className="form-control" value={data.vipSubnetId || ''} onChange={e => update('vipSubnetId', e.target.value)}>
            <option value="">Select Subnet...</option>
            {(options.subnets || []).map(s => <option key={s.value} value={s.value}>{s.name} {s.cidr ? `(${s.cidr})` : ''}</option>)}
          </select>
        </Field>
      </div>
      <div className="col-md-6">
        <Field label="IP Address">
          <input className="form-control" value={data.vipAddress || ''} onChange={e => update('vipAddress', e.target.value)} placeholder="Auto-assign" />
        </Field>
      </div>
    </div>
  </div>
);

const Step2_Listener = ({ data, update }) => {
  const protocols = ['HTTP', 'HTTPS', 'TERMINATED_HTTPS', 'TCP', 'UDP', 'SCTP'];
  const showHeaders = ['HTTP', 'TERMINATED_HTTPS'].includes(data.listenerProtocol);
  const showTls = data.listenerProtocol === 'TERMINATED_HTTPS';
  const hideTimeouts = ['UDP', 'SCTP'].includes(data.listenerProtocol);

  return (
    <div className="form-horizontal">
      <div className="form-group">
        <div className="col-sm-12">
          <div className="checkbox">
            <label>
              <input type="checkbox" checked={data.createListener} onChange={e => update('createListener', e.target.checked)} />
              <strong>Create Listener</strong>
            </label>
          </div>
        </div>
      </div>
      {data.createListener && <div style={{ borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }}>
        <div className="row">
          <div className="col-md-6">
            <Field label="Listener Name" required>
              <input className="form-control" value={data.listenerName || ''} onChange={e => update('listenerName', e.target.value)} />
            </Field>
          </div>
          <div className="col-md-3">
            <Field label="Protocol" required>
              <select className="form-control" value={data.listenerProtocol || 'HTTP'} onChange={e => update('listenerProtocol', e.target.value)}>
                {protocols.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <div className="col-md-3">
            <Field label="Port" required>
              <input type="number" className="form-control" value={data.listenerPort || 80} onChange={e => update('listenerPort', parseInt(e.target.value))} min="1" max="65535" />
            </Field>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6">
            <Field label="Connection Limit">
              <input type="number" className="form-control" value={data.connectionLimit || -1} onChange={e => update('connectionLimit', parseInt(e.target.value))} placeholder="-1 for infinite" />
            </Field>
          </div>
          <div className="col-md-6">
            <Field label="Allowed CIDRs">
              <input className="form-control" value={data.allowedCidrs || ''} onChange={e => update('allowedCidrs', e.target.value)} placeholder="e.g. 192.168.1.0/24, 10.0.0.0/8" />
            </Field>
          </div>
        </div>

        {!hideTimeouts && <div className="row">
          <div className="col-md-3"><Field label="Client Data Timeout"><input type="number" className="form-control" value={data.clientDataTimeout || 50000} onChange={e => update('clientDataTimeout', parseInt(e.target.value))} /></Field></div>
          <div className="col-md-3"><Field label="TCP Inspect Timeout"><input type="number" className="form-control" value={data.tcpInspectTimeout || 0} onChange={e => update('tcpInspectTimeout', parseInt(e.target.value))} /></Field></div>
          <div className="col-md-3"><Field label="Member Connect Timeout"><input type="number" className="form-control" value={data.memberConnectTimeout || 5000} onChange={e => update('memberConnectTimeout', parseInt(e.target.value))} /></Field></div>
          <div className="col-md-3"><Field label="Member Data Timeout"><input type="number" className="form-control" value={data.memberDataTimeout || 50000} onChange={e => update('memberDataTimeout', parseInt(e.target.value))} /></Field></div>
        </div>}

        {showHeaders && <div className="well ml-3">
          <label>Insert Headers</label>
          <div className="checkbox"><label><input type="checkbox" checked={data.insertXForwardedFor || false} onChange={e => update('insertXForwardedFor', e.target.checked)} /> X-Forwarded-For</label></div>
          <div className="checkbox"><label><input type="checkbox" checked={data.insertXForwardedPort || false} onChange={e => update('insertXForwardedPort', e.target.checked)} /> X-Forwarded-Port</label></div>
          <div className="checkbox"><label><input type="checkbox" checked={data.insertXForwardedProto || false} onChange={e => update('insertXForwardedProto', e.target.checked)} /> X-Forwarded-Proto</label></div>
        </div>}

        {showTls && <div className="well ml-3">
          <label>TLS Configuration</label>
          <Field label="TLS Cipher String">
            <input className="form-control" value={data.tlsCipherString || ''} onChange={e => update('tlsCipherString', e.target.value)} placeholder="Default" />
          </Field>
        </div>}
      </div>}
    </div>
  );
};

const Step3_Pool = ({ data, update }) => {
  const algorithms = ['ROUND_ROBIN', 'LEAST_CONNECTIONS', 'SOURCE_IP'];
  const protocols = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SCTP']; // Pool protocol usually matches listener

  return (
    <div className="form-horizontal">
      <div className="form-group">
        <div className="col-sm-12">
          <div className="checkbox">
            <label>
              <input type="checkbox" checked={data.createPool} onChange={e => update('createPool', e.target.checked)} />
              <strong>Create Pool</strong>
            </label>
          </div>
        </div>
      </div>
      {data.createPool && <div style={{ borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }}>
        <div className="row">
          <div className="col-md-6">
            <Field label="Pool Name" required>
              <input className="form-control" value={data.poolName || ''} onChange={e => update('poolName', e.target.value)} />
            </Field>
          </div>
          <div className="col-md-6">
            <Field label="Algorithm" required>
              <select className="form-control" value={data.poolAlgorithm || 'ROUND_ROBIN'} onChange={e => update('poolAlgorithm', e.target.value)}>
                {algorithms.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div className="row">
          <div className="col-md-6">
            <Field label="Protocol" required>
              <select className="form-control" value={data.poolProtocol || data.listenerProtocol || 'HTTP'} onChange={e => update('poolProtocol', e.target.value)}>
                {protocols.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <div className="col-md-6">
            <Field label="Description">
              <input className="form-control" value={data.poolDesc || ''} onChange={e => update('poolDesc', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="well">
          <label>Session Persistence</label>
          <div className="row">
            <div className="col-md-6">
              <Field label="Type">
                <select className="form-control" value={data.sessionPersistence || 'None'} onChange={e => update('sessionPersistence', e.target.value)}>
                  <option value="None">None</option>
                  <option value="SOURCE_IP">Source IP</option>
                  <option value="HTTP_COOKIE">HTTP Cookie</option>
                  <option value="APP_COOKIE">App Cookie</option>
                </select>
              </Field>
            </div>
            {data.sessionPersistence === 'APP_COOKIE' && <div className="col-md-6">
              <Field label="Cookie Name" required>
                <input className="form-control" value={data.cookieName || ''} onChange={e => update('cookieName', e.target.value)} />
              </Field>
            </div>}
          </div>
        </div>
        <div className="well">
          <label>TLS Encryption (Backend Re-encryption)</label>
          <div className="checkbox">
            <label>
              <input type="checkbox" checked={data.poolTlsEnabled || false} onChange={e => update('poolTlsEnabled', e.target.checked)} />
              Enable TLS
            </label>
          </div>
          {data.poolTlsEnabled && <Field label="Cipher String">
            <input className="form-control" value={data.poolTlsCipher || ''} onChange={e => update('poolTlsCipher', e.target.value)} placeholder="Default" />
          </Field>
          }
        </div>
      </div>}
    </div>
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
    <div>
      {!data.createPool ? <div className="alert alert-warning">Pool creation is disabled. No members can be added.</div> :
        <div>
          <div className="row">
            <div className="col-md-6">
              <div className="panel panel-default">
                <div className="panel-heading">Add Instance Member</div>
                <div className="panel-body">
                  <div className="input-group">
                    <select className="form-control" value={selectedInst} onChange={e => setSelectedInst(e.target.value)}>
                      <option value="">Select Instance...</option>
                      {availableInstances.map(i => <option key={i.value} value={i.value}>{i.name}</option>)}
                    </select>
                    <span className="input-group-btn">
                      <button className="btn btn-success" onClick={addInternal} disabled={!selectedInst}>Add</button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="panel panel-default">
                <div className="panel-heading">Add External Member</div>
                <div className="panel-body">
                  <div className="row">
                    <div className="col-xs-5"><input className="form-control input-sm" placeholder="IP Address" value={extIp} onChange={e => setExtIp(e.target.value)} /></div>
                    <div className="col-xs-3"><input type="number" className="form-control input-sm" placeholder="Port" value={extPort} onChange={e => setExtPort(parseInt(e.target.value))} /></div>
                    <div className="col-xs-2"><input type="number" className="form-control input-sm" placeholder="Wgt" value={extWeight} onChange={e => setExtWeight(parseInt(e.target.value))} /></div>
                    <div className="col-xs-2"><button className="btn btn-success btn-sm btn-block" onClick={addExternal} disabled={!extIp}>Add</button></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <table className="table table-striped table-bordered">
            <thead><tr><th>Name</th><th>Address</th><th>Port</th><th>Weight</th><th>Type</th><th></th></tr></thead>
            <tbody>
              {(data.members || []).length === 0 ? <tr><td colSpan="6" className="text-center text-muted">No members defined</td></tr> :
                (data.members || []).map(m => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.address}</td>
                    <td>{m.port}</td>
                    <td>{m.weight}</td>
                    <td><Badge text={m.type || 'INTERNAL'} tone={m.type === 'EXTERNAL' ? 'warning' : 'info'} /></td>
                    <td className="text-right"><button className="btn btn-xs" style={{ backgroundColor: '#b00020', color: '#fff', border: 'none', fontWeight: 600 }} onClick={() => removeMember(m.id)}>&times;</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>}
    </div>
  );
};

const Step5_Monitor = ({ data, update }) => {
  const types = ['HTTP', 'HTTPS', 'PING', 'TCP', 'TLS-HELLO', 'UDP-CONNECT', 'SCTP'];
  return (
    <div className="form-horizontal">
      <div className="form-group">
        <div className="col-sm-12">
          <div className="checkbox">
            <label>
              <input type="checkbox" checked={data.createMonitor} onChange={e => update('createMonitor', e.target.checked)} />
              <strong>Create Health Monitor</strong>
            </label>
          </div>
        </div>
      </div>
      {data.createMonitor && <div style={{ borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }}>
        <div className="row">
          <div className="col-md-6">
            <Field label="Name" required>
              <input className="form-control" value={data.monitorName || ''} onChange={e => update('monitorName', e.target.value)} />
            </Field>
          </div>
          <div className="col-md-6">
            <Field label="Type" required>
              <select className="form-control" value={data.monitorType || 'HTTP'} onChange={e => update('monitorType', e.target.value)}>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {(data.monitorType === 'HTTP' || data.monitorType === 'HTTPS') && <div>
          <div className="row">
            <div className="col-md-4">
              <Field label="HTTP Method">
                <select className="form-control" value={data.httpMethod || 'GET'} onChange={e => update('httpMethod', e.target.value)}>
                  {['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'OPTIONS', 'PATCH', 'CONNECT'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <div className="col-md-4">
              <Field label="Expected Codes">
                <input className="form-control" value={data.expectedCodes || '200'} onChange={e => update('expectedCodes', e.target.value)} placeholder="200, 200-204" />
              </Field>
            </div>
            <div className="col-md-4">
              <Field label="URL Path">
                <input className="form-control" value={data.urlPath || '/'} onChange={e => update('urlPath', e.target.value)} placeholder="/" />
              </Field>
            </div>
          </div>
        </div>}

        <div className="row">
          <div className="col-md-3">
            <Field label="Delay (sec)" required><input type="number" className="form-control" value={data.delay || 5} onChange={e => update('delay', parseInt(e.target.value))} /></Field>
          </div>
          <div className="col-md-3">
            <Field label="Timeout (sec)" required><input type="number" className="form-control" value={data.timeout || 5} onChange={e => update('timeout', parseInt(e.target.value))} /></Field>
          </div>
          <div className="col-md-3">
            <Field label="Max Retries" required><input type="number" className="form-control" value={data.maxRetries || 3} onChange={e => update('maxRetries', parseInt(e.target.value))} /></Field>
          </div>
          <div className="col-md-3">
            <Field label="Max Retries Down"><input type="number" className="form-control" value={data.maxRetriesDown || 3} onChange={e => update('maxRetriesDown', parseInt(e.target.value))} /></Field>
          </div>
        </div>
      </div>}
    </div>
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 5px 30px rgba(0,0,0,0.4)', borderRadius: 0, overflow: 'hidden' }}>
        {/* Gold Header Bar */}
        <div style={{ background: '#f9c600', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Create Load Balancer</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>{'\u00D7'}</button>
        </div>
        {/* Chevron Tab Row */}
        <div style={{ background: '#fff', borderBottom: '2px solid #e1e3e5', padding: '0 20px', display: 'flex', alignItems: 'center', minHeight: 42 }}>
          {steps.map((s, i) => {
            const isActive = step === s.num;
            const isComplete = s.num < step;
            return (
              <React.Fragment key={s.num}>
                {i > 0 && <span style={{ margin: '0 8px', color: '#ccc', fontSize: 11 }}>{'>'}  </span>}
                <span
                  style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: isActive ? 700 : 400, color: isActive ? '#2d353c' : isComplete ? '#2d353c' : '#aaa', cursor: isComplete ? 'pointer' : 'default', letterSpacing: '0.5px' }}
                  onClick={() => { if (isComplete) { setValidationMsg(''); setStep(s.num); } }}
                >{s.title}</span>
              </React.Fragment>
            );
          })}
        </div>
        {/* Content */}
        <div style={{ flex: 1, background: '#fff', overflowY: 'auto', padding: '25px 30px' }}>
          {validationMsg && <div className="alert alert-danger" style={{ marginBottom: 15 }}>{validationMsg}</div>}
          <CurrentComp data={data} update={update} options={options} />
        </div>
        {/* Footer */}
        <div style={{ background: '#fff', borderTop: '1px solid #e1e3e5', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {step > 1 && <button className="btn btn-default" onClick={() => { setValidationMsg(''); setStep(s => s - 1); }} style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em', padding: '8px 20px' }}>Previous</button>}
          {step < 5 && <button className="btn" style={{ backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em', padding: '8px 24px' }} onClick={goNext}>Next</button>}
          {step === 5 && <button className="btn" style={{ backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em', padding: '8px 24px' }} onClick={finish} disabled={saving}>{saving ? 'Creating...' : 'Finish'}</button>}
        </div>
      </div>
    </div>
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 5px 30px rgba(0,0,0,0.4)', borderRadius: 0, overflow: 'hidden' }}>
        {/* Gold Header */}
        <div style={{ background: '#f9c600', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Edit Load Balancer</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>{'\u00D7'}</button>
        </div>
        {/* Tab Row */}
        <div style={{ background: '#fff', borderBottom: '2px solid #e1e3e5', padding: '0 20px', display: 'flex', alignItems: 'center', minHeight: 42 }}>
          {editTabs.map((t, i) => {
            const isActive = tab === t.key;
            return (
              <React.Fragment key={t.key}>
                {i > 0 && <span style={{ margin: '0 8px', color: '#ccc', fontSize: 11 }}>{'>'}</span>}
                <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: isActive ? 700 : 400, color: isActive ? '#2d353c' : '#aaa', cursor: 'pointer', letterSpacing: '0.5px' }} onClick={() => setTab(t.key)}>{t.title}</span>
              </React.Fragment>
            );
          })}
        </div>
        {/* Content */}
        <div style={{ flex: 1, background: '#fff', overflowY: 'auto', padding: '25px 30px' }}>
          {loading ? <div style={{ textAlign: 'center', padding: 40 }}><span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></span> Loading...</div> : <div>
            {tab === 'general' && <div className="form-horizontal">
              <Field label="Name"><input className="form-control" value={data.name || ''} onChange={e => update('name', e.target.value)} /></Field>
              <Field label="Description"><input className="form-control" value={data.description || ''} onChange={e => update('description', e.target.value)} /></Field>
              <div className="form-group"><div className="col-sm-12"><div className="checkbox"><label><input type="checkbox" checked={data.admin_state_up} onChange={e => update('admin_state_up', e.target.checked)} /> Admin State Up</label></div></div></div>
            </div>}
            {tab === 'listener' && <Step2_Listener data={data} update={update} />}
            {tab === 'pool' && <div>
              <Step3_Pool data={data} update={update} />
              <hr />
              <h5 style={{ textTransform: 'uppercase', fontWeight: 600, marginBottom: 15 }}>Members</h5>
              <Step4_Members data={data} update={update} options={{ instances: [] }} />
            </div>}
            {tab === 'monitor' && <Step5_Monitor data={data} update={update} />}
          </div>}
        </div>
        {/* Footer */}
        <div style={{ background: '#fff', borderTop: '1px solid #e1e3e5', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-default" onClick={onClose} style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.85em', padding: '8px 20px' }}>Cancel</button>
          <button className="btn" style={{ backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em', padding: '8px 24px' }} onClick={save} disabled={saving || loading}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
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

  if (lbState.error) return <div className="alert alert-danger">{lbState.error.message}</div>;
  if (lbState.loading || optionsState.loading) return <div style={{ padding: 20 }}><i className="fa fa-spinner fa-spin"></i> Loading...</div>;

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
    <div style={{ padding: '0' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteTarget && <DeleteConfirmModal lb={deleteTarget} loading={deleting} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />}
      {view === 'create' && <CreateWizard networkId={networkId} options={options} onClose={() => setView('list')} onCreated={() => { setView('list'); setToast({ msg: 'Load Balancer created.', type: 'success' }); }} />}
      {view === 'edit' && selectedLb && <EditLBModal lb={selectedLb} networkId={networkId} onClose={() => { setSelectedLb(null); setView('list'); }} onUpdated={() => { setSelectedLb(null); setView('list'); setToast({ msg: 'Load Balancer updated.', type: 'success' }); }} />}

      {/* Toolbar — matches Morpheus: search left, + ADD right */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15, padding: '0 5px' }}>
        <button className="btn" style={{ backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', padding: '6px 14px', fontSize: '0.85em' }} onClick={() => setView('create')}>
          <i className="fa fa-plus" style={{ marginRight: 5 }}></i> Add
        </button>
      </div>

      {/* Table — matches Morpheus network list */}
      <table className="table" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
            <th style={{ textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }}>Name</th>
            <th style={{ textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }}>VIP</th>
            <th style={{ textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }}>Status</th>
            <th style={{ textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px' }}>Members</th>
            <th style={{ textTransform: 'uppercase', fontSize: '0.8em', fontWeight: 600, color: '#555', letterSpacing: '0.5px', padding: '10px 12px', width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {lbs.map(lb => (
            <tr key={lb.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '12px', verticalAlign: 'middle', fontWeight: 500, color: '#333' }}>{lb.name}</td>
              <td style={{ padding: '12px', verticalAlign: 'middle', color: '#555' }}>{lb.vipAddress}</td>
              <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                <Badge text={lb.provisioning_status} tone={lb.provisioning_status === 'ACTIVE' ? 'success' : 'warning'} />
              </td>
              <td style={{ padding: '12px', verticalAlign: 'middle', color: '#555' }}>{(lb.members || []).length}</td>
              <td style={{ padding: '12px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn btn-default btn-sm" style={{ marginRight: 6, padding: '3px 8px', fontSize: '12px' }} title="Edit" onClick={() => { setSelectedLb(lb); setView('edit'); }}><i className="fas fa-pencil-alt"></i></button>
                <button className="btn btn-danger btn-sm" style={{ padding: '3px 8px', fontSize: '12px' }} title="Delete" onClick={() => setDeleteTarget(lb)}><i className="fas fa-trash-alt"></i></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lbs.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>No Load Balancers found. Click "+ Add" to create one.</div>}
    </div>
  );
};

const InstanceView = ({ instanceId }) => {
  const lbState = useAsync(() => Api.listLoadBalancers({ instanceId }), [instanceId])
  if (lbState.error) return <div className="alert alert-danger">{lbState.error.message}</div>
  if (lbState.loading) return <div style={{ padding: 20, textAlign: 'center' }}><span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></span> Loading...</div>
  const lbs = lbState.data?.loadbalancers || []
  if (lbs.length === 0) return <div className="alert alert-info">This instance is not a member of any Octavia load balancer.</div>
  return (
    <div className="container-fluid" style={{ padding: '0 12px' }}>
      <h4 style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', color: '#2d6ca2', marginBottom: 15 }}>Load balancers associated with this instance</h4>
      <p className="text-muted" style={{ marginBottom: 15, fontSize: '0.9em' }}>This instance is a pool member of the following load balancers. Click a name to manage it on the Network detail page.</p>
      <div className="table-responsive">
        <table className="table table-striped table-hover">
          <thead><tr style={{ textTransform: 'uppercase', fontSize: '0.85em', fontWeight: 600 }}><th>Name</th><th>VIP</th><th>Status</th><th>Members</th><th>Network</th></tr></thead>
          <tbody>
            {lbs.map(lb => (
              <tr key={lb.id}>
                <td>
                  <a href={'/infrastructure/networks/' + (lb.networkId || '') + '#!octavia-network-tab'}
                    style={{ fontWeight: 'bold', color: '#2d6ca2', textDecoration: 'none' }}
                    title="View in Network detail Octavia tab">
                    {lb.name}
                  </a>
                </td>
                <td>{lb.vipAddress}</td>
                <td><Badge text={lb.provisioning_status || 'ACTIVE'} tone={(lb.provisioning_status || 'ACTIVE') === 'ACTIVE' ? 'success' : 'warning'} /></td>
                <td>{(lb.members || []).length}</td>
                <td>
                  <a href={'/infrastructure/networks/' + (lb.networkId || '')} style={{ color: '#2d6ca2' }}>
                    {lb.networkName || 'View Network'}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  if (networkId) return <NetworkView networkId={networkId} />
  if (instanceId) return <InstanceView instanceId={instanceId} />
  return <div className="alert alert-warning">Context missing.</div>
}


if (ReactDOM.createRoot) {
  ReactDOM.createRoot(mountNode).render(<App />)
} else {
  ReactDOM.render(<App />, mountNode)
}
