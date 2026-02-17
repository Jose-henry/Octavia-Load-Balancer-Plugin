const DeleteConfirmModal = ({ lb, onClose, onConfirm, loading }) => (
    <div className="modal fade in" style={{ display: 'block' }}>
        <div className="modal-dialog">
            <div className="modal-content">
                <div className="modal-header">
                    <button type="button" className="close" onClick={onClose}>
                        <img src="/assets/octavia1234/images/times.svg" style={{ width: 12, height: 12 }} alt="Close" />
                    </button>
                    <h4 className="modal-title">Delete Load Balancer</h4>
                </div>
                <div className="modal-body">
                    <p>Are you sure you want to delete <strong>{lb.name}</strong>?</p>
                    <p className="text-muted"><small>This action cannot be undone.</small></p>
                    {loading && <div className="text-center"><i className="fa fa-spinner fa-spin"></i> Deleting...</div>}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-link" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>Delete</button>
                </div>
            </div>
        </div>
        <div className="modal-backdrop fade in"></div>
    </div>
);

// Expose to global
window.Octavia = window.Octavia || {};
window.Octavia.DeleteConfirmModal = DeleteConfirmModal;
