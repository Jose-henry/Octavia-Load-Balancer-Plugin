// Attach to global window.Octavia namespace
window.Octavia = window.Octavia || {};

window.Octavia.Badge = ({ text, tone = 'info' }) =>
    React.createElement(
      "span",
      {className: `label label-${tone}`, style: { marginRight: 6, borderRadius: 3, padding: '3px 8px', fontSize: '0.8em' }},
      text
    );

window.Octavia.Field = ({ label, children, help, required }) => (
    React.createElement(
      "div",
      {className: "form-group"},
      React.createElement(
        "label",
        {className: "control-label"},
        label,
        required ? React.createElement(
             "span",
             {className: "text-danger"},
             " *"
           ) : null
      ),
      children,
      help ? React.createElement(
         "div",
         {className: "help-block"},
         help
       ) : null
    )
);

window.Octavia.Toast = ({ msg, type, onClose }) => {
    React.useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);
    const color = type === 'error' ? '#f2dede' : '#dff0d8';
    const text = type === 'error' ? '#a94442' : '#3c763d';
    return (
        React.createElement(
          "div",
          {style: {
            position: 'fixed', top: 20, right: 20, zIndex: 9999,
            backgroundColor: color, color: text, padding: '10px 20px',
            borderRadius: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center'
        }},
          React.createElement(
            "span",
            {style: { marginRight: 10 }},
            msg
          ),
          React.createElement(
            "button",
            {onClick: onClose, style: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'inherit' }},
            "&times;"
          )
        )
    );
};

