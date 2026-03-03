; (function () {
    const InstanceView = ({ instanceId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync } = window.Octavia;

        const [reloadKey, setReloadKey] = React.useState(0);
        const lbState = useAsync(() => Api.listLoadBalancers({ instanceId }), [instanceId, reloadKey]);

        // Revalidate periodically so changes made on Network tab (or elsewhere) show up without reload
        React.useEffect(() => {
            if (!instanceId) return;
            const id = setInterval(() => setReloadKey(k => k + 1), 30 * 1000);
            return () => clearInterval(id);
        }, [instanceId]);

        if (lbState.error) return <div className="alert alert-danger">{lbState.error.message}</div>
        if (lbState.loading) {
            return (
                <div className="loading-mask">
                    <div className="text-center">
                        <div className="ajax-loader"></div>
                    </div>
                </div>
            )
        }
        const lbs = lbState.data?.loadbalancers || []
        if (lbs.length === 0) return (
            <div className="container-fluid" style={{ padding: '0 12px' }}>
                <h4>Load balancers associated with this instance</h4>
                <p className="text-muted">This instance is a pool member of the following load balancers. Click a name to manage it on the Network detail page.</p>
                <button type="button" className="btn btn-default btn-sm" onClick={() => setReloadKey(k => k + 1)}>Refresh</button>
                <div className="alert alert-info" style={{ marginTop: '12px' }}>This instance is not a member of any Load Balancers.</div>
            </div>
        );

        return (
            <div className="container-fluid" style={{ padding: '0 12px' }}>
                <h4>Load balancers associated with this instance</h4>
                <p className="text-muted">This instance is a pool member of the following load balancers. Click a name to manage it on the Network detail page.</p>
                <button type="button" className="btn btn-default btn-sm" onClick={() => setReloadKey(k => k + 1)} style={{ marginBottom: '12px' }}>Refresh</button>
                <div className="table-responsive">
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>VIP</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Operating</th>
                                <th>Members</th>
                                <th>Network</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lbs.map(lb => (
                                <tr key={lb.id}>
                                    <td>
                                        <a href={'/infrastructure/networks/' + (lb.networkId || '') + '#!load-balancer-network-tab'}
                                            title="View in Network detail Load Balancers tab">
                                            {lb.name}
                                        </a>
                                    </td>
                                    <td>{lb.vip_display || lb.vip_address}</td>
                                    <td>{lb.description || ''}</td>
                                    <td>
                                        <Badge
                                            text={lb.provisioning_status || 'ACTIVE'}
                                            tone={(lb.provisioning_status || 'ACTIVE') === 'ACTIVE' ? 'success' : (lb.provisioning_status === 'ERROR' ? 'danger' : 'warning')}
                                        />
                                    </td>
                                    <td>
                                        <Badge
                                            text={lb.operating_status || 'UNKNOWN'}
                                            tone={lb.operating_status === 'ONLINE' ? 'success' : (lb.operating_status === 'ERROR' ? 'danger' : 'warning')}
                                        />
                                    </td>
                                    <td>{lb.membersCount != null ? lb.membersCount : (lb.members || []).length}</td>
                                    <td>
                                        <a href={'/infrastructure/networks/' + (lb.networkId || '')}
                                            title="View network Load Balancers tab">
                                            {lb.networkName || 'View Network'}
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    window.Octavia.InstanceView = InstanceView;
})();
