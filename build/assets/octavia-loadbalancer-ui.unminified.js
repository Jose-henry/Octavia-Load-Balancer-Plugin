/**
 * Octavia Load Balancer UI
 * Renders inside network or instance tabs. Relies on Morpheus plugin endpoints.
 */

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
    {className: `label label-${tone}`, style: { marginRight: 6 }},
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

// ----------- API wrappers -------------
const makeApi = (pluginCode) => {
  const base = `/plugin/${pluginCode}`
  return {
    listLoadBalancers: ({ networkId, instanceId }) =>
      apiFetch(`${base}/loadbalancers?${networkId ? 'networkId=' + networkId : 'instanceId=' + instanceId}`),

    listOptions: (networkId) =>
      Promise.all([
        apiFetch(`${base}/options/projects?networkId=${networkId}`),
        apiFetch(`${base}/options/subnets?networkId=${networkId}`),
        apiFetch(`${base}/options/instances?networkId=${networkId}`),
        apiFetch(`${base}/options/floatingIpPools?networkId=${networkId}`)
      ]).then(([projects, subnets, instances, fipPools]) => {
        const norm = (d, key) => Array.isArray(d) ? d : (d && d[key]) ? d[key] : []
        return {
          projects: norm(projects, 'projects'),
          subnets: norm(subnets, 'subnets'),
          instances: norm(instances, 'instances'),
          fipPools: norm(fipPools, 'floatingIpPools')
        }
      }),

    createLoadBalancer: (payload) =>
      apiFetch(`${base}/loadbalancers/create`, { method: 'POST', body: JSON.stringify(payload) }),

    deleteLoadBalancer: (lbId, networkId) =>
      apiFetch(`${base}/loadbalancers/delete`, { method: 'POST', body: JSON.stringify({ lbId, networkId }) }),

    attachFloatingIp: (lbId, networkId, floatingIpPoolId) =>
      apiFetch(`${base}/floatingip/attach`, { method: 'POST', body: JSON.stringify({ lbId, networkId, floatingIpPoolId }) }),

    detachFloatingIp: (lbId, networkId) =>
      apiFetch(`${base}/floatingip/detach`, { method: 'POST', body: JSON.stringify({ lbId, networkId }) }),
  }
}

const mountNode = document.getElementById('octavia-loadbalancer-view')
const pluginCode = mountNode?.dataset?.pluginCode || 'octavia1234'
const Api = makeApi(pluginCode)

// -------------- Components --------------

const MembersSelector = ({ options, selected, onChange }) => {
  const [pick, setPick] = React.useState('')
  const remaining = options.filter(o => !selected.includes(o.value))
  return (
    React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        {className: "form-inline", style: { marginBottom: 10 }},
        React.createElement(
          "select",
          {className: "form-control", value: pick, onChange: e => setPick(e.target.value)},
          React.createElement(
            "option",
            {value: true},
            "Add instance..."
          ),
          remaining.map(o => React.createElement(
                     "option",
                     {key: o.value, value: o.value},
                     o.name
                   ))
        ),
        React.createElement(
          "button",
          {className: "btn btn-default", style: { marginLeft: 8 }, disabled: !pick, onClick: () => { onChange([...selected, pick]); setPick('') }},
          "Add"
        )
      ),
      selected.length === 0 ? React.createElement(
                          "div",
                          {className: "text-muted"},
                          "No members selected"
                        ) :
        React.createElement(
          "ul",
          {className: "list-group"},
          selected.map(id => {
            const name = (options.find(o => o.value === id) || {}).name || id
            return (
              React.createElement(
                "li",
                {key: id, className: "list-group-item"},
                name,
                React.createElement(
                  "button",
                  {className: "btn btn-xs btn-link pull-right text-danger", onClick: () => onChange(selected.filter(x => x !== id))},
                  "remove"
                )
              )
            )
          })
        )
    )
  )
}

