; (function () {
    const InstanceView = ({ instanceId }) => {
        const Api = window.Octavia.api;
        const { Badge, useAsync } = window.Octavia;

        const lbState = useAsync(() => Api.listLoadBalancers({ instanceId }), [instanceId])

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
        if (lbs.length === 0) return <div className="alert alert-info">This instance is not a member of any Load Balancers.</div>

        return (
            <div className="container-fluid" style={{ padding: '0 12px' }}>
                <h4 style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', color: '#2d6ca2', marginBottom: 15 }}>Load balancers associated with this instance</h4>
                <p className="text-muted" style={{ marginBottom: 15, fontSize: '0.9em' }}>This instance is a pool member of the following load balancers. Click a name to manage it on the Network detail page.</p>
                <div className="table-responsive">
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr style={{ textTransform: 'uppercase', fontSize: '0.85em', fontWeight: 600 }}>
                                <th>Name</th>
                                <th>VIP</th>
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
                                        <a href={'/infrastructure/networks/' + (lb.networkId || '') + '#!octavia-network-tab'}
                                            style={{ fontWeight: 'bold', color: '#2d6ca2', textDecoration: 'none' }}
                                            title="View in Network detail Octavia tab">
                                            {lb.name}
                                        </a>
                                    </td>
                                    <td>{lb.vip_address}</td>
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
                                        <a href={'/infrastructure/networks/' + (lb.networkId || '')} style={{ color: '#2d6ca2' }}>
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
