; (function () {
    const NetworkView = ({ networkId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync, Toast } = window.Octavia;

        const [view, setView] = React.useState('list');
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

                {/* Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15, padding: '0 5px' }}>
                    <button className="btn btn-primary" onClick={() => setView('create')}>
                        + ADD
                    </button>
                </div>

                {/* Table */}
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
            </div>
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();
