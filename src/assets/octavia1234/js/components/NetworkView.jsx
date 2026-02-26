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

        const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, reloadKey]);

        // Fetch options independently when wizard is opened
        React.useEffect(() => {
            if (showWizard || showEdit) {
                const ctx = { networkId };

                Api.getSubnets(networkId).then(res => {
                    const mapped = (res?.data || []).map(s => ({ name: s.name, value: s.value, cidr: s.cidr }));
                    setSubnets(mapped);
                }).catch(e => console.error("Error fetching subnets:", e));

                Api.getProjects(ctx).then(res => {
                    setOptions(o => ({ ...o, optionProjects: res.data || [], optionClouds: res.optionClouds || [], optionResourcePools: res.resourcePools || [] }));
                }).catch(e => console.error(e));

                Api.getInstances(ctx).then(res => {
                    setOptions(o => ({ ...o, instances: res.data || [] }));
                }).catch(e => console.error(e));

                Api.getFloatingIpPools(ctx).then(res => {
                    setOptions(o => ({ ...o, optionFloatingIpPools: res.data || [] }));
                }).catch(e => console.error(e));
            }
        }, [showWizard, showEdit, networkId]);

        if (lbState.error) return <div className="alert alert-danger">{lbState.error.message}</div>;
        if (lbState.loading) {
            return (
                <div className="loading-mask">
                    <div className="text-center">
                        <div className="ajax-loader"></div>
                    </div>
                </div>
            );
        }

        const lbs = lbState.data.loadbalancers || [];

        const handleDelete = () => {
            setDeleting(true);
            Api.deleteLoadBalancer(deleteTarget.id, networkId).then(() => {
                setDeleting(false);
                setDeleteTarget(null);
                setReloadKey(k => k + 1);
                setToast({ msg: 'Load Balancer deleted successfully.', type: 'success' });
            });
        };

        const CreateWizardComp = window.Octavia.CreateWizard;
        const EditLBModalComp = window.Octavia.EditLBModal;
        const DeleteConfirmModalComp = window.Octavia.DeleteConfirmModal;

        return (
            <div>
                {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
                {deleteTarget && <DeleteConfirmModalComp lb={deleteTarget} loading={deleting} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />}
                {view === 'create' && (
                    <CreateWizardComp
                        networkId={networkId}
                        options={{ ...options, subnets }}
                        onClose={() => setView('list')}
                        onCreated={() => {
                            setView('list');
                            setReloadKey(k => k + 1);
                            setToast({ msg: 'Load Balancer created successfully.', type: 'success' });
                        }}
                    />
                )}
                {view === 'edit' && selectedLb && <EditLBModalComp lb={selectedLb} networkId={networkId} options={{ ...options, subnets }} onClose={() => { setSelectedLb(null); setView('list'); }} onUpdated={() => { setSelectedLb(null); setView('list'); }} />}

                {/* Toolbar — ADD button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
                    <button className="btn btn-primary" onClick={() => setView('create')}>
                        + ADD
                    </button>
                </div>

                {/* Load Balancers Table — uses native Morpheus table classes */}
                <table className="table">
                    <thead>
                        <tr>
                            <th>NAME</th>
                            <th>VIP</th>
                            <th>STATUS</th>
                            <th>OPERATING</th>
                            <th>MEMBERS</th>
                            <th className="text-right">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lbs.map(lb => (
                            <tr key={lb.id}>
                                <td>{lb.name}</td>
                                <td>{lb.vip_address}</td>
                                <td>
                                    <Badge
                                        text={lb.provisioning_status}
                                        tone={lb.provisioning_status === 'ACTIVE' ? 'success' : (lb.provisioning_status === 'ERROR' ? 'danger' : 'warning')}
                                    />
                                </td>
                                <td>
                                    <Badge
                                        text={lb.operating_status || 'UNKNOWN'}
                                        tone={lb.operating_status === 'ONLINE' ? 'success' : (lb.operating_status === 'ERROR' ? 'danger' : 'warning')}
                                    />
                                </td>
                                <td>{lb.membersCount != null ? lb.membersCount : (lb.members || []).length}</td>
                                <td className="text-right actions">
                                    <a
                                        href="#"
                                        title="Edit"
                                        className="btn btn-sm btn-link btn-link-icon"
                                        onClick={e => { e.preventDefault(); setSelectedLb(lb); setView('edit'); }}
                                    >
                                        <span className="btn-icon btn-icon-pencil"></span>
                                    </a>

                                    <a
                                        href="#"
                                        title="Delete"
                                        className="btn btn-sm btn-link btn-link-icon"
                                        onClick={e => { e.preventDefault(); setDeleteTarget(lb); }}
                                    >
                                        <span className="btn-icon btn-icon-trashcan"></span>
                                    </a>
                                </td>
                            </tr>
                        ))}
                        {lbs.length === 0 && (
                            <tr><td colSpan="6" className="text-center text-muted" style={{ padding: '40px 0' }}>No Load Balancers found. Click "+ ADD" to create one.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();