const CreatePanel = ({ networkId, options, onCreated, onClose }) => {
  const [model, setModel] = React.useState({
    name: '',
    vipSubnetId: options.subnets && options.subnets.length ? options.subnets[0].value : '',
    members: []
  })
  React.useEffect(() => {
    if (options.subnets && options.subnets.length && !model.vipSubnetId) {
      setModel(m => ({ ...m, vipSubnetId: options.subnets[0].value }))
    }
  }, [options.subnets])
  const [saving, setSaving] = React.useState(false)
  const save = () => {
    if (!model.name || !model.vipSubnetId) return alert('Name and subnet are required')
    setSaving(true)
    Api.createLoadBalancer({ ...model, networkId }).then(() => {
      setSaving(false)
      onCreated()
    }).catch((err) => {
      setSaving(false)
      alert(err?.message || 'Create failed')
    })
  }
  const projectName = options.projects && options.projects[0] ? options.projects[0].name : ''
  return (
    React.createElement(
      "div",
      {className: "panel panel-default", style: { boxShadow: '0 12px 30px rgba(0,0,0,0.18)', borderRadius: 12 }},
      React.createElement(
        "div",
        {className: "panel-heading"},
        React.createElement(
          "h4",
          {className: "panel-title"},
          "Create Load Balancer"
        ),
        React.createElement(
          "button",
          {className: "close", onClick: onClose},
          "&times;"
        )
      ),
      React.createElement(
        "div",
        {className: "panel-body"},
        React.createElement(
          Field,
          {label: "Name", required: true},
          React.createElement(
            "input",
            {className: "form-control", value: model.name, onChange: e => setModel({ ...model, name: e.target.value })}
          )
        ),
        React.createElement(
          Field,
          {label: "Project"},
          React.createElement(
            "input",
            {className: "form-control", value: projectName, readOnly: true}
          )
        ),
        React.createElement(
          Field,
          {label: "VIP Subnet", required: true},
          React.createElement(
            "select",
            {className: "form-control", value: model.vipSubnetId, onChange: e => setModel({ ...model, vipSubnetId: e.target.value })},
            (options.subnets || []).map(s => React.createElement(
                                   "option",
                                   {key: s.value, value: s.value},
                                   s.name,
                                   s.cidr ? `(${s.cidr})` : ''
                                 ))
          )
        ),
        React.createElement(
          Field,
          {label: "Members"},
          React.createElement(
            MembersSelector,
            {options: options.instances || [], selected: model.members, onChange: m => setModel({ ...model, members: m })}
          )
        ),
        React.createElement(
          "div",
          {className: "text-right"},
          React.createElement(
            "button",
            {className: "btn btn-default", onClick: onClose},
            "Cancel"
          ),
          React.createElement(
            "button",
            {className: "btn btn-primary", style: { marginLeft: 8 }, onClick: save, disabled: saving},
            saving ? 'Creating...' : 'Create'
          )
        )
      )
    )
  )
}

const FloatingIpButton = ({ lb, networkId, pools, refresh }) => {
  const [open, setOpen] = React.useState(false)
  const [poolId, setPoolId] = React.useState(pools && pools.length ? pools[0].value : '')
  const [busy, setBusy] = React.useState(false)
  const doCall = (fn) => {
    setBusy(true)
    fn().then(refresh).catch(err => alert(err.message)).finally(() => setBusy(false))
  }
  if (lb.floatingIp) {
    return React.createElement(
             "button",
             {className: "btn btn-warning btn-xs", disabled: busy, onClick: () => doCall(() => Api.detachFloatingIp(lb.id, networkId))},
             busy ? 'Detaching...' : 'Detach Floating IP'
           )
  }
  return (
    React.createElement(
      "div",
      {className: "btn-group"},
      React.createElement(
        "button",
        {className: "btn btn-default btn-xs", disabled: busy, onClick: () => setOpen(!open)},
        "Attach Floating IP"
      ),
      open &&
        React.createElement(
          "div",
          {style: { position: 'absolute', background: '#fff', padding: 8, border: '1px solid #ddd', zIndex: 5 }},
          React.createElement(
            "select",
            {className: "form-control input-sm", value: poolId, onChange: e => setPoolId(e.target.value), disabled: busy},
            (pools || []).map(p => React.createElement(
                         "option",
                         {key: p.value, value: p.value},
                         p.name
                       ))
          ),
          React.createElement(
            "button",
            {className: "btn btn-primary btn-xs", style: { marginTop: 6 }, disabled: busy || !poolId, onClick: () => doCall(() => Api.attachFloatingIp(lb.id, networkId, poolId))},
            busy ? 'Attaching...' : 'Attach'
          )
        )
    )
  )
}

