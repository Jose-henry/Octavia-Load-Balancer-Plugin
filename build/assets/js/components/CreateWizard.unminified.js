; (function () {

    const CreateWizard = ({ networkId, options, onCreated, onClose }) => {
        const Api = window.Octavia.api;
        const { Field, Badge } = window.Octavia; // Moved inside
        const { Step1_Details, Step2_Listener, Step3_Pool, Step4_Members, Step5_Monitor } = window.Octavia.Steps; // Moved inside

        const [step, setStep] = React.useState(1);
        const [validationMsg, setValidationMsg] = React.useState('');
        const [data, setData] = React.useState({
            networkId,
            createListener: true,
            createPool: true,
            createMonitor: true,
            listenerProtocol: 'HTTP', listenerPort: 80,
            poolProtocol: 'HTTP', poolAlgorithm: 'ROUND_ROBIN',
            monitorType: 'HTTP', members: []
        });
        const [loading, setLoading] = React.useState(false);

        const update = (k, v) => setData(p => ({ ...p, [k]: v }));

        // Auto-select first subnet
        React.useEffect(() => {
            if (options && options.subnets && options.subnets.length > 0 && !data.vipSubnetId) {
                // Assuming options.subnets is array of {name, value} or similar
                update('vipSubnetId', options.subnets[0].value);
            }
        }, [options]);

        const validateStep = (s) => {
            if (s === 1) {
                if (!data.name || !data.name.trim()) return "Name is required.";
                if (!data.vipSubnetId) return "VIP Subnet is required.";
            }
            if (s === 2 && data.createListener) {
                if (!data.listenerName || !data.listenerName.trim()) return "Listener Name is required.";
                if (!data.listenerProtocol) return "Listener Protocol is required.";
                if (!data.listenerPort) return "Listener Port is required.";
            }
            if (s === 3 && data.createPool) {
                if (!data.poolName || !data.poolName.trim()) return "Pool Name is required.";
                if (data.sessionPersistence === 'APP_COOKIE' && (!data.cookieName || !data.cookieName.trim())) return "Cookie Name is required.";
            }
            if (s === 5 && data.createMonitor) {
                if (!data.monitorName || !data.monitorName.trim()) return "Monitor Name is required.";
                if (!data.monitorType) return "Monitor Type is required.";
                if (!data.delay) return "Delay is required.";
                if (!data.timeout) return "Timeout is required.";
                if (!data.maxRetries) return "Max Retries is required.";
            }
            return null;
        };

        const handleNext = () => {
            const err = validateStep(step);
            if (err) {
                setValidationMsg(err);
                return;
            }
            setValidationMsg('');
            setStep(step + 1);
        };

        const handlePrevious = () => {
            setValidationMsg('');
            setStep(step - 1);
        };

        const handleTabClick = (targetStep) => {
            if (targetStep > step) {
                // If trying to jump forward, validate current step first
                const err = validateStep(step);
                if (err) {
                    setValidationMsg(err);
                    return;
                }
            }
            setValidationMsg('');
            setStep(targetStep);
        };

        const submit = () => {
            const err = validateStep(5);
            if (err) {
                setValidationMsg(err);
                return;
            }
            setValidationMsg('');
            setLoading(true);
            window.Octavia.api.createLoadBalancer(data)
                .then(() => {
                    setLoading(false);
                    onCreated();
                })
                .catch(e => {
                    setLoading(false);
                    setValidationMsg('Error: ' + e.message);
                });
        };

        const renderStep = () => {
            switch (step) {
                case 1: return React.createElement(
                                 Step1_Details,
                                 {data: data, update: update, options: options}
                               );
                case 2: return React.createElement(
                                 Step2_Listener,
                                 {data: data, update: update}
                               );
                case 3: return React.createElement(
                                 Step3_Pool,
                                 {data: data, update: update}
                               );
                case 4: return React.createElement(
                                 Step4_Members,
                                 {data: data, update: update, options: options}
                               );
                case 5: return React.createElement(
                                 Step5_Monitor,
                                 {data: data, update: update}
                               );
                default: return React.createElement(
                                  "div",
                                  null,
                                  "Unknown Step"
                                );
            }
        };

        return (
            React.createElement(
              "div",
              {className: "modal fade in", style: { display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', overflowY: 'auto' }},
              React.createElement(
                "div",
                {className: "modal-dialog modal-lg"},
                React.createElement(
                  "div",
                  {className: "modal-content"},
                  React.createElement(
                    "div",
                    {className: "modal-header"},
                    React.createElement(
                      "button",
                      {type: "button", className: "close", "data-dismiss": "modal", "aria-label": "Close", onClick: onClose},
                      React.createElement(
                        "span",
                        {"aria-hidden": "true"},
                        React.createElement(
                          "svg",
                          {version: "1.1", className: "close-icon", xmlns: "http://www.w3.org/2000/svg", xmlnsXlink: "http://www.w3.org/1999/xlink", x: "0px", y: "0px", viewBox: "0 0 59.9 59.9", enableBackground: "new 0 0 59.9 59.9", xmlSpace: "preserve"},
                          React.createElement(
                            "line",
                            {fill: "none", stroke: "currentColor", strokeMiterlimit: "10", x1: "57.4", y1: "2.5", x2: "2.5", y2: "57.4"}
                          ),
                          React.createElement(
                            "line",
                            {fill: "none", stroke: "currentColor", strokeMiterlimit: "10", x1: "2.5", y1: "2.5", x2: "57.4", y2: "57.4"}
                          )
                        )
                      )
                    ),
                    React.createElement(
                      "h4",
                      {className: "modal-title"},
                      "Create Load Balancer"
                    )
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-body"},
                    validationMsg && React.createElement(
                   "div",
                   {className: "alert alert-danger", style: { padding: '10px 15px', marginBottom: 20 }},
                   validationMsg
                 ),
                    React.createElement(
                      "ul",
                      {className: "nav nav-pills nav-justified", style: { marginBottom: 20 }},
                      React.createElement(
                        "li",
                        {className: step === 1 ? 'active' : ''},
                        React.createElement(
                          "a",
                          {onClick: () => handleTabClick(1)},
                          "1. Details"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: step === 2 ? 'active' : ''},
                        React.createElement(
                          "a",
                          {onClick: () => handleTabClick(2)},
                          "2. Listener"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: step === 3 ? 'active' : ''},
                        React.createElement(
                          "a",
                          {onClick: () => handleTabClick(3)},
                          "3. Pool"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: step === 4 ? 'active' : ''},
                        React.createElement(
                          "a",
                          {onClick: () => handleTabClick(4)},
                          "4. Members"
                        )
                      ),
                      React.createElement(
                        "li",
                        {className: step === 5 ? 'active' : ''},
                        React.createElement(
                          "a",
                          {onClick: () => handleTabClick(5)},
                          "5. Monitor"
                        )
                      )
                    ),
                    renderStep()
                  ),
                  React.createElement(
                    "div",
                    {className: "modal-footer"},
                    React.createElement(
                      "button",
                      {className: "btn btn-default", onClick: onClose},
                      "Cancel"
                    ),
                    step > 1 && React.createElement(
              "button",
              {className: "btn btn-default", onClick: handlePrevious},
              "Previous"
            ),
                    step < 5 && React.createElement(
              "button",
              {className: "btn btn-primary", onClick: handleNext},
              "Next"
            ),
                    step === 5 && React.createElement(
                "button",
                {className: "btn btn-success", onClick: submit, disabled: loading},
                loading ? 'Creating...' : 'Create Load Balancer'
              )
                  )
                )
              )
            )
        );
    };

    window.Octavia.CreateWizard = CreateWizard;
})();

