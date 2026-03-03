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
        const [inlineLbs, setInlineLbs] = React.useState(null);
        const [floatingTarget, setFloatingTarget] = React.useState(null);
        const [pollUntil, setPollUntil] = React.useState(null);
        const [page, setPage] = React.useState(1);

        const PAGE_SIZE = 4;
        const lbState = useAsync(
            () => Api.listLoadBalancers({ networkId, max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
            [networkId, reloadKey, page]
        );

        // After create or update: poll list every 30s so status (PENDING_* -> ACTIVE) updates without manual refresh
        const POLL_INTERVAL_MS = 30 * 1000;
        const POLL_DURATION_MS = 2 * 60 * 1000; // 2 min
        React.useEffect(() => {
            if (!pollUntil || !networkId) return;
            const poll = () => {
                Api.listLoadBalancers({ networkId, max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).then(r => {
                    const list = r.loadbalancers || r.data?.loadbalancers || [];
                    setInlineLbs(list);
                }).catch(() => {});
            };
            const id = setInterval(() => {
                if (Date.now() >= pollUntil) {
                    clearInterval(id);
                    setPollUntil(null);
                    setInlineLbs(null);
                    setReloadKey(k => k + 1);
                    return;
                }
                poll();
            }, POLL_INTERVAL_MS);
            poll();
            return () => clearInterval(id);
        }, [pollUntil, networkId, page]);

        // Fetch options when wizard or edit is opened
        React.useEffect(() => {
            if (showWizard || showEdit) {
                const ctx = { networkId };

                Api.getSubnets(networkId).then(res => {
                    const mapped = (res?.data || []).map(s => ({ name: s.name, value: s.value, cidr: s.cidr, id: s.id, externalId: s.externalId }));
                    setSubnets(mapped);
                }).catch(e => console.error("Error fetching subnets:", e));

                Api.getProjects(ctx).then(res => {
                    setOptions(o => ({ ...o, optionProjects: res.data || [], optionClouds: res.optionClouds || [], optionResourcePools: res.resourcePools || [] }));
                }).catch(e => console.error(e));

                Api.getInstances(ctx).then(res => {
                    setOptions(o => ({ ...o, instances: res.data || [] }));
                }).catch(e => console.error(e));

                Api.getFloatingIpPools(ctx).then(res => {
                    setOptions(o => ({ ...o, floatingIpPools: res.floatingIpPools || [], availableFloatingIps: res.availableFloatingIps || [] }));
                }).catch(e => console.error(e));
            }
        }, [showWizard, showEdit, networkId]);

        // Background-fetch floating IP pools once per network so the cog modal opens fast
        React.useEffect(() => {
            const ctx = { networkId };
            Api.getFloatingIpPools(ctx).then(res => {
                setOptions(o => ({ ...o, floatingIpPools: res.floatingIpPools || [], availableFloatingIps: res.availableFloatingIps || [] }));
            }).catch(e => console.error(e));
        }, [networkId]);

        // Clamp page to totalPages when total changes; only when not loading so we don't reset page during refetch (fixes next-page flip-back)
        const totalFromData = lbState.data?.total != null ? lbState.data.total : (lbState.data?.loadbalancers || []).length;
        const totalPagesStable = Math.max(1, Math.ceil(totalFromData / PAGE_SIZE));
        React.useEffect(() => {
            if (!lbState.loading) setPage(p => Math.min(p, totalPagesStable));
        }, [totalPagesStable, lbState.loading]);

        if (lbState.error) return <div className="alert alert-danger">{lbState.error.message}</div>;
        // Full loading mask only when we have no data (initial load). When changing page, keep showing current page until fetch completes.
        const hasDataToShow = inlineLbs || (lbState.data && (lbState.data.loadbalancers?.length || lbState.data.total === 0));
        if (lbState.loading && !hasDataToShow) {
            return (
                <div className="loading-mask">
                    <div className="text-center">
                        <div className="ajax-loader"></div>
                    </div>
                </div>
            );
        }

        const lbs = inlineLbs || lbState.data?.loadbalancers || [];
        const total = lbState.data?.total != null ? lbState.data.total : lbs.length;
        const MAX_PAGE_BUTTONS = 6;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const currentPage = Math.min(Math.max(1, page), totalPages);
        const pageLbs = lbs;

        const handleDelete = () => {
            setDeleting(true);
            Api.deleteLoadBalancer(deleteTarget.id, networkId).then(() => {
                setDeleting(false);
                setDeleteTarget(null);
                setInlineLbs(null); // so list shows refetched data, not stale poll cache
                setReloadKey(k => k + 1);
                setToast({ msg: 'Load Balancer deleted successfully.', type: 'success' });
            });
        };

        const CreateWizardComp = window.Octavia.CreateWizard;
        const EditLBModalComp = window.Octavia.EditLBModal;
        const DeleteConfirmModalComp = window.Octavia.DeleteConfirmModal;
        const FloatingIpModalComp = window.Octavia.FloatingIpModal;

        return (
            <div>
                {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
                {deleteTarget && <DeleteConfirmModalComp lb={deleteTarget} loading={deleting} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />}
                {floatingTarget && (
                    <FloatingIpModalComp
                        lb={floatingTarget}
                        options={options}
                        onClose={() => setFloatingTarget(null)}
                        onAttach={(selection) => {
                            return Api.attachFloatingIp(floatingTarget.id, selection, networkId)
                                .then(() => {
                                    setFloatingTarget(null);
                                    setReloadKey(k => k + 1);
                                    setToast({ msg: 'Floating IP attached successfully.', type: 'success' });
                                })
                                .catch(err => {
                                    setToast({ msg: err.message || 'Failed to attach Floating IP.', type: 'danger' });
                                });
                        }}
                    />
                )}
                {view === 'create' && (
                    <CreateWizardComp
                        networkId={networkId}
                        options={{ ...options, subnets }}
                        onClose={() => setView('list')}
                        onCreated={() => {
                            setView('list');
                            setReloadKey(k => k + 1);
                            setToast({ msg: 'Load Balancer created.', type: 'success' });
                            setPollUntil(Date.now() + POLL_DURATION_MS);
                        }}
                    />
                )}
                {view === 'edit' && selectedLb && <EditLBModalComp lb={selectedLb} networkId={networkId} options={{ ...options, subnets }} onClose={() => { setSelectedLb(null); setView('list'); }} onUpdated={() => { setSelectedLb(null); setView('list'); setReloadKey(k => k + 1); setToast({ msg: 'Load balancer updated.', type: 'success' }); setPollUntil(Date.now() + POLL_DURATION_MS); }} />}

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
                            <th>DESCRIPTION</th>
                            <th>STATUS</th>
                            <th>OPERATING</th>
                            <th>MEMBERS</th>
                            <th className="text-right">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageLbs.map(lb => (
                            <tr key={lb.id}>
                                <td>{lb.name}</td>
                                <td>{lb.vip_display || lb.vip_address}</td>
                                <td>{lb.description || ''}</td>
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

                                    <div className="dropdown" style={{ display: 'inline-block', marginLeft: 4 }}>
                                        <a
                                            href="#"
                                            className="btn btn-sm btn-link btn-link-icon"
                                            data-toggle="dropdown"
                                            aria-haspopup="true"
                                            aria-expanded="false"
                                            onClick={e => e.preventDefault()}
                                        >
                                            <span className="glyphicon glyphicon-cog"></span>
                                            <span className="caret"></span>
                                        </a>

                                        <ul
                                            className="dropdown-menu view-options dropdown-menu-right"
                                            role="menu"
                                            aria-labelledby="dlabel"
                                            data-key="view-options"
                                        >
                                            {lb.vip_floating ? (
                                                <li>
                                                    <a
                                                        href="#"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            Api.detachFloatingIp(lb.id, networkId)
                                                                .then(() => {
                                                                    setReloadKey(k => k + 1);
                                                                    setToast({ msg: 'Floating IP detached successfully.', type: 'success' });
                                                                })
                                                                .catch(err => {
                                                                    setToast({ msg: err.message || 'Failed to detach Floating IP.', type: 'danger' });
                                                                });
                                                        }}
                                                    >
                                                        Detach Floating IP
                                                    </a>
                                                </li>
                                            ) : (
                                                <li>
                                                    <a
                                                        href="#"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            // Open modal immediately; background options are already prefetched
                                                            setFloatingTarget(lb);
                                                        }}
                                                    >
                                                        Attach Floating IP
                                                    </a>
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {pageLbs.length === 0 && (
                            <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '40px 0' }}>No Load Balancers found. Click "+ ADD" to create one.</td></tr>
                        )}
                    </tbody>
                </table>

                {/* Pagination below table — compact styling; show subtle loading when fetching next page */}
                {lbs.length > 0 && (
                    <div className="octavia-paging" style={{ display: 'flex', alignItems: 'center', marginTop: '10px', gap: '4px', flexWrap: 'wrap', fontSize: '12px' }}>
                        {lbState.loading && <span className="text-muted" style={{ marginRight: '8px', fontStyle: 'italic' }}>Loading…</span>}
                        <span className="text-muted" style={{ marginRight: '6px' }}>Page {currentPage} of {totalPages}</span>
                        {currentPage > 1 && (
                            <button type="button" style={{ padding: '2px 6px', fontSize: '12px', minWidth: '26px' }} className="btn btn-default btn-sm" onClick={() => setPage(1)} title="First page">
                                <span className="glyphicon glyphicon-step-backward" />
                            </button>
                        )}
                        {(() => {
                            let startPage = Math.max(1, currentPage - 2);
                            let endPage = Math.min(totalPages, startPage + MAX_PAGE_BUTTONS - 1);
                            if (endPage - startPage + 1 < MAX_PAGE_BUTTONS && endPage === totalPages) startPage = Math.max(1, endPage - MAX_PAGE_BUTTONS + 1);
                            const pages = [];
                            for (let i = startPage; i <= endPage; i++) pages.push(i);
                            return pages.map((p) => (
                                p === currentPage
                                    ? <span key={p} style={{ padding: '2px 6px', fontSize: '12px', minWidth: '26px', marginRight: '2px', display: 'inline-block', textAlign: 'center', border: '1px solid #ccc', borderRadius: '3px', background: '#f5f5f5' }}>{p}</span>
                                    : <button key={p} type="button" style={{ padding: '2px 6px', fontSize: '12px', minWidth: '26px' }} className="btn btn-default btn-sm" onClick={() => setPage(p)}>{p}</button>
                            ));
                        })()}
                        {currentPage < totalPages && (
                            <button type="button" style={{ padding: '2px 6px', fontSize: '12px', minWidth: '26px' }} className="btn btn-default btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} title="Next page">
                                <span className="glyphicon glyphicon-step-forward" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    window.Octavia.NetworkView = NetworkView;
})();
