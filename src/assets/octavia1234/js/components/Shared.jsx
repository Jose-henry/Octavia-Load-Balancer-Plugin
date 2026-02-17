// Attach to global window.Octavia namespace
window.Octavia = window.Octavia || {};

window.Octavia.Badge = ({ text, tone = 'info' }) =>
    <span className={`label label-${tone}`} style={{ marginRight: 6, borderRadius: 3, padding: '3px 8px', fontSize: '0.8em' }}>{text}</span>;

window.Octavia.Field = ({ label, children, help, required }) => (
    <div className="form-group">
        <label className="control-label">{label}{required ? <span className="text-danger"> *</span> : null}</label>
        {children}
        {help ? <div className="help-block">{help}</div> : null}
    </div>
);

window.Octavia.Toast = ({ msg, type, onClose }) => {
    React.useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);
    const color = type === 'error' ? '#f2dede' : '#dff0d8';
    const text = type === 'error' ? '#a94442' : '#3c763d';
    return (
        <div style={{
            position: 'fixed', top: 20, right: 20, zIndex: 9999,
            backgroundColor: color, color: text, padding: '10px 20px',
            borderRadius: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center'
        }}>
            <span style={{ marginRight: 10 }}>{msg}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'inherit' }}>&times;</button>
        </div>
    );
};
