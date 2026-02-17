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
  if (networkId) return <NetworkView networkId={networkId} />
  if (instanceId) return <InstanceView instanceId={instanceId} />
  return <div className="alert alert-warning">Context missing.</div>
}


if (ReactDOM.createRoot) {
  ReactDOM.createRoot(mountNode).render(<App />)
} else {
  ReactDOM.render(<App />, mountNode)
}
