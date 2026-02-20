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
            <div className="modal fade in" style={{ display: 'block', overflow: 'auto' }}>
                <div className="modal-dialog modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <button type="button" className="close" onClick={onClose} data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true">
                                    <svg version="1.1" className="close-icon" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 59.9 59.9" enableBackground="new 0 0 59.9 59.9" xmlSpace="preserve">
                                        <line fill="none" stroke="currentColor" strokeMiterlimit="10" x1="57.4" y1="2.5" x2="2.5" y2="57.4"></line>
                                        <line fill="none" stroke="currentColor" strokeMiterlimit="10" x1="2.5" y1="2.5" x2="57.4" y2="57.4"></line>
                                    </svg>
                                </span>
                            </button>
                            <h4 className="modal-title">Edit Load Balancer</h4>
                        </div>
                        <div className="modal-body" style={{ padding: 0 }}>
                            <div className="tab-container">
                                <ul className="nav nav-tabs" style={{ paddingLeft: 20, paddingTop: 10 }}>
                                    {editTabs.map((t, i) => (
                                        <li key={t.key} className={tab === t.key ? 'active' : ''}>
                                            <a href="#" onClick={(e) => { e.preventDefault(); setTab(t.key); }}>{t.title}</a>
                                        </li>
                                    ))}
                                </ul>
                                <div className="tab-content" style={{ padding: 20 }}>
                                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><i className="fa fa-spinner fa-spin"></i> Loading...</div> : <div>
                                        {tab === 'general' && <div className="form-horizontal">
                                            <Field label="Name"><input className="form-control" value={data.name || ''} onChange={e => update('name', e.target.value)} /></Field>
                                            <Field label="Description"><input className="form-control" value={data.description || ''} onChange={e => update('description', e.target.value)} /></Field>
                                            <div className="form-group"><div className="col-sm-12"><div className="checkbox"><label><input type="checkbox" checked={data.admin_state_up} onChange={e => update('admin_state_up', e.target.checked)} /> Admin State Up</label></div></div></div>
                                        </div>}
                                        {tab === 'listener' && <Step2_Listener data={data} update={update} />}
                                        {tab === 'pool' && <div>
                                            <Step3_Pool data={data} update={update} />
                                            <hr />
                                            <h5 style={{ fontWeight: 600, marginBottom: 15 }}>Members</h5>
                                            <Step4_Members data={data} update={update} options={{ instances: [] }} />
                                        </div>}
                                        {tab === 'monitor' && <Step5_Monitor data={data} update={update} />}
                                    </div>}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-link" onClick={onClose}>Cancel</button>
                            <button className="btn btn-primary" onClick={save} disabled={saving || loading}>{saving ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    </div>
                </div>
                <div className="modal-backdrop fade in"></div>
            </div>
        );
    };

    window.Octavia.EditLBModal = EditLBModal;
})();
