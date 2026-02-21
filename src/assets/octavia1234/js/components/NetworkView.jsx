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

        const lbState = useAsync(() => Api.listLoadBalancers({ networkId }), [networkId, toast]);

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
        if (lbState.loading) return <div style={{ padding: 20 }}><i className="fa fa-spinner fa-spin"></i> Loading...</div>;

        const lbs = lbState.data.loadbalancers || [];

        const handleDelete = () => {
            setDeleting(true);
            Api.deleteLoadBalancer(deleteTarget.id, networkId).then(() => {
                setDeleting(false);
                setDeleteTarget(null);
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
                {view === 'create' && <CreateWizardComp networkId={networkId} options={{ ...options, subnets }} onClose={() => setView('list')} onCreated={() => { setView('list'); }} />}
                {view === 'edit' && selectedLb && <EditLBModalComp lb={selectedLb} networkId={networkId} options={{ ...options, subnets }} onClose={() => { setSelectedLb(null); setView('list'); }} onUpdated={() => { setSelectedLb(null); setView('list'); }} />}

                {/* Toolbar — ADD button */}
                {view === 'list' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
                        <button className="btn btn-primary" onClick={() => setView('create')}>
                            + ADD
                        </button>
                    </div>
                )}

                {/* Load Balancers Table — uses native Morpheus table classes */}
                {view === 'list' && (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>NAME</th>
                                <th>VIP</th>
                                <th>STATUS</th>
                                <th>MEMBERS</th>
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
                                </tr>
                            ))}
                            {lbs.length === 0 && (
                                <tr><td colSpan="4" className="text-center text-muted" style={{ padding: '40px 0' }}>No Load Balancers found. Click "+ ADD" to create one.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();
