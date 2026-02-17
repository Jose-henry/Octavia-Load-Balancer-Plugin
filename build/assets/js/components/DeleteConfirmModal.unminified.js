const DeleteConfirmModal = ({ lb, onClose, onConfirm, loading }) => (
    React.createElement(
      "div",
      {className: "modal fade in", style: { display: 'block' }},
      React.createElement(
        "div",
        {className: "modal-dialog"},
        React.createElement(
          "div",
          {className: "modal-content"},
          React.createElement(
            "div",
            {className: "modal-header"},
            React.createElement(
              "button",
              {type: "button", className: "close", onClick: onClose},
              React.createElement(
                "img",
                {src: "/assets/octavia1234/images/times.svg", style: { width: 12, height: 12 }, alt: "Close"}
              )
            ),
            React.createElement(
              "h4",
              {className: "modal-title"},
              "Delete Load Balancer"
            )
          ),
          React.createElement(
            "div",
            {className: "modal-body"},
            React.createElement(
              "p",
              null,
              "Are you sure you want to delete",
              React.createElement(
                "strong",
                null,
                lb.name
              ),
              "?"
            ),
            React.createElement(
              "p",
              {className: "text-muted"},
              React.createElement(
                "small",
                null,
                "This action cannot be undone."
              )
            ),
            loading && React.createElement(
             "div",
             {className: "text-center"},
             React.createElement(
               "i",
               {className: "fa fa-spinner fa-spin"}
             ),
             " Deleting..."
           )
          ),
          React.createElement(
            "div",
            {className: "modal-footer"},
            React.createElement(
              "button",
              {className: "btn btn-link", onClick: onClose, disabled: loading},
              "Cancel"
            ),
            React.createElement(
              "button",
              {className: "btn btn-danger", onClick: onConfirm, disabled: loading},
              "Delete"
            )
          )
        )
      ),
      React.createElement(
        "div",
        {className: "modal-backdrop fade in"}
      )
    )
);

// Expose to global
window.Octavia = window.Octavia || {};
window.Octavia.DeleteConfirmModal = DeleteConfirmModal;

