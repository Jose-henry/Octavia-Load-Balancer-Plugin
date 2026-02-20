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

