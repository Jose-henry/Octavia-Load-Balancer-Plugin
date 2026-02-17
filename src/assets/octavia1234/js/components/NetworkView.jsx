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
                {view === 'create' && <CreateWizardComp networkId={networkId} options={options} onClose={() => setView('list')} onCreated={() => { setView('list'); setToast({ msg: 'Load Balancer created.', type: 'success' }); }} />}
                {view === 'edit' && selectedLb && <EditLBModalComp lb={selectedLb} networkId={networkId} onClose={() => { setSelectedLb(null); setView('list'); }} onUpdated={() => { setSelectedLb(null); setView('list'); setToast({ msg: 'Load Balancer updated.', type: 'success' }); }} />}

                {/* Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 15, padding: '0 5px' }}>
                    <button className="btn" style={{ backgroundColor: '#f9c600', color: '#000', border: 'none', fontWeight: 600, textTransform: 'uppercase', padding: '6px 14px', fontSize: '0.85em' }} onClick={() => setView('create')}>
                        <i className="fa fa-plus" style={{ marginRight: 5 }}></i> Add
                    </button>
                </div>

                {/* Table */}
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
                                    <button className="btn btn-link btn-sm" style={{ marginRight: 6, padding: '3px 8px' }} title="Edit" onClick={() => { setSelectedLb(lb); setView('edit'); }}>
                                        <img src="/assets/octavia1234/images/pencil.svg" style={{ width: 14, height: 14 }} alt="Edit" />
                                    </button>
                                    <button className="btn btn-link btn-sm" style={{ padding: '3px 8px' }} title="Delete" onClick={() => setDeleteTarget(lb)}>
                                        <img src="/assets/octavia1234/images/trash.svg" style={{ width: 14, height: 14 }} alt="Delete" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {lbs.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>No Load Balancers found. Click "+ Add" to create one.</div>}
            </div>
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();
