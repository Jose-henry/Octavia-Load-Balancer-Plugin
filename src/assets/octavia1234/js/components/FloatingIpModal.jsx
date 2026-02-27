; (function () {
    const FloatingIpModal = ({ lb, options, onClose, onAttach }) => {
        const [selection, setSelection] = React.useState('');
        const [submitting, setSubmitting] = React.useState(false);

        const pools = options?.floatingIpPools || options?.optionFloatingIpPools || [];
        const ips = options?.availableFloatingIps || [];

        React.useEffect(() => {
            // Preselect first pool if available
            if (!selection) {
                const first = (pools[0]?.value) || (ips[0]?.value) || '';
                if (first) setSelection(first);
            }
        }, [pools, ips]);

        return (
            <div
                className="modal fade in"
                style={{
                    display: 'block',
                    backgroundColor: 'rgba(0,0,0,0.5)'
                }}
            >
                <div className="modal-dialog" style={{ width: 640 }}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <button type="button" className="close" onClick={onClose} aria-label="Close">
                                <span aria-hidden="true">
                                    <svg version="1.1" className="close-icon" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink"
                                        x="0px" y="0px" viewBox="0 0 59.9 59.9" enableBackground="new 0 0 59.9 59.9" xmlSpace="preserve">
                                        <line fill="none" stroke="currentcolor" strokeMiterlimit="10" x1="57.4" y1="2.5" x2="2.5" y2="57.4" />
                                        <line fill="none" stroke="currentcolor" strokeMiterlimit="10" x1="2.5" y1="2.5" x2="57.4" y2="57.4" />
                                    </svg>
                                </span>
                            </button>
                            <h4 className="modal-title">Attach Floating IP</h4>
                        </div>

                        <div className="modal-body">
                            <div className="text-center" style={{ marginBottom: 15 }}>
                                Are you sure you would like to attach this floating IP?
                            </div>

                            <div className="form-horizontal form-basic">
                                <div className="form-group">
                                    <div className="option-row">
                                        <label className="control-label col-sm-3">Floating IP</label>
                                        <div className="col-sm-9 option-type-input-row option-type-row-wrapper">
                                            <span className="required-bar"></span>
                                            <select
                                                className="form-control input-sm"
                                                value={selection}
                                                onChange={(e) => setSelection(e.target.value)}
                                            >
                                                {pools.length > 0 && (
                                                    <optgroup label="Pools">
                                                        {pools.map(p => (
                                                            <option key={p.value} value={p.value}>{p.name}</option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {ips.length > 0 && (
                                                    <optgroup label="Available IPs">
                                                        {ips.map(ip => (
                                                            <option key={ip.value} value={ip.value}>{ip.name}</option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {pools.length === 0 && ips.length === 0 && (
                                                    <option value="">No floating IP pools or IPs available</option>
                                                )}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-primary" onClick={onClose} disabled={submitting}>Cancel</button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    setSubmitting(true);
                                    Promise.resolve(onAttach(selection))
                                        .finally(() => setSubmitting(false));
                                }}
                                disabled={!selection || submitting}
                            >
                                {submitting ? 'Loading...' : 'Execute'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    window.Octavia.FloatingIpModal = FloatingIpModal;
})();

