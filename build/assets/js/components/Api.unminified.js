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

