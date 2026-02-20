const DeleteConfirmModal = ({ lb, onClose, onConfirm, loading }) => (
    <div className="modal fade in" style={{ display: 'block' }}>
        <div className="modal-dialog">
            <div className="modal-content">
                <div className="modal-header">
                    <button type="button" className="close" onClick={onClose} data-dismiss="modal" aria-label="Close">
                        <span aria-hidden="true">
                            <svg version="1.1" className="close-icon" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 59.9 59.9" enableBackground="new 0 0 59.9 59.9" xmlSpace="preserve">
                                <line fill="none" stroke="currentColor" strokeMiterlimit="10" x1="57.4" y1="2.5" x2="2.5" y2="57.4"></line>
                                <line fill="none" stroke="currentColor" strokeMiterlimit="10" x1="2.5" y1="2.5" x2="57.4" y2="57.4"></line>
                            </svg>
                        </span>
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