const NetworkView = ({ networkId }) => {
  const [showCreate, setShowCreate] = React.useState(false)
  const optionsState = useAsync(() => Api.listOptions(networkId), [networkId, showCreate])
  const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, showCreate])

  const [lbData, setLbData] = React.useState(null)
  React.useEffect(() => { if (lbState.data) setLbData(lbState.data) }, [lbState])
  const refresh = () => Api.listLoadBalancers({ networkId }).then(setLbData)

  if (lbState.error || optionsState.error) {
    const msg = lbState.error?.message || optionsState.error?.message || 'Error loading data'
    return React.createElement(
             "div",
             {className: "alert alert-danger"},
             msg
           )
  }
  if (lbState.loading || optionsState.loading) return React.createElement(
                                                        "div",
                                                        null,
                                                        "Loading..."
                                                      )
  const options = optionsState.data || {}
  const lbs = lbData ? lbData.loadbalancers || [] : []

  return (
    React.createElement(
      "div",
      {className: "container-fluid", style: { padding: '0 12px' }},
      React.createElement(
        "div",
        {className: "clearfix", style: { marginBottom: 12 }},
        React.createElement(
          "button",
          {className: "btn btn-primary pull-right", onClick: () => setShowCreate(true)},
          "Create Load Balancer"
        ),
        React.createElement(
          "h3",
          null,
          "Load Balancers on this Network"
        )
      ),
      lbs.length === 0 ? React.createElement(
                     "div",
                     {className: "alert alert-info"},
                     "No load balancers yet."
                   ) :
        React.createElement(
          "div",
          {className: "table-responsive"},
          React.createElement(
            "table",
            {className: "table table-striped table-condensed", style: { minWidth: 600 }},
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
                  "Project"
                ),
                React.createElement(
                  "th",
                  null,
                  "Members"
                ),
                React.createElement(
                  "th",
                  null,
                  "Floating IP"
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
                    lb.projectName || options.projects?.[0]?.name
                  ),
                  React.createElement(
                    "td",
                    null,
                    (lb.members || []).length
                  ),
                  React.createElement(
                    "td",
                    null,
                    lb.floatingIp ? lb.floatingIp.ipAddress || 'Attached' : 'None'
                  ),
                  React.createElement(
                    "td",
                    {className: "text-right"},
                    React.createElement(
                      FloatingIpButton,
                      {lb: lb, networkId: networkId, pools: options.fipPools || [], refresh: () => Api.listLoadBalancers({ networkId }).then(setLbData)}
                    ),
                    React.createElement(
                      "button",
                      {className: "btn btn-link text-danger btn-xs", style: { marginLeft: 6 }, onClick: () => Api.deleteLoadBalancer(lb.id, networkId).then(() => Api.listLoadBalancers({ networkId }).then(setLbData)).catch(err => alert(err.message))},
                      "Delete"
                    )
                  )
                )
              ))
            )
          )
        ),
      showCreate &&
        React.createElement(
          "div",
          {style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,15,30,0.45)', padding: '40px 10%', overflowY: 'auto' }},
          React.createElement(
            CreatePanel,
            {networkId: networkId, options: options, onCreated: () => { setShowCreate(false); Api.listLoadBalancers({ networkId }).then(setLbData) }, onClose: () => setShowCreate(false)}
          )
        )
    )
  )
}

const InstanceView = ({ instanceId }) => {
  const lbState = useAsync(() => Api.listLoadBalancers({ instanceId }), [instanceId])
  if (lbState.error) return React.createElement(
                              "div",
                              {className: "alert alert-danger"},
                              lbState.error.message
                            )
  if (lbState.loading) return React.createElement(
                                "div",
                                null,
                                "Loading..."
                              )
  const lbs = lbState.data?.loadbalancers || []
  if (lbs.length === 0) return React.createElement(
                                 "div",
                                 {className: "alert alert-info"},
                                 "This instance is not a member of any load balancer."
                               )
  return (
    React.createElement(
      "div",
      null,
      React.createElement(
        "h4",
        null,
        "Load balancers containing this instance"
      ),
      React.createElement(
        "ul",
        {className: "list-group"},
        lbs.map(lb => (
          React.createElement(
            "li",
            {key: lb.id, className: "list-group-item"},
            React.createElement(
              "strong",
              null,
              React.createElement(
                "a",
                {href: `/infrastructure/networks/${lb.networkId}`, target: "_blank", rel: "noreferrer"},
                lb.name
              )
            ),
            React.createElement(
              "div",
              {className: "text-muted"},
              "Members:",
              (lb.members || []).length
            )
          )
        ))
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

