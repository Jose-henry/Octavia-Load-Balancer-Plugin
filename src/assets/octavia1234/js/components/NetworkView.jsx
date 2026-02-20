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

        if (lbState.error) return <div className="alert alert-danger">{lbState.error.message}</div>;
        if (lbState.loading || optionsState.loading) return <div style={{ padding: 20 }}><i className="fa fa-spinner fa-spin"></i> Loading...</div>;

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
            <div style={{ padding: '0' }}>
                {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
                {deleteTarget && <DeleteConfirmModalComp lb={deleteTarget} loading={deleting} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />}
                {view === 'create' && <CreateWizardComp networkId={networkId} options={{ ...options, subnets }} onClose={() => setView('list')} onCreated={() => { setView('list'); setToast({ msg: 'Load Balancer created.', type: 'success' }); }} />}
                {view === 'edit' && selectedLb && <EditLBModalComp lb={selectedLb} networkId={networkId} onClose={() => { setSelectedLb(null); setView('list'); }} onUpdated={() => { setSelectedLb(null); setView('list'); setToast({ msg: 'Load Balancer updated.', type: 'success' }); }} />}

                {/* Tabs */}
                {view === 'list' && (
                    <ul className="nav nav-tabs" style={{ marginBottom: '15px' }}>
                        <li className={activeTab === 'lbs' ? 'active' : ''}><a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('lbs'); }}>Load Balancers</a></li>
                        <li className={activeTab === 'listeners' ? 'active' : ''}><a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('listeners'); }}>Listeners</a></li>
                        <li className={activeTab === 'pools' ? 'active' : ''}><a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('pools'); }}>Pools</a></li>
                        <li className={activeTab === 'members' ? 'active' : ''}><a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('members'); }}>Members</a></li>
                        <li className={activeTab === 'monitors' ? 'active' : ''}><a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('monitors'); }}>Monitors</a></li>
                    </ul>
                )}

                {/* Toolbar */}
                {view === 'list' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15, padding: '0 5px' }}>
                        <button className="btn btn-primary" onClick={() => setView('create')}>
                            + ADD
                        </button>
                    </div>
                )}

                {/* Tables */}
                {view === 'list' && activeTab === 'lbs' && (
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>VIP</th>
                                <th>Status</th>
                                <th>Members</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lbs.map(lb => (
                                <tr key={lb.id}>
                                    <td>{lb.name}</td>
                                    <td>{lb.vip_address}</td>
                                    <td>
                                        <Badge text={lb.provisioning_status} tone={lb.provisioning_status === 'ACTIVE' ? 'success' : 'warning'} />
                                    </td>
                                    <td>{(lb.members || []).length}</td>
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button className="btn btn-link btn-sm" title="Edit" onClick={() => { setSelectedLb(lb); setView('edit'); }}>
                                            <i className="fa fa-pencil" style={{ fontSize: '1.2em' }}></i>
                                        </button>
                                        <button className="btn btn-link btn-sm" title="Delete" onClick={() => setDeleteTarget(lb)}>
                                            <i className="fa fa-trash" style={{ fontSize: '1.2em' }}></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {lbs.length === 0 && (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: '#999' }}>No Load Balancers found. Click "ADD" to create one.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}

                {view === 'list' && activeTab === 'listeners' && (
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Protocol</th>
                                <th>Port</th>
                                <th>Default Pool</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {allListeners.map(l => (
                                <tr key={l.id}>
                                    <td>{l.name || l.id}</td>
                                    <td>{l.protocol}</td>
                                    <td>{l.protocol_port}</td>
                                    <td>{l.default_pool_id ? 'Yes' : 'No'}</td>
                                    <td>
                                        <Badge text={l.provisioning_status} tone={l.provisioning_status === 'ACTIVE' ? 'success' : 'warning'} />
                                    </td>
                                    <td><span className="text-muted text-sm px-2">({l.lbName})</span></td>
                                </tr>
                            ))}
                            {allListeners.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: '#999' }}>No Listeners found attached to these Load Balancers.</td></tr>}
                        </tbody>
                    </table>
                )}

                {view === 'list' && activeTab === 'pools' && (
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Protocol</th>
                                <th>Algorithm</th>
                                <th>Members</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {allPools.map(p => (
                                <tr key={p.id}>
                                    <td>{p.name || p.id}</td>
                                    <td>{p.protocol}</td>
                                    <td>{p.lb_algorithm}</td>
                                    <td>{(p.members || []).length}</td>
                                    <td>
                                        <Badge text={p.provisioning_status} tone={p.provisioning_status === 'ACTIVE' ? 'success' : 'warning'} />
                                    </td>
                                    <td><span className="text-muted text-sm px-2">({p.lbName})</span></td>
                                </tr>
                            ))}
                            {allPools.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: '#999' }}>No Pools found attached to these Load Balancers.</td></tr>}
                        </tbody>
                    </table>
                )}

                {view === 'list' && activeTab === 'members' && (
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Address / Port</th>
                                <th>Weight</th>
                                <th>Pool</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {allMembers.map(m => (
                                <tr key={m.id}>
                                    <td>{m.name || m.id}</td>
                                    <td>{m.address}:{m.protocol_port}</td>
                                    <td>{m.weight}</td>
                                    <td>{m.poolName}</td>
                                    <td>
                                        <Badge text={m.provisioning_status} tone={m.provisioning_status === 'ACTIVE' ? 'success' : 'warning'} />
                                    </td>
                                    <td><span className="text-muted text-sm px-2">({m.lbName})</span></td>
                                </tr>
                            ))}
                            {allMembers.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: '#999' }}>No Members found in any Pools.</td></tr>}
                        </tbody>
                    </table>
                )}

                {view === 'list' && activeTab === 'monitors' && (
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Delay/Timeout</th>
                                <th>Pool</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: '#999' }}>Monitors are connected to Pools.</td></tr>
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();
